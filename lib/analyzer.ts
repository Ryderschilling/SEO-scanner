import * as cheerio from "cheerio";
import type { CheckResult, CategoryScore, AnalysisResult, PageSpeedData, SpeedScore } from "./types";

// ─── Utilities ───────────────────────────────────────────────────────────────

function scoreCategory(
  checks: CheckResult[],
  category: "seo" | "aeo" | "geo"
): CategoryScore {
  const relevant = checks.filter((c) => c.category === category);
  const earned = relevant.reduce((sum, c) => sum + c.score, 0);
  const max = relevant.reduce((sum, c) => sum + c.maxScore, 0);
  return { earned, max, percentage: max > 0 ? Math.round((earned / max) * 100) : 0 };
}

function getGrade(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function normalizeUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  return url;
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

async function fetchRobots(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOScanner/1.0)" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchSitemap(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOScanner/1.0)" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchPageSpeed(url: string): Promise<PageSpeedData> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : "";
  const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}${keyParam}`;

  const extractScore = (data: Record<string, unknown>): SpeedScore => {
    try {
      const lr = data.lighthouseResult as Record<string, unknown> | undefined;
      const audits = (lr?.audits ?? {}) as Record<string, { numericValue?: number }>;
      const perfScore = ((lr?.categories as Record<string, { score?: number }>)?.performance?.score ?? 0);
      return {
        score: Math.round(perfScore * 100),
        lcp: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
        cls: Math.round((audits["cumulative-layout-shift"]?.numericValue ?? 0) * 1000) / 1000,
        fcp: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
        tbt: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
      };
    } catch {
      return { score: 0, lcp: 0, cls: 0, fcp: 0, tbt: 0 };
    }
  };

  try {
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`${base}&strategy=mobile`, { signal: AbortSignal.timeout(12000) }),
      fetch(`${base}&strategy=desktop`, { signal: AbortSignal.timeout(12000) }),
    ]);

    const [mobileData, desktopData] = await Promise.all([
      mobileRes.json() as Promise<Record<string, unknown>>,
      desktopRes.json() as Promise<Record<string, unknown>>,
    ]);

    return {
      mobile: extractScore(mobileData),
      desktop: extractScore(desktopData),
    };
  } catch (err) {
    return {
      mobile: { score: 0, lcp: 0, cls: 0, fcp: 0, tbt: 0 },
      desktop: { score: 0, lcp: 0, cls: 0, fcp: 0, tbt: 0 },
      error: `PageSpeed fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── SEO Checks ──────────────────────────────────────────────────────────────

function checkTitle($: cheerio.CheerioAPI): CheckResult {
  const title = $("title").first().text().trim();
  const len = title.length;
  const passed = len >= 30 && len <= 60;
  let detail = "";
  let recommendation = "";
  if (!title) {
    detail = "No title tag found";
    recommendation = "Add a <title> tag. Keep it 30–60 characters, include your primary keyword near the front.";
  } else if (len < 30) {
    detail = `Title is only ${len} chars: "${title}"`;
    recommendation = `Your title is too short (${len} chars). Expand it to 30–60 chars with descriptive keywords.`;
  } else if (len > 60) {
    detail = `Title is ${len} chars: "${title}"`;
    recommendation = `Your title is too long (${len} chars). Google truncates at ~60. Tighten it up.`;
  } else {
    detail = `"${title}" (${len} chars)`;
    recommendation = "Title looks good.";
  }
  return {
    id: "seo_title",
    category: "seo",
    name: "Title Tag",
    passed,
    score: passed ? 5 : title ? 2 : 0,
    maxScore: 5,
    description: "Page title exists and is 30–60 characters",
    recommendation,
    detail,
  };
}

function checkMetaDescription($: cheerio.CheerioAPI): CheckResult {
  const desc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const len = desc.length;
  const passed = len >= 120 && len <= 160;
  let detail = "";
  let recommendation = "";
  if (!desc) {
    detail = "No meta description found";
    recommendation = "Add a meta description between 120–160 characters. Summarize the page and include a CTA or keyword.";
  } else if (len < 120) {
    detail = `Description is only ${len} chars`;
    recommendation = `Meta description is too short (${len} chars). Expand to 120–160 chars with keywords and a compelling summary.`;
  } else if (len > 160) {
    detail = `Description is ${len} chars (gets cut off in SERPs)`;
    recommendation = `Trim your meta description to 160 chars max. Currently ${len} chars — Google cuts it off in search results.`;
  } else {
    detail = `${len} chars — within optimal range`;
    recommendation = "Meta description looks good.";
  }
  return {
    id: "seo_meta_desc",
    category: "seo",
    name: "Meta Description",
    passed,
    score: passed ? 5 : desc ? 2 : 0,
    maxScore: 5,
    description: "Meta description exists and is 120–160 characters",
    recommendation,
    detail,
  };
}

function checkH1($: cheerio.CheerioAPI): CheckResult {
  const h1s = $("h1");
  const count = h1s.length;
  const passed = count === 1;
  let detail = "";
  let recommendation = "";
  if (count === 0) {
    detail = "No H1 tag found";
    recommendation = "Add exactly one H1 tag that clearly states the page topic. It should contain your primary keyword.";
  } else if (count > 1) {
    detail = `Found ${count} H1 tags`;
    recommendation = `You have ${count} H1 tags. Use exactly one H1 per page — it signals the primary topic to search engines.`;
  } else {
    detail = `"${h1s.first().text().trim().substring(0, 60)}"`;
    recommendation = "H1 looks good.";
  }
  return {
    id: "seo_h1",
    category: "seo",
    name: "H1 Tag",
    passed,
    score: passed ? 5 : count > 1 ? 2 : 0,
    maxScore: 5,
    description: "Exactly one H1 tag present",
    recommendation,
    detail,
  };
}

function checkHeadingStructure($: cheerio.CheerioAPI): CheckResult {
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const passed = h2Count >= 2;
  const detail = `${h2Count} H2s, ${h3Count} H3s found`;
  const recommendation = passed
    ? "Heading structure looks good."
    : `Only ${h2Count} H2 heading(s) found. Use multiple H2s to break content into scannable sections — helps both users and Google understand page structure.`;
  return {
    id: "seo_headings",
    category: "seo",
    name: "Heading Structure",
    passed,
    score: passed ? 3 : h2Count >= 1 ? 1 : 0,
    maxScore: 3,
    description: "At least 2 H2 subheadings present for structure",
    recommendation,
    detail,
  };
}

function checkImageAlts($: cheerio.CheerioAPI): CheckResult {
  const images = $("img");
  const total = images.length;
  if (total === 0) {
    return {
      id: "seo_img_alts",
      category: "seo",
      name: "Image Alt Tags",
      passed: true,
      score: 5,
      maxScore: 5,
      description: "All images have alt attributes",
      recommendation: "No images found on page.",
      detail: "No images detected",
    };
  }
  const missing = images.filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt === "";
  }).length;
  const passed = missing === 0;
  const detail = `${total - missing}/${total} images have alt text`;
  const recommendation = passed
    ? "All images have alt text."
    : `${missing} image(s) missing alt text. Add descriptive alt attributes — they help search engines index your images and improve accessibility.`;
  return {
    id: "seo_img_alts",
    category: "seo",
    name: "Image Alt Tags",
    passed,
    score: passed ? 5 : Math.round(((total - missing) / total) * 3),
    maxScore: 5,
    description: "All images have alt attributes",
    recommendation,
    detail,
  };
}

function checkCanonical($: cheerio.CheerioAPI): CheckResult {
  const canonical = $('link[rel="canonical"]').attr("href");
  const passed = !!canonical;
  return {
    id: "seo_canonical",
    category: "seo",
    name: "Canonical Tag",
    passed,
    score: passed ? 3 : 0,
    maxScore: 3,
    description: "Canonical URL tag present",
    recommendation: passed
      ? "Canonical tag is set."
      : 'Add <link rel="canonical" href="..."> to prevent duplicate content issues. Critical if your site has multiple URL variants (www vs non-www, http vs https, trailing slash, etc.).',
    detail: passed ? canonical : "Not found",
  };
}

function checkViewport($: cheerio.CheerioAPI): CheckResult {
  const viewport = $('meta[name="viewport"]').attr("content");
  const passed = !!viewport;
  return {
    id: "seo_viewport",
    category: "seo",
    name: "Mobile Viewport",
    passed,
    score: passed ? 3 : 0,
    maxScore: 3,
    description: 'Meta viewport tag present for mobile responsiveness',
    recommendation: passed
      ? "Viewport is set."
      : 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> — without it, Google\'s mobile-first indexing will penalize your rankings.',
    detail: passed ? viewport : "Not found",
  };
}

function checkHttps(url: string): CheckResult {
  const passed = url.startsWith("https://");
  return {
    id: "seo_https",
    category: "seo",
    name: "HTTPS",
    passed,
    score: passed ? 4 : 0,
    maxScore: 4,
    description: "Site uses HTTPS",
    recommendation: passed
      ? "Site is using HTTPS."
      : "Your site is not using HTTPS. Google has used HTTPS as a ranking signal since 2014. Get an SSL certificate — most hosts offer free Let's Encrypt certs.",
    detail: passed ? "Secure" : "Insecure HTTP",
  };
}

function checkSchema($: cheerio.CheerioAPI): CheckResult {
  const jsonLd = $('script[type="application/ld+json"]').length;
  const microdataItems = $("[itemscope]").length;
  const passed = jsonLd > 0 || microdataItems > 0;
  const detail =
    jsonLd > 0
      ? `${jsonLd} JSON-LD block(s) found`
      : microdataItems > 0
      ? `${microdataItems} Microdata item(s) found`
      : "No structured data found";
  return {
    id: "seo_schema",
    category: "seo",
    name: "Structured Data",
    passed,
    score: passed ? 5 : 0,
    maxScore: 5,
    description: "Schema.org structured data (JSON-LD or Microdata) present",
    recommendation: passed
      ? "Structured data found. Make sure it matches your page content and passes Google's Rich Results Test."
      : "No structured data found. Add JSON-LD schema markup (Organization, WebPage, Article, Product, etc.) to qualify for rich results in Google and get better AI engine understanding.",
    detail,
  };
}

function checkOpenGraph($: cheerio.CheerioAPI): CheckResult {
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const count = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  const passed = count === 3;
  const detail =
    count === 3
      ? "og:title, og:description, og:image all present"
      : `Only ${count}/3 core OG tags found`;
  return {
    id: "seo_og",
    category: "seo",
    name: "Open Graph Tags",
    passed,
    score: passed ? 4 : count > 0 ? 2 : 0,
    maxScore: 4,
    description: "Open Graph meta tags (title, description, image) present",
    recommendation: passed
      ? "Open Graph tags look complete."
      : `Missing OG tags: ${[!ogTitle && "og:title", !ogDesc && "og:description", !ogImage && "og:image"].filter(Boolean).join(", ")}. OG tags control how your page looks when shared on social and are used by AI engines for context.`,
    detail,
  };
}

function checkInternalLinks($: cheerio.CheerioAPI, url: string): CheckResult {
  const origin = getOrigin(url);
  let internalCount = 0;
  $("a[href]").each((_, el) => {
    const href = cheerio.load(el)("a").attr("href") ?? "";
    if (href.startsWith("/") || href.startsWith(origin)) internalCount++;
  });
  const passed = internalCount >= 3;
  return {
    id: "seo_internal_links",
    category: "seo",
    name: "Internal Links",
    passed,
    score: passed ? 3 : internalCount > 0 ? 1 : 0,
    maxScore: 3,
    description: "At least 3 internal links present",
    recommendation: passed
      ? `${internalCount} internal links found.`
      : `Only ${internalCount} internal link(s). Add more internal links to help Google crawl your site and distribute page authority. Link to related services/pages.`,
    detail: `${internalCount} internal links`,
  };
}

function checkRobots(hasRobots: boolean): CheckResult {
  return {
    id: "seo_robots",
    category: "seo",
    name: "robots.txt",
    passed: hasRobots,
    score: hasRobots ? 3 : 0,
    maxScore: 3,
    description: "robots.txt file accessible",
    recommendation: hasRobots
      ? "robots.txt found."
      : "No robots.txt found. Create one at /robots.txt to control how search engines crawl your site. Also add a Sitemap: directive pointing to your sitemap.",
    detail: hasRobots ? "Accessible" : "Not found",
  };
}

function checkSitemap(hasSitemap: boolean): CheckResult {
  return {
    id: "seo_sitemap",
    category: "seo",
    name: "XML Sitemap",
    passed: hasSitemap,
    score: hasSitemap ? 2 : 0,
    maxScore: 2,
    description: "sitemap.xml accessible",
    recommendation: hasSitemap
      ? "Sitemap found."
      : "No sitemap.xml found. Create and submit an XML sitemap to Google Search Console — it speeds up page indexing significantly.",
    detail: hasSitemap ? "Accessible" : "Not found",
  };
}

// ─── AEO Checks ──────────────────────────────────────────────────────────────

function checkFaqSchema($: cheerio.CheerioAPI): CheckResult {
  let hasFaq = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const types = Array.isArray(data)
        ? data.map((d) => d["@type"])
        : [data["@type"]];
      if (
        types.some(
          (t) =>
            t === "FAQPage" ||
            t === "QAPage" ||
            t === "Question"
        )
      ) {
        hasFaq = true;
      }
    } catch {
      // ignore parse errors
    }
  });
  return {
    id: "aeo_faq_schema",
    category: "aeo",
    name: "FAQ / Q&A Schema",
    passed: hasFaq,
    score: hasFaq ? 8 : 0,
    maxScore: 8,
    description: "FAQPage or QAPage JSON-LD schema present",
    recommendation: hasFaq
      ? "FAQ schema found — high value for featured snippets and AI answer boxes."
      : 'Add FAQPage JSON-LD schema. This is the #1 signal for appearing in Google\'s "People Also Ask" boxes and AI-generated answers. Add 4–6 real Q&A pairs relevant to your service.',
    detail: hasFaq ? "FAQPage/QAPage schema found" : "Not found",
  };
}

function checkQuestionHeadings($: cheerio.CheerioAPI): CheckResult {
  const questionHeadings: string[] = [];
  $("h2, h3").each((_, el) => {
    const text = cheerio.load(el)("*").text().trim();
    if (text.endsWith("?") || text.toLowerCase().startsWith("what ") || text.toLowerCase().startsWith("how ") || text.toLowerCase().startsWith("why ") || text.toLowerCase().startsWith("when ") || text.toLowerCase().startsWith("where ") || text.toLowerCase().startsWith("who ") || text.toLowerCase().startsWith("which ")) {
      questionHeadings.push(text.substring(0, 60));
    }
  });
  const passed = questionHeadings.length >= 2;
  const detail = questionHeadings.length > 0
    ? `${questionHeadings.length} question-format heading(s)`
    : "No question-format headings found";
  return {
    id: "aeo_question_headings",
    category: "aeo",
    name: "Question-Format Headings",
    passed,
    score: passed ? 6 : questionHeadings.length === 1 ? 3 : 0,
    maxScore: 6,
    description: "H2/H3 headings phrased as questions (What/How/Why/etc.)",
    recommendation: passed
      ? `${questionHeadings.length} question headings found — good for featured snippets.`
      : "Add question-format H2/H3 headings (e.g. 'How does X work?', 'What is Y?'). Google and AI engines pull these directly into featured snippets and answer boxes.",
    detail,
  };
}

function checkConciseParagraphs($: cheerio.CheerioAPI): CheckResult {
  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 20);
  if (paragraphs.length === 0) {
    return {
      id: "aeo_concise_paragraphs",
      category: "aeo",
      name: "Concise Paragraphs",
      passed: false,
      score: 0,
      maxScore: 5,
      description: "Paragraphs average under 60 words (snippet-friendly)",
      recommendation: "No meaningful paragraph content detected.",
      detail: "No paragraphs found",
    };
  }
  const wordCounts = paragraphs.map((p) => p.split(/\s+/).length);
  const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
  const passed = avgWords <= 60;
  return {
    id: "aeo_concise_paragraphs",
    category: "aeo",
    name: "Concise Paragraphs",
    passed,
    score: passed ? 5 : avgWords <= 90 ? 2 : 0,
    maxScore: 5,
    description: "Paragraphs average under 60 words (snippet-friendly)",
    recommendation: passed
      ? `Paragraphs average ${avgWords} words — concise and snippet-friendly.`
      : `Paragraphs average ${avgWords} words. Break long blocks into shorter paragraphs (under 60 words each). Google and AI engines prefer direct, scannable answers.`,
    detail: `Average ${avgWords} words per paragraph`,
  };
}

function checkLists($: cheerio.CheerioAPI): CheckResult {
  const ulCount = $("ul").length;
  const olCount = $("ol").length;
  const total = ulCount + olCount;
  const passed = total >= 2;
  return {
    id: "aeo_lists",
    category: "aeo",
    name: "Lists & Bullet Points",
    passed,
    score: passed ? 4 : total >= 1 ? 2 : 0,
    maxScore: 4,
    description: "At least 2 ordered or unordered lists present",
    recommendation: passed
      ? `${total} list(s) found — good for featured snippet eligibility.`
      : `Only ${total} list(s) found. Add bulleted or numbered lists for key information. Lists are the most common format Google pulls into 'list-type' featured snippets.`,
    detail: `${ulCount} unordered, ${olCount} ordered lists`,
  };
}

function checkTables($: cheerio.CheerioAPI): CheckResult {
  const tableCount = $("table").length;
  const passed = tableCount >= 1;
  return {
    id: "aeo_tables",
    category: "aeo",
    name: "Tables / Structured Data",
    passed,
    score: passed ? 4 : 0,
    maxScore: 4,
    description: "At least one HTML table present",
    recommendation: passed
      ? `${tableCount} table(s) found — tables are prime candidates for Google's table featured snippets.`
      : "Consider adding an HTML table for comparison data, pricing, specs, or FAQs. Tables get pulled directly into Google's table featured snippets.",
    detail: `${tableCount} table(s)`,
  };
}

function checkHowToSchema($: cheerio.CheerioAPI): CheckResult {
  let hasHowTo = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const types = Array.isArray(data)
        ? data.map((d) => d["@type"])
        : [data["@type"]];
      if (types.some((t) => t === "HowTo" || t === "Recipe" || t === "Article")) {
        hasHowTo = true;
      }
    } catch {
      // ignore
    }
  });
  return {
    id: "aeo_howto_schema",
    category: "aeo",
    name: "HowTo / Article Schema",
    passed: hasHowTo,
    score: hasHowTo ? 3 : 0,
    maxScore: 3,
    description: "HowTo or Article JSON-LD schema present",
    recommendation: hasHowTo
      ? "HowTo/Article schema found."
      : "If your page contains step-by-step instructions, add HowTo schema. If it's a blog or editorial page, add Article schema. Both qualify for enhanced Google results.",
    detail: hasHowTo ? "HowTo/Article schema found" : "Not found",
  };
}

// ─── GEO Checks ──────────────────────────────────────────────────────────────

function checkAuthorSignals($: cheerio.CheerioAPI): CheckResult {
  const bodyText = $("body").text().toLowerCase();
  const authorPatterns = [
    'author', 'written by', 'by ', 'posted by', 'reviewed by',
    'published by', 'contributor', 'editor',
  ];
  const hasAuthor = authorPatterns.some((p) => bodyText.includes(p));
  const authorSchema = $('[itemprop="author"]').length > 0 ||
    (() => {
      let found = false;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html() ?? "{}");
          if (JSON.stringify(data).includes('"author"')) found = true;
        } catch { }
      });
      return found;
    })();
  const passed = hasAuthor || authorSchema;
  return {
    id: "geo_author",
    category: "geo",
    name: "Author / Byline Signals",
    passed,
    score: passed ? 5 : 0,
    maxScore: 5,
    description: "Author attribution or byline signals present",
    recommendation: passed
      ? "Author signals detected — good for E-E-A-T."
      : "No author attribution found. AI engines heavily weight E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness). Add author bylines with credentials, author schema, and a link to an author bio page.",
    detail: passed ? "Author signals detected" : "No author attribution found",
  };
}

function checkOrgSchema($: cheerio.CheerioAPI): CheckResult {
  let hasOrgSchema = false;
  let orgType = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const types = Array.isArray(data)
        ? data.map((d) => d["@type"])
        : [data["@type"]];
      const match = types.find(
        (t) =>
          t === "Organization" ||
          t === "LocalBusiness" ||
          t === "Corporation" ||
          t === "Person" ||
          t === "WebSite"
      );
      if (match) {
        hasOrgSchema = true;
        orgType = match;
      }
    } catch { }
  });
  return {
    id: "geo_org_schema",
    category: "geo",
    name: "Organization / Brand Schema",
    passed: hasOrgSchema,
    score: hasOrgSchema ? 4 : 0,
    maxScore: 4,
    description: "Organization, LocalBusiness, or Person schema present",
    recommendation: hasOrgSchema
      ? `${orgType} schema found — AI engines can properly identify your brand entity.`
      : "Add Organization or LocalBusiness JSON-LD schema with your name, URL, logo, contact info, and social profiles. This is how AI engines like ChatGPT and Perplexity identify and describe your brand.",
    detail: hasOrgSchema ? `${orgType} schema present` : "Not found",
  };
}

function checkExternalLinks($: cheerio.CheerioAPI, url: string): CheckResult {
  const origin = getOrigin(url);
  const authorityDomains = [".gov", ".edu", "wikipedia.org", "nytimes.com", "reuters.com", "bbc.com", "forbes.com", "harvard.edu", "stanford.edu", "nih.gov", "cdc.gov"];
  let authorityLinkCount = 0;
  let totalExternal = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (href.startsWith("http") && !href.startsWith(origin)) {
      totalExternal++;
      if (authorityDomains.some((d) => href.includes(d))) {
        authorityLinkCount++;
      }
    }
  });
  const passed = totalExternal >= 2;
  return {
    id: "geo_external_links",
    category: "geo",
    name: "External / Authority Links",
    passed,
    score: passed ? (authorityLinkCount > 0 ? 4 : 3) : totalExternal === 1 ? 1 : 0,
    maxScore: 4,
    description: "Links out to external sources (trust signals for AI engines)",
    recommendation: passed
      ? `${totalExternal} external link(s) found${authorityLinkCount > 0 ? `, including ${authorityLinkCount} authority link(s)` : ""}. Good citation practice.`
      : "No external links found. Linking to authoritative sources (.gov, .edu, established publications) builds trust signals that AI engines use to assess content quality and citation-worthiness.",
    detail: `${totalExternal} external, ${authorityLinkCount} authority links`,
  };
}

function checkAboutPage($: cheerio.CheerioAPI, url: string): CheckResult {
  const origin = getOrigin(url);
  let hasAbout = false;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    if (href.includes("about") || href.includes("/team") || href.includes("/company") || href.includes("/who-we-are")) {
      hasAbout = true;
    }
  });
  const bodyText = $("body").text().toLowerCase();
  if (!hasAbout && (bodyText.includes("about us") || bodyText.includes("about me") || bodyText.includes("our story") || bodyText.includes("who we are"))) {
    hasAbout = true;
  }
  return {
    id: "geo_about_page",
    category: "geo",
    name: "About Page / Trust Signals",
    passed: hasAbout,
    score: hasAbout ? 3 : 0,
    maxScore: 3,
    description: "About page or team information linked/mentioned",
    recommendation: hasAbout
      ? "About/team signals detected."
      : "No About page link found. AI engines like Perplexity and Google AI Overviews use About pages to verify entity legitimacy. Create an /about page with your company story, team, and credentials.",
    detail: hasAbout ? "About/team signals found" : "No About page detected",
  };
}

function checkEEATSignals($: cheerio.CheerioAPI): CheckResult {
  const bodyText = $("body").text().toLowerCase();
  const signals = [
    "certified", "licensed", "expert", "specialist", "years of experience",
    "years experience", "founder", "ceo", "director", "award", "featured in",
    "as seen in", "trusted by", "clients", "customers", "reviewed", "accredited",
    "member of", "association", "degree", "phd", "mba", "professional",
  ];
  const found = signals.filter((s) => bodyText.includes(s));
  const passed = found.length >= 3;
  const detail =
    found.length > 0
      ? `${found.length} E-E-A-T signal(s): ${found.slice(0, 3).join(", ")}${found.length > 3 ? "..." : ""}`
      : "No E-E-A-T signals detected";
  return {
    id: "geo_eeat",
    category: "geo",
    name: "E-E-A-T Signals",
    passed,
    score: passed ? 4 : found.length >= 1 ? 2 : 0,
    maxScore: 4,
    description: "Expertise, Experience, Authority, Trust signals in content",
    recommendation: passed
      ? `Strong E-E-A-T signals present (${found.length} detected).`
      : `Only ${found.length} E-E-A-T signal(s) found. Add trust signals: years in business, certifications, credentials, client numbers, media mentions, associations. These are the primary signals AI engines use to decide whether to cite your content.`,
    detail,
  };
}

// ─── Main Analyzer ───────────────────────────────────────────────────────────

export async function analyzeUrl(rawUrl: string): Promise<AnalysisResult> {
  const url = normalizeUrl(rawUrl);
  const origin = getOrigin(url);
  const startTime = Date.now();

  let html = "";
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    html = await res.text();
  } catch (err) {
    return {
      url,
      timestamp: new Date().toISOString(),
      checks: [],
      scores: {
        seo: { earned: 0, max: 38, percentage: 0 },
        aeo: { earned: 0, max: 30, percentage: 0 },
        geo: { earned: 0, max: 20, percentage: 0 },
        overall: { earned: 0, max: 88, percentage: 0 },
      },
      grade: "F",
      error: `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const $ = cheerio.load(html);
  const fetchTimeMs = Date.now() - startTime;

  // Run robots, sitemap, and PageSpeed in parallel
  const [hasRobots, hasSitemap, pageSpeed] = await Promise.all([
    fetchRobots(origin),
    fetchSitemap(origin),
    fetchPageSpeed(url),
  ]);

  // Build all checks
  const checks: CheckResult[] = [
    // SEO
    checkTitle($),
    checkMetaDescription($),
    checkH1($),
    checkHeadingStructure($),
    checkImageAlts($),
    checkCanonical($),
    checkViewport($),
    checkHttps(url),
    checkSchema($),
    checkOpenGraph($),
    checkInternalLinks($, url),
    checkRobots(hasRobots),
    checkSitemap(hasSitemap),
    // AEO
    checkFaqSchema($),
    checkQuestionHeadings($),
    checkConciseParagraphs($),
    checkLists($),
    checkTables($),
    checkHowToSchema($),
    // GEO
    checkAuthorSignals($),
    checkOrgSchema($),
    checkExternalLinks($, url),
    checkAboutPage($, url),
    checkEEATSignals($),
  ];

  const seoScore = scoreCategory(checks, "seo");
  const aeoScore = scoreCategory(checks, "aeo");
  const geoScore = scoreCategory(checks, "geo");
  const overallEarned = seoScore.earned + aeoScore.earned + geoScore.earned;
  const overallMax = seoScore.max + aeoScore.max + geoScore.max;
  const overallPct = Math.round((overallEarned / overallMax) * 100);

  return {
    url,
    timestamp: new Date().toISOString(),
    pageTitle: $("title").first().text().trim() || undefined,
    checks,
    scores: {
      seo: seoScore,
      aeo: aeoScore,
      geo: geoScore,
      overall: { earned: overallEarned, max: overallMax, percentage: overallPct },
    },
    grade: getGrade(overallPct),
    fetchTimeMs,
    pageSpeed: pageSpeed.error && pageSpeed.mobile.score === 0 && pageSpeed.desktop.score === 0
      ? { ...pageSpeed }
      : pageSpeed,
  };
}

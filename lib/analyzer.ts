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

  const NULL_SCORE: SpeedScore = { score: 0, lcp: 0, cls: 0, fcp: 0, tbt: 0 };

  const extractScore = (data: Record<string, unknown>): SpeedScore => {
    try {
      const lr = data.lighthouseResult as Record<string, unknown> | undefined;
      if (!lr) return NULL_SCORE;

      const audits = (lr.audits ?? {}) as Record<string, { numericValue?: number }>;
      const perfScore = ((lr.categories as Record<string, { score?: number }>)?.performance?.score ?? 0);

      // LCP / CLS: prefer loadingExperience field data (real-user CrUX data) when available,
      // fall back to Lighthouse lab values. Field data uses different key paths.
      const le = data.loadingExperience as Record<string, { percentile?: number; category?: string }> | undefined;
      const lcp =
        le?.["LARGEST_CONTENTFUL_PAINT_MS"]?.percentile ??
        Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0);
      const cls =
        le?.["CUMULATIVE_LAYOUT_SHIFT_SCORE"]?.percentile != null
          ? le["CUMULATIVE_LAYOUT_SHIFT_SCORE"].percentile / 100
          : Math.round((audits["cumulative-layout-shift"]?.numericValue ?? 0) * 1000) / 1000;

      return {
        score: Math.round(perfScore * 100),
        lcp,
        cls,
        fcp: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
        tbt: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
      };
    } catch {
      return NULL_SCORE;
    }
  };

  try {
    // PageSpeed API can take 20-30 s for complex pages; 12 s is too short.
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`${base}&strategy=mobile`, { signal: AbortSignal.timeout(28000) }),
      fetch(`${base}&strategy=desktop`, { signal: AbortSignal.timeout(28000) }),
    ]);

    const [mobileData, desktopData] = await Promise.all([
      mobileRes.json() as Promise<Record<string, unknown>>,
      desktopRes.json() as Promise<Record<string, unknown>>,
    ]);

    // Detect API-level error responses (e.g. quota exceeded, invalid URL, auth failure).
    // These come back as HTTP 200 with {"error": {"code": N, "message": "..."}} in the body.
    type ApiError = { code?: number; message?: string; status?: string };
    const mobileApiErr = (mobileData as { error?: ApiError }).error;
    const desktopApiErr = (desktopData as { error?: ApiError }).error;
    if (mobileApiErr || desktopApiErr) {
      const e = mobileApiErr ?? desktopApiErr!;
      const msg = `PageSpeed API error (${e.code ?? "?"} ${e.status ?? ""}): ${e.message ?? "unknown"}`;
      console.error("[PageSpeed]", msg, JSON.stringify(e));
      return { mobile: NULL_SCORE, desktop: NULL_SCORE, error: msg };
    }

    return {
      mobile: extractScore(mobileData),
      desktop: extractScore(desktopData),
    };
  } catch (err) {
    const msg = `PageSpeed fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[PageSpeed]", msg);
    return { mobile: NULL_SCORE, desktop: NULL_SCORE, error: msg };
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

// ─── New SEO Checks ───────────────────────────────────────────────────────────

function checkNoIndex($: cheerio.CheerioAPI): CheckResult {
  const metaRobotsContent = $('meta[name="robots"]').attr("content")?.toLowerCase() ?? "";
  const isNoIndex = metaRobotsContent.includes("noindex");
  return {
    id: "seo_noindex",
    category: "seo",
    name: "Indexability (noindex check)",
    passed: !isNoIndex,
    score: isNoIndex ? 0 : 5,
    maxScore: 5,
    description: "Page is not blocking search engines with a noindex directive",
    recommendation: isNoIndex
      ? `CRITICAL: This page has a noindex directive (meta robots: "${metaRobotsContent}"). Google cannot index it regardless of any other SEO work. Remove or change this tag immediately — unless this page is intentionally hidden from search.`
      : "Page is indexable — no noindex directives found.",
    detail: isNoIndex ? `meta robots: "${metaRobotsContent}"` : "Indexable",
  };
}

function checkWordCount($: cheerio.CheerioAPI): CheckResult {
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter((w) => w.length > 1).length;
  const passed = words >= 300;
  let recommendation = "";
  if (words < 150) {
    recommendation = `Only ${words} words — severely thin content. Google actively suppresses pages under 300 words in rankings. Add substantial, unique content that serves the user's intent.`;
  } else if (words < 300) {
    recommendation = `${words} words — thin content. Aim for at least 300+ words minimum. Ideal for most service pages: 600–1,200 words with supporting detail, FAQs, and context.`;
  } else if (words < 600) {
    recommendation = `${words} words — acceptable but lean. Expanding to 600+ words with FAQs, process sections, or supporting detail will improve ranking potential and featured snippet eligibility.`;
  } else {
    recommendation = `${words} words — solid content depth.`;
  }
  return {
    id: "seo_word_count",
    category: "seo",
    name: "Content Depth (Word Count)",
    passed,
    score: words >= 600 ? 4 : words >= 300 ? 2 : 0,
    maxScore: 4,
    description: "Page has at least 300 words of content (thin content threshold)",
    recommendation,
    detail: `${words.toLocaleString()} words`,
  };
}

function checkLangAttribute($: cheerio.CheerioAPI): CheckResult {
  const lang = $("html").attr("lang");
  const passed = !!lang && lang.length >= 2;
  return {
    id: "seo_lang",
    category: "seo",
    name: "HTML Lang Attribute",
    passed,
    score: passed ? 2 : 0,
    maxScore: 2,
    description: 'HTML lang attribute set (e.g. lang="en")',
    recommendation: passed
      ? `Language declared as "${lang}".`
      : 'Add a lang attribute to your <html> tag (e.g., <html lang="en">). Required for international SEO, accessibility compliance (WCAG), and proper language detection by search engines and screen readers.',
    detail: passed ? `lang="${lang}"` : "Not set",
  };
}

function checkTwitterCards($: cheerio.CheerioAPI): CheckResult {
  const card = $('meta[name="twitter:card"]').attr("content");
  const title = $('meta[name="twitter:title"]').attr("content");
  const desc = $('meta[name="twitter:description"]').attr("content");
  const count = [card, title, desc].filter(Boolean).length;
  const passed = count >= 2;
  const missing = [!card && "twitter:card", !title && "twitter:title", !desc && "twitter:description"].filter(Boolean);
  return {
    id: "seo_twitter_cards",
    category: "seo",
    name: "Twitter / X Card Tags",
    passed,
    score: count === 3 ? 3 : count === 2 ? 2 : count === 1 ? 1 : 0,
    maxScore: 3,
    description: "Twitter Card meta tags present for social sharing on X",
    recommendation: passed
      ? `${count}/3 Twitter Card tags found — good social sharing coverage.`
      : `Missing Twitter Card tags: ${missing.join(", ")}. These are separate from OG tags and control how your page appears when shared on X/Twitter. Add them alongside your Open Graph tags.`,
    detail: count === 3 ? "All Twitter Card tags present" : `${count}/3 tags found`,
  };
}

function checkPageSpeedScore(pageSpeed: PageSpeedData): CheckResult {
  const noData = !!pageSpeed.error;
  const score = pageSpeed.mobile?.score ?? 0;
  const passed = !noData && score >= 70;

  // Neutral when no data — don't penalize what we can't measure
  if (noData) {
    return {
      id: "seo_pagespeed_score",
      category: "seo",
      name: "Mobile Page Speed Score",
      passed: true,
      score: 3,
      maxScore: 3,
      description: "Google PageSpeed mobile score ≥ 70",
      recommendation: "PageSpeed data unavailable — test manually at pagespeed.web.dev.",
      detail: "Data unavailable",
    };
  }

  return {
    id: "seo_pagespeed_score",
    category: "seo",
    name: "Mobile Page Speed Score",
    passed,
    score: score >= 90 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0,
    maxScore: 3,
    description: "Google PageSpeed mobile score ≥ 70",
    recommendation: passed
      ? `Mobile PageSpeed score: ${score}/100 — good.`
      : `Mobile PageSpeed score: ${score}/100. Google uses mobile-first indexing — a slow mobile score hurts rankings. Fix: compress images (use WebP), minimize JavaScript, use lazy loading, enable browser caching. Target: 70+.`,
    detail: `Mobile score: ${score}/100`,
  };
}

function checkPageSpeedLCP(pageSpeed: PageSpeedData): CheckResult {
  const noData = !!pageSpeed.error;
  const lcp = pageSpeed.mobile?.lcp ?? 0;
  // lcp = 0 with no error means API returned valid data but couldn't measure — also treat as no data
  const hasData = !noData && lcp > 0;
  const passed = hasData && lcp <= 2500;

  // Neutral when no data — don't penalize what we can't measure
  if (!hasData) {
    return {
      id: "seo_lcp",
      category: "seo",
      name: "Largest Contentful Paint (LCP)",
      passed: true,
      score: 2,
      maxScore: 2,
      description: "LCP ≤ 2,500ms — Google's Core Web Vitals passing threshold",
      recommendation: "LCP data unavailable — test manually at pagespeed.web.dev.",
      detail: "Data unavailable",
    };
  }

  return {
    id: "seo_lcp",
    category: "seo",
    name: "Largest Contentful Paint (LCP)",
    passed,
    score: lcp <= 2500 ? 2 : lcp <= 4000 ? 1 : 0,
    maxScore: 2,
    description: "LCP ≤ 2,500ms — Google's Core Web Vitals passing threshold",
    recommendation: passed
      ? `LCP is ${(lcp / 1000).toFixed(1)}s — passes Core Web Vitals.`
      : `LCP is ${(lcp / 1000).toFixed(1)}s — above Google's 2.5s threshold. LCP measures how fast your largest visible element loads. Fix: optimize and preload your hero image, use a CDN, improve server response time (TTFB).`,
    detail: `${(lcp / 1000).toFixed(1)}s (mobile)`,
  };
}

function checkPageSpeedCLS(pageSpeed: PageSpeedData): CheckResult {
  // CLS can legitimately be 0 (perfect — no layout shifts), so 0 is valid data.
  // Use pageSpeed.error as the single source of truth for "no data".
  const noData = !!pageSpeed.error;
  const cls = pageSpeed.mobile?.cls ?? 0;
  const passed = !noData && cls <= 0.1;

  // Neutral when no data — don't penalize what we can't measure
  if (noData) {
    return {
      id: "seo_cls",
      category: "seo",
      name: "Cumulative Layout Shift (CLS)",
      passed: true,
      score: 2,
      maxScore: 2,
      description: "CLS ≤ 0.1 — Google's Core Web Vitals passing threshold",
      recommendation: "CLS data unavailable — test manually at pagespeed.web.dev.",
      detail: "Data unavailable",
    };
  }

  return {
    id: "seo_cls",
    category: "seo",
    name: "Cumulative Layout Shift (CLS)",
    passed,
    score: cls <= 0.1 ? 2 : cls <= 0.25 ? 1 : 0,
    maxScore: 2,
    description: "CLS ≤ 0.1 — Google's Core Web Vitals passing threshold",
    recommendation: passed
      ? `CLS is ${cls} — passes Core Web Vitals.`
      : `CLS is ${cls} — above Google's 0.1 threshold. CLS measures visual stability (elements jumping around as the page loads). Fix: set explicit width/height on all images and iframes, avoid inserting content above existing elements, reserve space for ads/embeds.`,
    detail: `CLS: ${cls} (mobile)`,
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

// ─── New AEO Check ────────────────────────────────────────────────────────────

function checkFreshnessSignals($: cheerio.CheerioAPI): CheckResult {
  let hasDateSchema = false;
  let dateFound = "";

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const str = JSON.stringify(data);
      if (str.includes('"dateModified"') || str.includes('"datePublished"')) {
        hasDateSchema = true;
        const match = str.match(/"dateModified"\s*:\s*"([^"]+)"|"datePublished"\s*:\s*"([^"]+)"/);
        if (match) dateFound = (match[1] || match[2] || "").split("T")[0];
      }
    } catch {
      // ignore
    }
  });

  const hasTimeTag = $("time[datetime]").length > 0;
  const hasOgDate =
    !!$('meta[property="article:modified_time"]').attr("content") ||
    !!$('meta[property="article:published_time"]').attr("content");

  const passed = hasDateSchema || hasTimeTag || hasOgDate;

  return {
    id: "aeo_freshness",
    category: "aeo",
    name: "Content Freshness Signals",
    passed,
    score: passed ? 4 : 0,
    maxScore: 4,
    description: "Publication or modification date signals present in schema or HTML",
    recommendation: passed
      ? `Date signals detected${dateFound ? ` (${dateFound})` : ""}. AI engines and Google favor recently updated content.`
      : "No content date signals found. Add datePublished and dateModified to your Article or WebPage schema, and use <time datetime='...'> tags. AI engines prioritize fresh, dated content — especially for competitive queries. Content without dates is harder to rank and cite.",
    detail: passed
      ? hasDateSchema
        ? `Date in JSON-LD${dateFound ? `: ${dateFound}` : ""}`
        : hasTimeTag
        ? "Date via <time> tag"
        : "Date via OG article tags"
      : "No date signals detected",
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

function checkExternalLinks($: cheerio.CheerioAPI, url: string, html: string): CheckResult {
  // Strip www. from both sides before comparing so www.example.com == example.com
  const stripWww = (h: string) => h.replace(/^www\./, "");

  let pageHostname = "";
  try { pageHostname = stripWww(new URL(getOrigin(url)).hostname); } catch { /* ignore */ }

  // Treat any of these TLDs/domains as authoritative citations
  const authorityTLDs = [".gov", ".edu", ".org"];
  const authorityDomains = [
    "wikipedia.org", "nytimes.com", "reuters.com", "bbc.com", "bbc.co.uk",
    "forbes.com", "nih.gov", "cdc.gov", "harvard.edu", "stanford.edu",
    "wsj.com", "washingtonpost.com", "apnews.com",
    // State / county government portals (common for local businesses)
    "myfloridalicense.com", "myflorida.com", "flhsmv.gov", "floridahealth.gov",
    "state.fl.us", "co.walton.fl.us", "co.okaloosa.fl.us", "co.bay.fl.us",
    "irs.gov", "sba.gov", "bbb.org", "ftc.gov",
  ];

  const externalHrefs = new Set<string>();

  // ── Primary: Cheerio DOM traversal ──────────────────────────────────────────
  $("a[href]").each((_, el) => {
    let href = $(el).attr("href") ?? "";
    if (href.startsWith("//")) href = "https:" + href;
    if (!href.startsWith("http://") && !href.startsWith("https://")) return;
    externalHrefs.add(href);
  });

  // ── Fallback: regex over raw HTML (catches footer links Cheerio may miss) ──
  const absoluteLinkRe = /href=["'](https?:\/\/[^"'>\s]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = absoluteLinkRe.exec(html)) !== null) {
    externalHrefs.add(m[1]);
  }

  let authorityLinkCount = 0;
  let totalExternal = 0;

  for (const href of externalHrefs) {
    let hrefHostname = "";
    try { hrefHostname = stripWww(new URL(href).hostname); } catch { continue; }

    if (!hrefHostname) continue;

    // Skip same-origin (after www-stripping)
    if (hrefHostname === pageHostname) continue;
    // Skip subdomains of the same root (blog.example.com vs example.com)
    if (pageHostname && (
      hrefHostname.endsWith("." + pageHostname) ||
      pageHostname.endsWith("." + hrefHostname)
    )) continue;

    totalExternal++;

    const isAuthority =
      authorityTLDs.some((tld) => hrefHostname.endsWith(tld)) ||
      authorityDomains.some((d) => hrefHostname === d || hrefHostname.endsWith("." + d));
    if (isAuthority) authorityLinkCount++;
  }

  // Pass if at least 1 external link exists
  const passed = totalExternal >= 1;
  return {
    id: "geo_external_links",
    category: "geo",
    name: "External / Authority Links",
    passed,
    score: authorityLinkCount > 0 ? 4 : passed ? 3 : 0,
    maxScore: 4,
    description: "Links out to external sources (trust signals for AI engines)",
    recommendation: passed
      ? `${totalExternal} external link(s) found${authorityLinkCount > 0 ? `, including ${authorityLinkCount} authority link(s)` : ""}. Good citation practice.`
      : "No external links found. Linking to authoritative sources (.gov, .edu, established publications) builds trust signals that AI engines use to assess content quality and citation-worthiness.",
    detail: `${totalExternal} external, ${authorityLinkCount} authority links`,
  };
}

function checkAboutPage($: cheerio.CheerioAPI, url: string, html: string): CheckResult {
  void url;
  let hasAbout = false;

  // Primary: DOM traversal via Cheerio
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    if (href.includes("about") || href.includes("/team") || href.includes("/company") || href.includes("/who-we-are")) {
      hasAbout = true;
    }
  });

  // Body text signals
  if (!hasAbout) {
    const bodyText = $("body").text().toLowerCase();
    if (bodyText.includes("about us") || bodyText.includes("about me") || bodyText.includes("our story") || bodyText.includes("who we are")) {
      hasAbout = true;
    }
  }

  // Fallback: raw HTML regex — catches footer links Cheerio may drop on malformed markup
  if (!hasAbout) {
    const rawLower = html.toLowerCase();
    // href="/about", href="/about-us", href="/team", href="/company", href="/who-we-are"
    if (
      /href=["'][^"']*\/about[^"']*["']/.test(rawLower) ||
      /href=["'][^"']*\/team[^"']*["']/.test(rawLower) ||
      /href=["'][^"']*\/company[^"']*["']/.test(rawLower) ||
      /href=["'][^"']*\/who-we-are[^"']*["']/.test(rawLower)
    ) {
      hasAbout = true;
    }
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

// ─── New GEO Checks ───────────────────────────────────────────────────────────

function checkSocialProfiles($: cheerio.CheerioAPI): CheckResult {
  const socialPlatforms = [
    { name: "LinkedIn", patterns: ["linkedin.com/"] },
    { name: "Twitter/X", patterns: ["twitter.com/", "x.com/"] },
    { name: "Facebook", patterns: ["facebook.com/"] },
    { name: "Instagram", patterns: ["instagram.com/"] },
    { name: "YouTube", patterns: ["youtube.com/"] },
  ];

  const found: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const { name, patterns } of socialPlatforms) {
      if (!found.includes(name) && patterns.some((p) => href.includes(p))) {
        found.push(name);
      }
    }
  });

  // Also check sameAs arrays in JSON-LD — iterate every URL and match against platform list
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const entries = Array.isArray(data) ? data : [data];
      for (const entry of entries) {
        const sameAs = entry["sameAs"];
        if (!sameAs) continue;
        const urls: unknown[] = Array.isArray(sameAs) ? sameAs : [sameAs];
        for (const sameAsUrl of urls) {
          if (typeof sameAsUrl !== "string") continue;
          for (const { name, patterns } of socialPlatforms) {
            if (!found.includes(name) && patterns.some((p) => sameAsUrl.includes(p))) {
              found.push(name);
            }
          }
        }
      }
    } catch { }
  });

  const passed = found.length >= 2;
  return {
    id: "geo_social_profiles",
    category: "geo",
    name: "Social Profile Links",
    passed,
    score: found.length >= 3 ? 4 : found.length === 2 ? 3 : found.length === 1 ? 1 : 0,
    maxScore: 4,
    description: "Links to social media profiles present (brand entity signal)",
    recommendation: passed
      ? `${found.length} social profile link(s) found: ${found.join(", ")}.`
      : `Only ${found.length} social link(s) detected. Link to your LinkedIn, Twitter/X, Facebook, and Instagram from your site. AI engines like ChatGPT and Perplexity use social profile links to build your brand's knowledge graph and verify your business exists.`,
    detail: found.length > 0 ? `Found: ${found.join(", ")}` : "No social profile links detected",
  };
}

function checkAggregateRating($: cheerio.CheerioAPI): CheckResult {
  let hasRating = false;
  let ratingDetail = "";

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() ?? "{}");
      const str = JSON.stringify(data);
      if (str.includes('"AggregateRating"') || str.includes('"aggregateRating"')) {
        hasRating = true;
        const ratingMatch = str.match(/"ratingValue"\s*:\s*"?([^",}\s]+)"?/);
        const countMatch = str.match(/"reviewCount"\s*:\s*"?([^",}\s]+)"?/);
        if (ratingMatch && countMatch) {
          ratingDetail = `${ratingMatch[1]} stars (${countMatch[1]} reviews)`;
        }
      }
    } catch { }
  });

  return {
    id: "geo_aggregate_rating",
    category: "geo",
    name: "Review / Rating Schema",
    passed: hasRating,
    score: hasRating ? 3 : 0,
    maxScore: 3,
    description: "AggregateRating schema present — enables star ratings in Google SERPs",
    recommendation: hasRating
      ? `AggregateRating schema found${ratingDetail ? `: ${ratingDetail}` : ""}. This qualifies your page for star ratings in Google search results.`
      : "No AggregateRating schema found. If you have customer reviews or testimonials, add AggregateRating JSON-LD. This enables gold star ratings to appear in Google SERPs — significantly improving click-through rate. Connect a review platform (Google, Trustpilot, etc.) and mark it up.",
    detail: hasRating ? ratingDetail || "AggregateRating schema found" : "Not found",
  };
}

function checkContactInfo($: cheerio.CheerioAPI): CheckResult {
  const bodyText = $("body").text();

  const phoneRegex = /(\+?1?\s*[\-(.]?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/;
  const hasPhone = phoneRegex.test(bodyText);

  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const hasEmail = emailRegex.test(bodyText);

  let hasContactLink = false;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    const text = ($(el).text() ?? "").toLowerCase();
    if (href.includes("contact") || text.includes("contact us") || text.trim() === "contact") {
      hasContactLink = true;
    }
  });

  const signals = [
    hasPhone && "phone number",
    hasEmail && "email address",
    hasContactLink && "contact page link",
  ].filter(Boolean) as string[];

  const passed = signals.length >= 1;
  return {
    id: "geo_contact_info",
    category: "geo",
    name: "Contact Information",
    passed,
    score: signals.length >= 2 ? 3 : signals.length === 1 ? 1 : 0,
    maxScore: 3,
    description: "Phone number, email, or contact page link visible on page",
    recommendation: passed
      ? `Contact signals found: ${signals.join(", ")}.`
      : "No contact information found — no phone number, email address, or contact page link detected. Visible contact info is a critical trust signal for both Google and AI engines. Add a phone number, email, or a prominent 'Contact Us' link.",
    detail: passed ? `Found: ${signals.join(", ")}` : "No contact info detected",
  };
}

function checkPrivacyPolicy($: cheerio.CheerioAPI, html: string): CheckResult {
  let hasPrivacy = false;

  // Primary: DOM traversal via Cheerio
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    const text = ($(el).text() ?? "").toLowerCase();
    if (
      href.includes("privacy") ||
      text.includes("privacy policy") ||
      text.includes("privacy") ||
      href.includes("terms") ||
      text.includes("terms of service") ||
      text.includes("terms & conditions")
    ) {
      hasPrivacy = true;
    }
  });

  // Fallback: raw HTML regex — catches footer links Cheerio may drop on malformed markup
  if (!hasPrivacy) {
    const rawLower = html.toLowerCase();
    if (
      /href=["'][^"']*\/privacy[^"']*["']/.test(rawLower) ||
      /href=["'][^"']*\/terms[^"']*["']/.test(rawLower) ||
      // link text fallback: >privacy< or >terms<
      />\s*privacy[^<]*</i.test(rawLower) ||
      />\s*terms[^<]*</i.test(rawLower)
    ) {
      hasPrivacy = true;
    }
  }

  return {
    id: "geo_privacy_policy",
    category: "geo",
    name: "Privacy Policy / Legal Pages",
    passed: hasPrivacy,
    score: hasPrivacy ? 2 : 0,
    maxScore: 2,
    description: "Privacy policy or terms of service link present",
    recommendation: hasPrivacy
      ? "Privacy/legal page link detected — good trust and legitimacy signal."
      : "No privacy policy or terms link found. A privacy policy is a basic legitimacy signal that AI engines and Google use to assess site trustworthiness. It's also legally required in most jurisdictions (GDPR, CCPA). Add a link in your footer.",
    detail: hasPrivacy ? "Privacy/legal link found" : "Not found",
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
    // Max scores: SEO=76, AEO=39, GEO=32, Overall=147
    return {
      url,
      timestamp: new Date().toISOString(),
      checks: [],
      scores: {
        seo: { earned: 0, max: 76, percentage: 0 },
        aeo: { earned: 0, max: 39, percentage: 0 },
        geo: { earned: 0, max: 32, percentage: 0 },
        overall: { earned: 0, max: 147, percentage: 0 },
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
    // SEO — original 13 checks
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
    // SEO — 7 new checks
    checkNoIndex($),
    checkWordCount($),
    checkLangAttribute($),
    checkTwitterCards($),
    checkPageSpeedScore(pageSpeed),
    checkPageSpeedLCP(pageSpeed),
    checkPageSpeedCLS(pageSpeed),
    // AEO — original 6 checks
    checkFaqSchema($),
    checkQuestionHeadings($),
    checkConciseParagraphs($),
    checkLists($),
    checkTables($),
    checkHowToSchema($),
    // AEO — 1 new check
    checkFreshnessSignals($),
    // GEO — original 5 checks
    checkAuthorSignals($),
    checkOrgSchema($),
    checkExternalLinks($, url, html),
    checkAboutPage($, url, html),
    checkEEATSignals($),
    // GEO — 4 new checks
    checkSocialProfiles($),
    checkAggregateRating($),
    checkContactInfo($),
    checkPrivacyPolicy($, html),
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

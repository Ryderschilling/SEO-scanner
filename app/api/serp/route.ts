import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { SerpResult, SerpKeywordResult, SerpCompetitor, PageContext } from "@/lib/types";

export const maxDuration = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeHostname(url: string): string {
  try {
    const u = url.startsWith("http") ? url : `https://${url}`;
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// ─── Keyword generation via GPT-4o-mini ──────────────────────────────────────

async function generateKeywords(
  url: string,
  pageTitle: string,
  pageContext: PageContext | undefined,
  targetKeyword: string | undefined,
  apiKey: string
): Promise<string[]> {
  const client = new OpenAI({ apiKey });

  const contextLines = [
    `URL: ${url}`,
    `Page title: "${pageTitle}"`,
    pageContext?.h1        ? `H1: "${pageContext.h1}"` : null,
    pageContext?.metaDesc  ? `Meta description: "${pageContext.metaDesc}"` : null,
    pageContext?.bodySnippet
      ? `Content excerpt: "${pageContext.bodySnippet.substring(0, 300)}"`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const kwInstruction = targetKeyword
    ? `The user's primary target keyword is: "${targetKeyword}"\nInclude this exact phrase as the first query. Generate 4 closely related variations (different intent or specificity).`
    : `Generate 5 specific search queries that a prospective customer would type to find this business or service. Mix short (2–3 words) and long-tail (4–7 words) queries. Focus on buyer intent.`;

  const prompt = `You are an SEO expert. Based on the website content below, ${kwInstruction}

Website content:
${contextLines}

Rules:
- Be highly specific — include location, service type, modifiers when evident
- Natural phrasing — how real people search, not keyword-stuffed
- No brand names as queries (people searching generically)
- Return ONLY a valid JSON array of 5 strings, no commentary

Example output: ["second home management watersound origins", "vacation property management 30A florida", "short term rental management santa rosa beach", "property managers inlet beach FL", "airbnb management 30A"]`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 250,
      temperature: 0.4,
    });

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    // Strip markdown code fences if present
    const clean = text.replace(/```json\n?/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed.slice(0, 5);
    }
  } catch {
    // Fall through to heuristic fallback
  }

  // Heuristic fallback
  const base = targetKeyword || pageTitle || normalizeHostname(url);
  return [
    base,
    `${base} near me`,
    `best ${base}`,
    `${base} services`,
    `${base} reviews`,
  ];
}

// ─── Serper.dev query ─────────────────────────────────────────────────────────

interface SerperOrganic {
  position: number;
  title: string;
  link: string;
  snippet?: string;
}

async function querySerper(
  query: string,
  apiKey: string
): Promise<SerperOrganic[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 10, gl: "us", hl: "en" }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Serper ${res.status}: ${body.substring(0, 200)}`);
  }
  const data = (await res.json()) as { organic?: SerperOrganic[] };
  return data.organic ?? [];
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const serpApiKey = process.env.SERPER_API_KEY;
  if (!serpApiKey) {
    return NextResponse.json(
      { error: "SERPER_API_KEY is not configured. Add it to .env.local to enable ranking checks." },
      { status: 500 }
    );
  }

  const openAiKey = process.env.OPENAI_API_KEY;

  try {
    const body = await req.json() as {
      url: string;
      pageTitle?: string;
      pageContext?: PageContext;
      targetKeyword?: string;
    };

    const { url, pageTitle = "", pageContext, targetKeyword } = body;
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Generate 5 keyword queries
    let keywords: string[];
    if (openAiKey) {
      keywords = await generateKeywords(url, pageTitle, pageContext, targetKeyword, openAiKey);
    } else if (targetKeyword) {
      keywords = [
        targetKeyword,
        `${targetKeyword} near me`,
        `best ${targetKeyword}`,
        `${targetKeyword} services`,
        `${targetKeyword} company`,
      ];
    } else {
      const base = pageTitle || normalizeHostname(url);
      keywords = [base, `${base} near me`, `best ${base}`, `${base} services`, `${base} reviews`];
    }

    const targetHostname = normalizeHostname(url);

    // Query Serper for all keywords in parallel
    const serpSettled = await Promise.allSettled(
      keywords.map((kw) => querySerper(kw, serpApiKey))
    );

    const kwResults: SerpKeywordResult[] = keywords.map((query, i) => {
      const settled = serpSettled[i];

      if (settled.status === "rejected") {
        return {
          query,
          rank: null,
          competitors: [],
          error: String(settled.reason),
        };
      }

      const organic = settled.value;
      let rank: number | null = null;
      let yourUrl: string | undefined;

      const competitors: SerpCompetitor[] = organic.slice(0, 10).map((r) => {
        const resultHost = normalizeHostname(r.link ?? "");
        if (rank === null && resultHost === targetHostname) {
          rank = r.position;
          yourUrl = r.link;
        }
        return {
          title: r.title ?? "",
          url: r.link ?? "",
          position: r.position ?? 0,
          snippet: r.snippet,
        };
      });

      return { query, rank, yourUrl, competitors };
    });

    const result: SerpResult = {
      keywords: kwResults,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[SERP] Error:", err);
    return NextResponse.json(
      { error: `SERP check failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { crawlSite } from "@/lib/analyzer";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { url?: string; maxPages?: number };
    const { url, maxPages = 8 } = body;

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const result = await crawlSite(url.trim(), Math.min(maxPages, 12));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Crawl] Error:", err);
    return NextResponse.json(
      { error: `Crawl failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

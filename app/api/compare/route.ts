import { NextRequest, NextResponse } from "next/server";
import { analyzeUrl } from "@/lib/analyzer";
import type { CompareResult } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, competitorUrl } = body as { url?: string; competitorUrl?: string };

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return NextResponse.json({ error: "Primary URL is required" }, { status: 400 });
    }
    if (!competitorUrl || typeof competitorUrl !== "string" || competitorUrl.trim().length === 0) {
      return NextResponse.json({ error: "Competitor URL is required" }, { status: 400 });
    }

    // Run both scans in parallel — each internally runs HTML fetch + robots + sitemap + PageSpeed
    const [primary, competitor] = await Promise.all([
      analyzeUrl(url.trim()),
      analyzeUrl(competitorUrl.trim()),
    ]);

    const result: CompareResult = { primary, competitor };
    return NextResponse.json(result);
  } catch (err) {
    console.error("Compare error:", err);
    return NextResponse.json(
      { error: "Internal server error during comparison" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { AnalysisResult, AiFix, AiFixesResult } from "@/lib/types";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a senior SEO developer and technical content strategist.

Your job: given a website's failed SEO checks, produce SPECIFIC, COPY-PASTE-READY fixes.
Not generic advice. Actual code, content, or markup the user can drop directly into their site.

Rules:
- Use the real URL and page title to make fixes specific to THIS site
- For HTML fixes: provide the exact tag(s) to add
- For schema: provide complete, valid JSON-LD blocks
- For content: write the actual text (meta descriptions, FAQ answers, etc.)
- For config: show the exact file content or setting
- Keep each fix focused and under 200 words
- Never repeat the problem — only give the solution
- If you need to infer business type from the URL/title, do so confidently

Return ONLY a valid JSON array. No markdown, no explanation outside the JSON.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured in .env.local" },
      { status: 500 }
    );
  }

  const client = new OpenAI({ apiKey });

  try {
    const body = await req.json();
    const { result } = body as { result?: AnalysisResult };

    if (!result) {
      return NextResponse.json({ error: "Scan result is required" }, { status: 400 });
    }

    // Top 7 failed checks by impact
    const failedChecks = result.checks
      .filter((c) => !c.passed)
      .sort((a, b) => b.maxScore - a.maxScore)
      .slice(0, 7);

    if (failedChecks.length === 0) {
      return NextResponse.json({
        fixes: [],
        model: "gpt-4o",
        generatedAt: new Date().toISOString(),
      } satisfies AiFixesResult);
    }

    const checksText = failedChecks
      .map((c, i) =>
        `${i + 1}. [${c.category.toUpperCase()}] ${c.name} (checkId: "${c.id}")
   Current state: ${c.detail ?? "Not present"}
   Points available: ${c.maxScore}`
      )
      .join("\n\n");

    const userPrompt = `Website URL: ${result.url}
Page Title: "${result.pageTitle ?? "Unknown"}"

These SEO checks failed. Generate a specific, copy-paste-ready fix for each one.

${checksText}

Return a JSON object with a "fixes" key containing an array, one object per check:
{
  "fixes": [
    {
      "checkId": "exact_check_id_from_above",
      "checkName": "Check Name",
      "category": "seo|aeo|geo",
      "fix": "The exact fix — code, content, or markup ready to use",
      "type": "html|schema|content|config|general"
    }
  ]
}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0.3,
    });

    const rawText = response.choices[0]?.message?.content ?? "";

    // GPT with json_object format returns an object — extract the fixes array
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const rawFixes = Array.isArray(parsed) ? parsed : (parsed.fixes ?? Object.values(parsed)[0]);
    const fixes = Array.isArray(rawFixes) ? (rawFixes as AiFix[]) : [];

    return NextResponse.json({
      fixes,
      model: "gpt-4o",
      generatedAt: new Date().toISOString(),
    } satisfies AiFixesResult);
  } catch (err) {
    console.error("AI fixes error:", err);
    return NextResponse.json(
      { error: `Failed to generate fixes: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

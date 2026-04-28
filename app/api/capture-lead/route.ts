import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface LeadPayload {
  name: string;
  email: string;
  business: string;
  challenge?: string;
  url?: string;
  grade?: string;
  score?: number;
  timestamp?: string;
}

export async function POST(req: NextRequest) {
  try {
    const data: LeadPayload = await req.json();

    // Always log to server (visible in Vercel Function logs)
    console.log("[LEAD]", JSON.stringify(data));

    // Optional: POST to a webhook (Make.com / Zapier / n8n)
    // Set LEAD_WEBHOOK_URL in Vercel env vars to enable
    const webhookUrl = process.env.LEAD_WEBHOOK_URL;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).catch((err) => console.error("[LEAD] Webhook failed:", err));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[LEAD] Error:", err);
    // Return 200 so the client never blocks on a lead capture failure
    return NextResponse.json({ ok: false });
  }
}

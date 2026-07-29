import { NextRequest, NextResponse } from "next/server";
import { setWebhook } from "@/lib/telegram";

export const runtime = "nodejs";

/**
 * Visit once to register the Telegram webhook:
 *   https://inklinesign.com/api/telegram/setup?key=YOUR_CRON_SECRET
 * Points Telegram at /api/telegram/webhook.
 */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const base = process.env.APP_BASE_URL ?? "https://inklinesign.com";
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url = `${base}/api/telegram/webhook${secret ? `?secret=${secret}` : ""}`;
  try {
    const result = await setWebhook(url);
    return NextResponse.json({ ok: true, url, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

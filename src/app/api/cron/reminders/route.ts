import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/reminders  (protected by CRON_SECRET)
 * Nudges signers on pending/in_progress requests that haven't moved in >24h.
 * Max 2 reminders per request. Configure a Vercel Cron to hit this daily.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorised", { status: 401 });
  }

  const db = supabaseAdmin();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: reqs } = await db
    .from("sign_requests")
    .select("id, sender_name, reminder_count, last_reminder_at, expires_at, documents(filename), signers(name, phone_e164, status, sign_order, sign_token)")
    .in("status", ["pending", "in_progress"])
    .lt("reminder_count", 2)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${dayAgo}`)
    .limit(200);

  let nudged = 0;
  for (const r of (reqs ?? []) as unknown as {
    id: string; sender_name: string; expires_at: string;
    documents: { filename: string };
    signers: { name: string; phone_e164: string; status: string; sign_order: number; sign_token: string }[];
  }[]) {
    if (new Date(r.expires_at) < new Date()) continue;

    // Only nudge signers who can act now (pending/viewed).
    const pending = r.signers
      .filter((s) => s.status === "pending" || s.status === "viewed")
      .sort((a, b) => a.sign_order - b.sign_order);
    if (pending.length === 0) continue;

    for (const s of pending) {
      const url = `${process.env.APP_BASE_URL}/sign/${s.sign_token}`;
      await sendText(
        s.phone_e164,
        `Reminder: ${r.sender_name} is waiting on your signature for *${r.documents.filename}*.\n\nSign here: ${url}`
      ).catch(() => {});
      nudged++;
    }

    const currentCount = (r as { reminder_count?: number }).reminder_count ?? 0;
    await db
      .from("sign_requests")
      .update({ reminder_count: currentCount + 1, last_reminder_at: new Date().toISOString() })
      .eq("id", r.id);
    await db.from("audit_events").insert({ request_id: r.id, event_type: "reminder_sent", meta: { count: pending.length } });
  }

  return NextResponse.json({ ok: true, nudged });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendSignRequestEmail } from "@/lib/email";
import { EMAIL_RE } from "@/lib/web";

export const runtime = "nodejs";
export const maxDuration = 30;

const BASE = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";

/**
 * POST /api/web/sent/<id>/resend  — re-email the signing link to pending signers.
 * Body: { email } (owner). Optional { token } to target one signer. Optional
 * { newEmail } (with token) to correct a wrong address before resending.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  // Optional: remind just one signer (by their sign token). Omit to remind all pending.
  const onlyToken = body?.token ? String(body.token) : null;
  // Optional: correct this signer's email before resending (requires token).
  const newEmail = body?.newEmail ? String(body.newEmail).trim().toLowerCase() : null;

  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sign_requests")
    .select("id, sender_email, sender_name, message, document_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  if (email && request.sender_email !== email)
    return NextResponse.json({ error: "This document belongs to another account." }, { status: 403 });

  // Correct a wrong email first, if asked.
  if (newEmail) {
    if (!onlyToken) return NextResponse.json({ error: "Which signer's email?" }, { status: 400 });
    if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ error: `“${newEmail}” doesn't look like a valid email.` }, { status: 400 });
    const { error: upErr } = await db
      .from("signers")
      .update({ email: newEmail })
      .eq("request_id", params.id)
      .eq("sign_token", onlyToken);
    if (upErr) return NextResponse.json({ error: "Couldn't update the email. Please try again." }, { status: 500 });
  }

  const { data: doc } = await db.from("documents").select("filename").eq("id", request.document_id).maybeSingle();
  const filename = doc?.filename ?? "document.pdf";

  const { data: signers } = await db
    .from("signers")
    .select("name, email, sign_token, status")
    .eq("request_id", params.id);

  let sent = 0;
  let pending = 0;
  for (const s of signers ?? []) {
    if (!s.email || s.status === "signed" || s.status === "declined") continue;
    if (onlyToken && s.sign_token !== onlyToken) continue;
    pending++;
    const ok = await sendSignRequestEmail({
      to: s.email,
      signerName: s.name,
      senderName: request.sender_name || "Someone",
      filename,
      signUrl: `${BASE}/sign/${s.sign_token}`,
      message: (request.message as string) || null,
      reminder: true,
    });
    if (ok) sent++;
  }

  if (pending === 0)
    return NextResponse.json({ ok: true, sent: 0, note: "Everyone has already signed, or no signer has an email on file." });
  if (sent === 0)
    return NextResponse.json({ error: "Couldn't send the emails just now. Please try again shortly." }, { status: 502 });
  return NextResponse.json({ ok: true, sent });
}

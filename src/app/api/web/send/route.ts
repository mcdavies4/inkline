import { NextRequest, NextResponse } from "next/server";
import { createDocument, createRequestPending } from "@/lib/requests";
import { supabaseAdmin } from "@/lib/supabase";
import { getAccount, withinTrial } from "@/lib/billing";
import { checkoutOptionsForEmail } from "@/lib/paystack";
import { sendSignRequestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/web/send  (multipart/form-data)
 *
 * The web version's send endpoint — no Telegram needed. A sender enters their
 * email, uploads a PDF, and adds signers (name + optional email). We create the
 * request, email any signer who gave an email their signing link, and return a
 * shareable link per signer for the ones who didn't (or as a fallback).
 *
 * Billing: a 14-day free trial from the sender's first send, then a Paystack
 * subscription. When the trial has ended we return a checkout URL instead.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }

  const senderName = String(form.get("sender_name") ?? "").trim();
  const senderEmail = String(form.get("sender_email") ?? "").trim().toLowerCase();
  const message = String(form.get("message") ?? "").trim() || null;
  const file = form.get("file") as File | null;

  // Extra recipients for the finished copy (comma / space / newline separated).
  const ccEmails = String(form.get("cc_emails") ?? "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let signers: { name: string; email: string | null }[] = [];
  try {
    const raw = JSON.parse(String(form.get("signers") ?? "[]"));
    if (Array.isArray(raw)) {
      signers = raw
        .map((s: { name?: string; email?: string }) => ({
          name: String(s.name ?? "").trim(),
          email: String(s.email ?? "").trim().toLowerCase() || null,
        }))
        .filter((s) => s.name.length > 0);
    }
  } catch {
    /* fall through to validation */
  }

  // ---- Validation ----
  if (!senderName) return NextResponse.json({ error: "Please add your name." }, { status: 400 });
  if (!EMAIL_RE.test(senderEmail))
    return NextResponse.json({ error: "Please enter a valid email so we can send you the signed copy." }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Please attach a PDF to sign." }, { status: 400 });
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: "That PDF is over 20MB — please upload a smaller file." }, { status: 400 });
  if (signers.length === 0)
    return NextResponse.json({ error: "Add at least one signer (a name, and their email if you have it)." }, { status: 400 });
  if (signers.length > 10)
    return NextResponse.json({ error: "Up to 10 signers per document." }, { status: 400 });
  for (const s of signers) {
    if (s.email && !EMAIL_RE.test(s.email))
      return NextResponse.json({ error: `“${s.email}” doesn't look like a valid email.` }, { status: 400 });
  }
  for (const cc of ccEmails) {
    if (!EMAIL_RE.test(cc))
      return NextResponse.json({ error: `“${cc}” doesn't look like a valid email.` }, { status: 400 });
  }
  if (ccEmails.length > 10)
    return NextResponse.json({ error: "Up to 10 extra recipients." }, { status: 400 });

  // ---- Billing gate: active plan or still within the 14-day trial ----
  const accountKey = `web:${senderEmail}`;
  let account;
  try {
    account = await getAccount(accountKey);
  } catch (e) {
    console.error("WEB SEND: getAccount failed —", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  const allowed = account.plan === "active" || withinTrial(account.created_at);
  if (!allowed) {
    const options = await checkoutOptionsForEmail(senderEmail);
    return NextResponse.json(
      {
        error: "Your 14-day free trial has ended.",
        needsSubscription: true,
        options, // [{ currency, label, url }] — one per configured currency
      },
      { status: 402 }
    );
  }

  // ---- Create the document + request ----
  try {
    const doc = await createDocument(Buffer.from(await file.arrayBuffer()), file.name);
    const requestId = await createRequestPending({
      documentId: doc.id,
      senderName,
      senderEmail,
      ccEmails,
      message,
      signers: signers.map((s) => ({
        name: s.name,
        email: s.email,
        // phone_e164 is NOT NULL but not unique — a web marker is fine.
        phone: `web:${s.email ?? "anon"}`,
      })),
      flow: "parallel",
    });

    // Pull the generated tokens back so we can build links + send invites.
    const db = supabaseAdmin();
    const { data: rows } = await db
      .from("signers")
      .select("name, email, sign_token")
      .eq("request_id", requestId)
      .order("sign_order", { ascending: true });

    const results: { name: string; email: string | null; signUrl: string; emailed: boolean }[] = [];
    for (const r of rows ?? []) {
      const signUrl = `${BASE}/sign/${r.sign_token}`;
      let emailed = false;
      if (r.email) {
        emailed = await sendSignRequestEmail({
          to: r.email,
          signerName: r.name,
          senderName,
          filename: doc.filename,
          signUrl,
          message,
        });
      }
      results.push({ name: r.name, email: r.email, signUrl, emailed });
    }

    // Count the send for stats (trial is time-based, so this isn't a gate).
    await db
      .from("accounts")
      .update({ documents_used: (account.documents_used ?? 0) + 1 })
      .eq("phone_e164", accountKey)
      .then(() => {}, () => {});

    return NextResponse.json({ ok: true, requestId, filename: doc.filename, signers: results });
  } catch (e) {
    console.error("WEB SEND: failed —", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't send the document. Please try again." },
      { status: 500 }
    );
  }
}

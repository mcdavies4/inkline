// Shared helpers for the web sender flow — used by both the live send endpoint
// and the draft (save-for-later) endpoints so they stay in lockstep.

import { supabaseAdmin } from "@/lib/supabase";
import { getAccount, withinTrial, type Account } from "@/lib/billing";
import { createRequestPending } from "@/lib/requests";
import { sendSignRequestEmail } from "@/lib/email";

const BASE = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface WebSigner {
  name: string;
  email: string | null;
}

/** Founder/comped emails (comma-separated in FOUNDER_EMAILS) get unlimited web access. */
export function isFounderEmail(email: string): boolean {
  return (process.env.FOUNDER_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Account gate: founder, active plan, or still inside the 7-day trial. */
export async function webSendAllowed(email: string): Promise<{ allowed: boolean; account: Account }> {
  const account = await getAccount(`web:${email.toLowerCase()}`);
  const allowed = isFounderEmail(email) || account.plan === "active" || withinTrial(account.created_at);
  return { allowed, account };
}

/** Normalises + validates the shared compose fields. Returns an error string or null. */
export function validateCompose(input: {
  senderName: string;
  senderEmail: string;
  signers: WebSigner[];
  ccEmails: string[];
  requireSigners?: boolean;
}): string | null {
  if (!input.senderName) return "Please add your name.";
  if (!EMAIL_RE.test(input.senderEmail)) return "Please enter a valid email so we can send you the signed copy.";
  if ((input.requireSigners ?? true) && input.signers.length === 0)
    return "Add at least one signer (a name, and their email if you have it).";
  if (input.signers.length > 10) return "Up to 10 signers per document.";
  for (const s of input.signers) {
    if (s.email && !EMAIL_RE.test(s.email)) return `“${s.email}” doesn't look like a valid email.`;
  }
  for (const cc of input.ccEmails) {
    if (!EMAIL_RE.test(cc)) return `“${cc}” doesn't look like a valid email.`;
  }
  if (input.ccEmails.length > 10) return "Up to 10 extra recipients.";
  return null;
}

/** Parses the signers JSON field into a clean WebSigner[]. */
export function parseSigners(raw: string): WebSigner[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .map((s: { name?: string; email?: string }) => ({
        name: String(s.name ?? "").trim(),
        email: String(s.email ?? "").trim().toLowerCase() || null,
      }))
      .filter((s) => s.name.length > 0);
  } catch {
    return [];
  }
}

export function parseCcEmails(raw: string): string[] {
  return String(raw ?? "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Creates the request + signers from an already-stored document, emails any
 * signer who has an address, and returns a shareable link per signer. Shared by
 * the live send and the draft-send paths.
 */
export async function deliverWebRequest(input: {
  documentId: string;
  filename: string;
  senderName: string;
  senderEmail: string;
  message: string | null;
  ccEmails: string[];
  signers: WebSigner[];
  accountDocsUsed: number;
}): Promise<{ requestId: string; signers: { name: string; email: string | null; signUrl: string; emailed: boolean }[] }> {
  const requestId = await createRequestPending({
    documentId: input.documentId,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    ccEmails: input.ccEmails,
    message: input.message,
    signers: input.signers.map((s) => ({ name: s.name, email: s.email, phone: `web:${s.email ?? "anon"}` })),
    flow: "parallel",
  });

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
        senderName: input.senderName,
        filename: input.filename,
        signUrl,
        message: input.message,
      });
    }
    results.push({ name: r.name, email: r.email, signUrl, emailed });
  }

  await db
    .from("accounts")
    .update({ documents_used: (input.accountDocsUsed ?? 0) + 1 })
    .eq("phone_e164", `web:${input.senderEmail.toLowerCase()}`)
    .then(() => {}, () => {});

  return { requestId, signers: results };
}

/**
 * Delivers a web request that already exists AND has had its signature fields
 * placed by the sender (via the /place editor). Emails every signer who has an
 * address their signing link, and counts the send against the account.
 * Mirrors deliverWebRequest's email step, but for an already-created request.
 */
export async function deliverPlacedWebRequest(requestId: string): Promise<{ delivered: boolean }> {
  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sign_requests")
    .select("*, documents(filename)")
    .eq("id", requestId)
    .single();
  if (!request) throw new Error("Request not found");
  const filename = (request.documents as { filename?: string } | null)?.filename ?? "document.pdf";

  const { data: rows } = await db
    .from("signers")
    .select("name, email, sign_token")
    .eq("request_id", requestId)
    .order("sign_order", { ascending: true });

  let delivered = false;
  for (const r of rows ?? []) {
    if (!r.email) continue;
    const ok = await sendSignRequestEmail({
      to: r.email,
      signerName: r.name,
      senderName: request.sender_name,
      filename,
      signUrl: `${BASE}/sign/${r.sign_token}`,
      message: request.message ?? null,
    });
    if (ok) delivered = true;
  }

  // Count this send against the account (once, at delivery time).
  if (request.sender_email) {
    const key = `web:${String(request.sender_email).toLowerCase()}`;
    const { data: acct } = await db.from("accounts").select("documents_used").eq("phone_e164", key).maybeSingle();
    await db
      .from("accounts")
      .update({ documents_used: (acct?.documents_used ?? 0) + 1 })
      .eq("phone_e164", key)
      .then(() => {}, () => {});
  }

  return { delivered };
}

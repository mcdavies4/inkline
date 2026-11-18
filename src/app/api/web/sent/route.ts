import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { EMAIL_RE } from "@/lib/web";

export const runtime = "nodejs";
export const maxDuration = 30;

const BASE = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";

/**
 * GET /api/web/sent?email=...  — a web sender's sent documents, newest first,
 * with each signer's status and link, so they can resend invites or copy links.
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: reqs, error } = await db
    .from("sign_requests")
    .select("id, status, created_at, document_id")
    .eq("sender_email", email)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("SENT: list failed —", error.message);
    return NextResponse.json({ error: "Couldn't load your documents." }, { status: 500 });
  }
  if (!reqs || reqs.length === 0) return NextResponse.json({ ok: true, documents: [] });

  const reqIds = reqs.map((r) => r.id);
  const docIds = Array.from(new Set(reqs.map((r) => r.document_id).filter(Boolean)));
  const [{ data: signers }, { data: docs }] = await Promise.all([
    db.from("signers").select("request_id, name, email, sign_token, status, signed_at").in("request_id", reqIds),
    docIds.length ? db.from("documents").select("id, filename").in("id", docIds) : Promise.resolve({ data: [] as { id: string; filename: string }[] }),
  ]);

  const nameOf = new Map((docs ?? []).map((d) => [d.id, d.filename]));
  const byReq = new Map<string, { name: string; email: string | null; status: string; signedAt: string | null; token: string; signUrl: string }[]>();
  for (const s of signers ?? []) {
    const arr = byReq.get(s.request_id) ?? [];
    arr.push({ name: s.name, email: s.email, status: s.status, signedAt: s.signed_at ?? null, token: s.sign_token, signUrl: `${BASE}/sign/${s.sign_token}` });
    byReq.set(s.request_id, arr);
  }

  const documents = reqs.map((r) => {
    const sgs = byReq.get(r.id) ?? [];
    return {
      id: r.id,
      filename: nameOf.get(r.document_id) ?? "document.pdf",
      status: r.status,
      createdAt: r.created_at,
      signers: sgs,
      pendingWithEmail: sgs.filter((s) => s.email && s.status !== "signed" && s.status !== "declined").length,
    };
  });

  return NextResponse.json({ ok: true, documents });
}

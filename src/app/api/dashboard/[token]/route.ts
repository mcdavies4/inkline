import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = supabaseAdmin();
  const { data: tok } = await db
    .from("dashboard_tokens")
    .select("*")
    .eq("token", params.token)
    .maybeSingle();

  if (!tok) return NextResponse.json({ error: "This dashboard link is not valid." }, { status: 404 });
  if (new Date(tok.expires_at) < new Date()) {
    return NextResponse.json({ error: "This dashboard link has expired. Send DASHBOARD to the bot for a new one." }, { status: 410 });
  }

  const { data: reqs } = await db
    .from("sign_requests")
    .select("id, status, created_at, completed_at, signing_flow, signed_pdf_path, documents(filename), signers(name, status, signed_at)")
    .eq("sender_phone", tok.sender_phone)
    .order("created_at", { ascending: false })
    .limit(100);

  // Attach short-lived download URLs for completed docs
  const rows = [];
  for (const r of (reqs ?? []) as unknown as {
    id: string; status: string; created_at: string; completed_at: string | null;
    signing_flow: string; signed_pdf_path: string | null;
    documents: { filename: string }; signers: { name: string; status: string; signed_at: string | null }[];
  }[]) {
    let downloadUrl: string | null = null;
    if (r.status === "signed" && r.signed_pdf_path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(r.signed_pdf_path, 1800);
      downloadUrl = data?.signedUrl ?? null;
    }
    rows.push({
      id: r.id,
      filename: r.documents.filename,
      status: r.status,
      flow: r.signing_flow,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      signers: r.signers.map((s) => ({ name: s.name, status: s.status })),
      downloadUrl,
    });
  }

  return NextResponse.json({ senderPhone: tok.sender_phone, requests: rows });
}

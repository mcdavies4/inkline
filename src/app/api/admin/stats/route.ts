import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin stats. POST { key } — key must match ADMIN_DASHBOARD_KEY.
 * Kept as POST so the key never lands in browser history or server logs.
 */
export async function POST(req: NextRequest) {
  const { key } = await req.json().catch(() => ({ key: null }));
  const expected = process.env.ADMIN_DASHBOARD_KEY;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const DAY = 86_400_000;

  const [
    accounts,
    requests,
    signers,
    documents,
  ] = await Promise.all([
    db.from("accounts").select("phone_e164, plan, documents_used, created_at").limit(1000),
    db
      .from("sign_requests")
      .select("id, sender_name, sender_chat_id, status, placement, created_at, documents(filename)")
      .order("created_at", { ascending: false })
      .limit(500),
    db.from("signers").select("id, request_id, status, created_at").limit(2000),
    db.from("documents").select("size_bytes, created_at").limit(1000),
  ]);

  const acc = (accounts.data ?? []) as { phone_e164: string; plan: string; documents_used: number; created_at: string }[];
  const reqs = (requests.data ?? []) as unknown as {
    id: string;
    sender_name: string | null;
    sender_chat_id: string | null;
    status: string;
    placement: string | null;
    created_at: string;
    documents: { filename: string } | null;
  }[];
  const sgs = (signers.data ?? []) as { id: string; request_id: string; status: string; created_at: string }[];
  const docs = (documents.data ?? []) as { size_bytes: number | null; created_at: string }[];

  const since = (rows: { created_at: string }[], ms: number) =>
    rows.filter((r) => new Date(r.created_at).getTime() > now - ms).length;

  // Per-sender breakdown
  const bySender = new Map<string, { name: string; docs: number; signed: number; last: string }>();
  for (const r of reqs) {
    const k = r.sender_chat_id ?? r.sender_name ?? "unknown";
    const e = bySender.get(k);
    if (e) {
      e.docs += 1;
      if (r.status === "signed") e.signed += 1;
      if (r.created_at > e.last) e.last = r.created_at;
    } else {
      bySender.set(k, {
        name: r.sender_name ?? "Unknown",
        docs: 1,
        signed: r.status === "signed" ? 1 : 0,
        last: r.created_at,
      });
    }
  }

  // 14-day activity sparkline
  const daily: { day: string; docs: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = now - (i + 1) * DAY;
    const end = now - i * DAY;
    daily.push({
      day: new Date(end).toISOString().slice(5, 10),
      docs: reqs.filter((r) => {
        const t = new Date(r.created_at).getTime();
        return t > start && t <= end;
      }).length,
    });
  }

  const totalDocs = reqs.length;
  const signedDocs = reqs.filter((r) => r.status === "signed").length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: {
      senders: acc.length,
      subscribers: acc.filter((a) => a.plan === "active").length,
      pastDue: acc.filter((a) => a.plan === "past_due").length,
      cancelled: acc.filter((a) => a.plan === "cancelled").length,
      documents: totalDocs,
      signed: signedDocs,
      pending: reqs.filter((r) => r.status === "pending" || r.status === "in_progress").length,
      completionRate: totalDocs ? Math.round((signedDocs / totalDocs) * 100) : 0,
      signers: sgs.length,
      signersSigned: sgs.filter((s) => s.status === "signed").length,
      storageMb: Math.round((docs.reduce((n, d) => n + (d.size_bytes ?? 0), 0) / 1_048_576) * 10) / 10,
      withPlacement: reqs.filter((r) => r.placement && r.placement !== "none").length,
    },
    recent: {
      docs24h: since(reqs, DAY),
      docs7d: since(reqs, 7 * DAY),
      docs30d: since(reqs, 30 * DAY),
      senders7d: since(acc, 7 * DAY),
    },
    daily,
    senders: Array.from(bySender.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.docs - a.docs)
      .slice(0, 40),
    latest: reqs.slice(0, 25).map((r) => ({
      id: r.id.slice(0, 8),
      sender: r.sender_name ?? "Unknown",
      filename: r.documents?.filename ?? "—",
      status: r.status,
      created_at: r.created_at,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createStripeCheckout, PRICING } from "@/lib/billing";
import { webSendAllowed, deliverWebRequest, type WebSigner } from "@/lib/web";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/web/draft/<id>  — send a saved draft now.
 * Applies the same billing gate as a live send, then delivers and deletes the
 * draft. Body: { email } (must own the draft).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();

  const db = supabaseAdmin();
  const { data: draft } = await db.from("web_drafts").select("*").eq("id", params.id).maybeSingle();
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (email && draft.sender_email !== email)
    return NextResponse.json({ error: "This draft belongs to another account." }, { status: 403 });

  const senderEmail = draft.sender_email as string;
  const senderName = (draft.sender_name as string) || "";
  const signers: WebSigner[] = Array.isArray(draft.signers)
    ? (draft.signers as { name?: string; email?: string }[]).map((s) => ({
        name: String(s.name ?? "").trim(),
        email: (s.email ? String(s.email).trim().toLowerCase() : null) || null,
      })).filter((s) => s.name)
    : [];

  if (!senderName) return NextResponse.json({ error: "Add your name to the draft before sending." }, { status: 400 });
  if (!draft.document_id) return NextResponse.json({ error: "This draft has no document attached." }, { status: 400 });
  if (signers.length === 0) return NextResponse.json({ error: "Add at least one signer before sending." }, { status: 400 });

  // ---- Gate: founder, active plan, or inside the trial ----
  const gate = await webSendAllowed(senderEmail);
  if (!gate.allowed) {
    const [monthly, annual] = await Promise.all([
      createStripeCheckout(`web:${senderEmail}`, "monthly"),
      createStripeCheckout(`web:${senderEmail}`, "annual"),
    ]);
    const plans = [
      monthly ? { plan: "monthly", label: PRICING.monthly, url: monthly } : null,
      annual ? { plan: "annual", label: PRICING.annual, url: annual } : null,
    ].filter(Boolean);
    return NextResponse.json(
      {
        error: "Your 7-day free trial has ended.",
        needsSubscription: true,
        plans,
        checkoutUrl: monthly,
        priceLabel: PRICING.monthly,
      },
      { status: 402 }
    );
  }

  try {
    const { requestId, signers: results } = await deliverWebRequest({
      documentId: draft.document_id as string,
      filename: (draft.filename as string) || "document.pdf",
      senderName,
      senderEmail,
      message: (draft.message as string) || null,
      ccEmails: String(draft.cc_emails ?? "").split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean),
      signers,
      accountDocsUsed: gate.account.documents_used,
    });
    // Draft is now a live request — remove it.
    await db.from("web_drafts").delete().eq("id", params.id);
    return NextResponse.json({ ok: true, requestId, filename: draft.filename, signers: results });
  } catch (e) {
    console.error("DRAFT SEND: failed —", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't send the draft. Please try again." },
      { status: 500 }
    );
  }
}

/** DELETE /api/web/draft/<id>?email=...  — discard a draft. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  const db = supabaseAdmin();
  const q = db.from("web_drafts").delete().eq("id", params.id);
  if (email) q.eq("sender_email", email);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Couldn't delete the draft." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

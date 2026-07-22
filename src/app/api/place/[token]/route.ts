import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

async function loadByToken(token: string) {
  const db = supabaseAdmin();
  const { data: tok } = await db
    .from("placement_tokens")
    .select("*, sign_requests(*, documents(*), signers(id,name,sign_order))")
    .eq("token", token)
    .maybeSingle();
  if (!tok) return null;
  return { db, tok, request: tok.sign_requests, document: tok.sign_requests.documents };
}

/** GET — document URL + signer list for the placement UI */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const ctx = await loadByToken(params.token);
  if (!ctx) return NextResponse.json({ error: "This placement link is not valid." }, { status: 404 });
  const { db, tok, request, document } = ctx;

  if (new Date(tok.expires_at) < new Date()) {
    return NextResponse.json({ error: "This placement link has expired." }, { status: 410 });
  }
  if (request.placement === "done") {
    return NextResponse.json({ error: "Fields have already been placed for this document." }, { status: 409 });
  }

  const { data: pdfUrl } = await db.storage
    .from(BUCKET)
    .createSignedUrl(document.storage_path, 60 * 30);

  const signers = [...request.signers].sort(
    (a: { sign_order: number }, b: { sign_order: number }) => a.sign_order - b.sign_order
  );

  return NextResponse.json({
    filename: document.filename,
    pdfUrl: pdfUrl?.signedUrl ?? null,
    signers: signers.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
    multiSigner: signers.length > 1,
  });
}

/** POST — save placed fields, mark placement done, trigger delivery */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ctx = await loadByToken(params.token);
  if (!ctx) return NextResponse.json({ error: "This placement link is not valid." }, { status: 404 });
  const { db, tok, request } = ctx;

  if (new Date(tok.expires_at) < new Date()) {
    return NextResponse.json({ error: "This placement link has expired." }, { status: 410 });
  }
  if (request.placement === "done") {
    return NextResponse.json({ error: "Fields already placed." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const fields = body?.fields as
    | {
        type: string;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
        signerId?: string | null;
        fillMode?: string;
      }[]
    | undefined;

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "Place at least one field." }, { status: 400 });
  }
  if (fields.length > 60) {
    return NextResponse.json({ error: "Too many fields." }, { status: 400 });
  }

  const valid = ["signature", "date", "initials", "text"];
  const rows = fields
    .filter((f) => valid.includes(f.type))
    .map((f) => ({
      request_id: request.id,
      signer_id: f.signerId ?? null,
      type: f.type,
      page: Math.max(0, Math.floor(f.page)),
      x: clamp01(f.x),
      y: clamp01(f.y),
      w: clamp01(f.w),
      h: clamp01(f.h),
      fill_mode: f.type === "date" ? (f.fillMode === "signer" ? "signer" : "auto") : "auto",
    }));

  const { error } = await db.from("doc_fields").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("sign_requests").update({ placement: "done" }).eq("id", request.id);
  await db.from("placement_tokens").update({ used_at: new Date().toISOString() }).eq("token", params.token);

  // Kick off delivery now that fields are placed, and tell the sender how it went.
  const { deliverPlacedRequest } = await import("@/lib/requests");
  const { sendText } = await import("@/lib/whatsapp");

  let delivered = false;
  let signUrl: string | null = null;
  try {
    const result = await deliverPlacedRequest(request.id);
    delivered = result.delivered;
    signUrl = result.signUrl;
  } catch (e) {
    console.error("PLACE: delivery failed —", e instanceof Error ? e.message : e);
  }

  if (request.sender_phone) {
    const ref = request.id.slice(0, 8);
    if (delivered) {
      await sendText(
        request.sender_phone,
        `Sent ✓ Your document is with the signer${request.signing_flow === "sequential" ? "s — they'll be notified in turn" : "(s)"}, with the fields exactly where you placed them.\n\nI'll send you the signed copy when it's done. Ref: ${ref}`
      ).catch(() => {});
    } else {
      await sendText(
        request.sender_phone,
        `Your fields are saved, but I couldn't deliver the document on WhatsApp. Share this signing link directly:\n${signUrl ?? "(link unavailable)"}\n\nRef: ${ref}`
      ).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, delivered });
}

function clamp01(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

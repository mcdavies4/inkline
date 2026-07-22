import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "@/lib/supabase";
import { stampAndCertify } from "@/lib/pdf";
import { sendDocument, sendText, sendTemplate } from "@/lib/whatsapp";
import { hashOtp, issueOtp, advanceAfterSignature, buildAndDeliverFinal } from "@/lib/requests";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadContext(token: string) {
  const db = supabaseAdmin();
  const { data: signer } = await db
    .from("signers")
    .select("*, sign_requests(*, documents(*))")
    .eq("sign_token", token)
    .single();
  if (!signer) return null;
  return { db, signer, request: signer.sign_requests, document: signer.sign_requests.documents };
}

/** GET — signing page data */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const ctx = await loadContext(params.token);
  if (!ctx) return NextResponse.json({ error: t("page_invalid") }, { status: 404 });
  const { db, signer, request, document } = ctx;

  if (new Date(request.expires_at) < new Date() && ["pending", "in_progress"].includes(request.status)) {
    return NextResponse.json({ error: t("page_expired") }, { status: 410 });
  }

  // This individual signer already signed
  if (signer.status === "signed") {
    let signedPdfUrl: string | null = null;
    if (request.status === "signed" && request.signed_pdf_path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(request.signed_pdf_path, 1800);
      signedPdfUrl = data?.signedUrl ?? null;
    }
    return NextResponse.json({
      status: request.status === "signed" ? "signed" : "waiting_others",
      signerName: signer.name,
      senderName: request.sender_name,
      filename: document.filename,
      signedPdfUrl,
    });
  }

  // Sequential gating: is it this signer's turn?
  if (request.signing_flow === "sequential") {
    const { data: earlier } = await db
      .from("signers")
      .select("sign_order,status")
      .eq("request_id", request.id)
      .lt("sign_order", signer.sign_order);
    const blocked = (earlier ?? []).some((s) => s.status !== "signed");
    if (blocked) {
      return NextResponse.json({ error: "It's not your turn to sign yet — you'll be notified." }, { status: 423 });
    }
  }

  const { data: signedUrl } = await db.storage
    .from(BUCKET)
    .createSignedUrl(document.storage_path, 1800);

  if (signer.status === "pending") {
    await db.from("signers").update({ status: "viewed" }).eq("id", signer.id);
    await db.from("audit_events").insert({
      request_id: request.id,
      signer_id: signer.id,
      event_type: "link_opened",
      meta: {
        ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null,
        user_agent: req.headers.get("user-agent"),
      },
    });
    // Fire the OTP the first time they open, if required
    if (request.require_otp && !signer.otp_verified_at) {
      await issueOtp(signer.id, signer.phone_e164);
    }
  }

  // Load this signer's fields (plus unassigned/any-signer fields), if placement was used.
  let fields: unknown[] = [];
  if (request.placement === "done") {
    const { data: fieldRows } = await db
      .from("doc_fields")
      .select("*")
      .eq("request_id", request.id)
      .or(`signer_id.eq.${signer.id},signer_id.is.null`)
      .order("page", { ascending: true });
    fields = (fieldRows ?? []).map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      w: f.w,
      h: f.h,
      fillMode: f.fill_mode,
    }));
  }

  return NextResponse.json({
    status: "ready",
    signerName: signer.name,
    senderName: request.sender_name,
    message: request.message,
    filename: document.filename,
    pdfUrl: signedUrl?.signedUrl ?? null,
    requireOtp: request.require_otp && !signer.otp_verified_at,
    summary: request.ai_summary ?? null,
    hasPlacement: request.placement === "done",
    fields,
  });
}

/** POST — verify OTP or submit signature */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const ctx = await loadContext(params.token);
  if (!ctx) return NextResponse.json({ error: t("page_invalid") }, { status: 404 });
  const { db, signer, request, document } = ctx;

  const body = await req.json().catch(() => null);

  // ---- OTP verification branch ----
  if (body?.otp) {
    if (!request.require_otp || signer.otp_verified_at) {
      return NextResponse.json({ ok: true }); // nothing to do
    }
    if (signer.otp_code && hashOtp(String(body.otp)) === signer.otp_code) {
      await db
        .from("signers")
        .update({ otp_verified_at: new Date().toISOString(), otp_code: null })
        .eq("id", signer.id);
      await db.from("audit_events").insert({
        request_id: request.id,
        signer_id: signer.id,
        event_type: "otp_verified",
        meta: {},
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: t("page_otp_wrong") }, { status: 400 });
  }

  // ---- Signature branch ----
  if (["signed", "cancelled", "expired"].includes(request.status) && request.signing_flow === "single") {
    return NextResponse.json({ error: t("page_completed") }, { status: 409 });
  }
  if (signer.status === "signed") {
    return NextResponse.json({ error: t("page_completed") }, { status: 409 });
  }
  if (new Date(request.expires_at) < new Date()) {
    return NextResponse.json({ error: t("page_expired") }, { status: 410 });
  }
  if (request.require_otp && !signer.otp_verified_at) {
    return NextResponse.json({ error: "Please verify the code first." }, { status: 403 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  // ---- Placement branch: signer fills their specific fields ----
  if (request.placement === "done" && Array.isArray(body?.fieldValues)) {
    const fieldValues = body.fieldValues as { id: string; value?: string; png?: string }[];

    // Load this signer's fields to validate against
    const { data: myFields } = await db
      .from("doc_fields")
      .select("*")
      .eq("request_id", request.id)
      .or(`signer_id.eq.${signer.id},signer_id.is.null`);

    type FieldRow = { id: string; type: string; fill_mode: string };
    const byId = new Map<string, FieldRow>((myFields ?? []).map((f) => [f.id as string, f as FieldRow]));

    for (const fv of fieldValues) {
      const field = byId.get(fv.id);
      if (!field) continue;

      if ((field.type === "signature" || field.type === "initials") && fv.png?.startsWith("data:image/png;base64,")) {
        const bytes = Buffer.from(fv.png.split(",")[1], "base64");
        if (bytes.length > 500_000) continue;
        const path = `fieldimg/${field.id}.png`;
        await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", upsert: true });
        await db.from("doc_fields").update({ value_path: path, filled_at: new Date().toISOString() }).eq("id", field.id);
      } else if (field.type === "date") {
        const val = field.fill_mode === "auto" ? new Date().toISOString().slice(0, 10) : (fv.value ?? "").slice(0, 40);
        await db.from("doc_fields").update({ value: val, filled_at: new Date().toISOString() }).eq("id", field.id);
      } else if (field.type === "text") {
        await db.from("doc_fields").update({ value: (fv.value ?? "").slice(0, 200), filled_at: new Date().toISOString() }).eq("id", field.id);
      }
    }

    // Mark this signer done
    await db
      .from("signers")
      .update({ status: "signed", signed_at: new Date().toISOString(), ip, user_agent: ua })
      .eq("id", signer.id);
    await db.from("audit_events").insert({
      request_id: request.id,
      signer_id: signer.id,
      event_type: "signed",
      meta: { ip, user_agent: ua, placement: true },
    });

    const { allDone } = await advanceAfterSignature(request.id);
    if (!allDone) return NextResponse.json({ ok: true, status: "waiting_others" });

    const finalUrl = await buildAndDeliverFinal(request.id, params.token);
    return NextResponse.json({ ok: true, status: "signed", signedPdfUrl: finalUrl });
  }

  const dataUrl: string | undefined = body?.signaturePng;
  if (!dataUrl?.startsWith("data:image/png;base64,")) {
    return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  }
  const sigBytes = Buffer.from(dataUrl.split(",")[1], "base64");
  if (sigBytes.length > 500_000) {
    return NextResponse.json({ error: "Signature image too large." }, { status: 400 });
  }

  // Store this signer's signature image
  const sigPath = `signatures/${signer.id}.png`;
  await db.storage.from(BUCKET).upload(sigPath, sigBytes, { contentType: "image/png", upsert: true });

  await db
    .from("signers")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_path: sigPath,
      ip,
      user_agent: ua,
    })
    .eq("id", signer.id);

  await db.from("audit_events").insert({
    request_id: request.id,
    signer_id: signer.id,
    event_type: "signed",
    meta: { ip, user_agent: ua, otp: Boolean(request.require_otp) },
  });

  // Advance the flow (notifies next signer / marks complete)
  const { allDone } = await advanceAfterSignature(request.id);

  if (!allDone) {
    return NextResponse.json({ ok: true, status: "waiting_others" });
  }

  const finalUrl = await buildAndDeliverFinal(request.id, params.token);
  return NextResponse.json({ ok: true, status: "signed", signedPdfUrl: finalUrl });
}

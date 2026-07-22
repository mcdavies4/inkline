import { createHash, randomBytes, randomInt } from "crypto";
import { supabaseAdmin, BUCKET } from "@/lib/supabase";
import { sendDocument, sendCtaLink, sendText, sendTemplate } from "@/lib/whatsapp";
import { t } from "@/lib/i18n";
import { extractPdfText } from "@/lib/doctext";
import { summariseDocument } from "@/lib/summary";

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Stores an original PDF and returns the documents row. */
export async function createDocument(bytes: Buffer, filename: string) {
  const db = supabaseAdmin();
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const { data: doc, error } = await db
    .from("documents")
    .insert({ filename, storage_path: "pending", sha256, size_bytes: bytes.length })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const storagePath = `originals/${doc.id}.pdf`;
  const up = await db.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
  });
  if (up.error) throw new Error(up.error.message);
  await db.from("documents").update({ storage_path: storagePath }).eq("id", doc.id);

  return { ...doc, storage_path: storagePath };
}

export interface SignerInput {
  phone: string;
  name: string;
}

export interface CreateRequestInput {
  documentId: string;
  signers: SignerInput[];
  senderName: string;
  senderPhone?: string | null;
  message?: string | null;
  flow?: "sequential" | "parallel";
  requireOtp?: boolean;
  mode?: "signature" | "quick_approval";
}

/** Creates the request + signers but does NOT deliver. Returns the request id. */
export async function createRequestPending(input: CreateRequestInput): Promise<string> {
  const db = supabaseAdmin();
  const mode = input.mode ?? "signature";
  const flow = input.signers.length > 1 ? input.flow ?? "parallel" : "single";

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select()
    .eq("id", input.documentId)
    .single();
  if (docErr || !doc) throw new Error("Document not found");

  let aiSummary: string | null = null;
  try {
    const { data: file } = await db.storage.from(BUCKET).download(doc.storage_path);
    if (file) {
      const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
      aiSummary = await summariseDocument(text);
    }
  } catch {
    /* summary optional */
  }

  const { data: request, error: reqErr } = await db
    .from("sign_requests")
    .insert({
      document_id: doc.id,
      sender_name: input.senderName,
      sender_phone: input.senderPhone ?? null,
      message: input.message ?? null,
      mode,
      signing_flow: flow,
      require_otp: input.requireOtp ?? false,
      ai_summary: aiSummary,
      status: "pending",
    })
    .select()
    .single();
  if (reqErr) throw new Error(reqErr.message);

  const signerRows = input.signers.map((s, i) => ({
    request_id: request.id,
    phone_e164: s.phone,
    name: s.name,
    sign_token: randomBytes(24).toString("base64url"),
    sign_order: i + 1,
  }));
  const { error: sErr } = await db.from("signers").insert(signerRows).select();
  if (sErr) throw new Error(sErr.message);

  await db.from("audit_events").insert({
    request_id: request.id,
    event_type: "request_created",
    meta: { sender_name: input.senderName, flow, signers: input.signers.length },
  });

  return request.id as string;
}

/** Delivers a request that already exists (fields placed or skipped). */
export async function deliverPlacedRequest(requestId: string) {
  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sign_requests")
    .select("*, documents(*)")
    .eq("id", requestId)
    .single();
  if (!request) throw new Error("Request not found");
  const doc = request.documents;

  const { data: signers } = await db
    .from("signers")
    .select("*")
    .eq("request_id", requestId)
    .order("sign_order", { ascending: true });
  if (!signers || signers.length === 0) throw new Error("No signers");

  const ordered = [...signers];
  const toNotify = request.signing_flow === "sequential" ? [ordered[0]] : ordered;

  let anyDelivered = false;
  for (const signer of toNotify) {
    const ok = await deliverToSigner(request, doc, signer, request.sender_name, request.message, request.mode);
    anyDelivered = anyDelivered || ok;
  }

  return {
    requestId,
    delivered: anyDelivered,
    signUrl: `${process.env.APP_BASE_URL}/sign/${ordered[0].sign_token}`,
  };
}

/** Convenience wrapper: create then immediately deliver (used by the single-signer API). */
export async function createAndDeliverRequest(input: CreateRequestInput) {
  const requestId = await createRequestPending(input);
  return deliverPlacedRequest(requestId);
}

async function deliverToSigner(
  request: { id: string; mode: string },
  doc: { filename: string; storage_path: string },
  signer: { id: string; name: string; phone_e164: string; sign_token: string },
  senderName: string,
  message: string | null,
  mode: string
): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: signedUrl } = await db.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 60 * 24 * 7);
  const signUrl = `${process.env.APP_BASE_URL}/sign/${signer.sign_token}`;
  const template = process.env.WHATSAPP_TEMPLATE_SIGNATURE_REQUEST;

  // WHY TEMPLATE FIRST: WhatsApp only DELIVERS freeform messages (text, document,
  // CTA) to a number with an open 24-hour window. For a signer who hasn't messaged
  // the bot, the API ACCEPTS the freeform send (returns 200, no error) but SILENTLY
  // DROPS it. That's why signers "got nothing" while the send logged as success.
  // The approved template is the ONLY message type that delivers regardless of
  // window — so it must be the primary, guaranteed path.
  let delivered = false;

  if (template) {
    try {
      // Body: "Hi, {{1}} has sent you a document to sign: {{2}}..."  (no button param)
      await sendTemplate(signer.phone_e164, template, [senderName, doc.filename]);
      delivered = true;
      await db.from("audit_events").insert({
        request_id: request.id,
        signer_id: signer.id,
        event_type: "wa_sent",
        meta: { channel: "template" },
      });
    } catch (e) {
      console.error("deliverToSigner: template send failed —", e instanceof Error ? e.message : e);
    }
  }

  // ENHANCEMENT: also send the actual link as freeform. Delivers only if the
  // signer has an open window; harmless if not (template already notified them).
  // The link is embedded directly in the text so it's ALWAYS tappable — we do
  // NOT rely on interactive buttons ("tap below"), which can fail to render.
  try {
    await sendText(
      signer.phone_e164,
      `${t("sign_cta_body", { name: signer.name.split(" ")[0] })}\n${signUrl}`
    );
    if (signedUrl?.signedUrl) {
      await sendDocument(signer.phone_e164, signedUrl.signedUrl, doc.filename).catch(() => {});
    }
    if (!delivered) {
      delivered = true;
      await db.from("audit_events").insert({
        request_id: request.id,
        signer_id: signer.id,
        event_type: "wa_sent",
        meta: { channel: "freeform" },
      });
    }
  } catch (e) {
    console.error("deliverToSigner: freeform enhancement failed (window likely closed) —", e instanceof Error ? e.message : e);
  }

  return delivered;
}


export async function issueOtp(signerId: string, phone: string): Promise<void> {
  const db = supabaseAdmin();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("signers").update({ otp_code: hashOtp(code) }).eq("id", signerId);
  await sendText(phone, t("sign_otp_message", { code }));
}

export async function advanceAfterSignature(requestId: string): Promise<{ allDone: boolean }> {
  const db = supabaseAdmin();
  const { data: request } = await db
    .from("sign_requests")
    .select("*, documents(*)")
    .eq("id", requestId)
    .single();
  if (!request) return { allDone: false };

  const { data: signers } = await db
    .from("signers")
    .select("*")
    .eq("request_id", requestId)
    .order("sign_order", { ascending: true });
  if (!signers) return { allDone: false };

  const remaining = signers.filter((s) => s.status !== "signed");

  if (remaining.length === 0) {
    await db
      .from("sign_requests")
      .update({ status: "signed", completed_at: new Date().toISOString() })
      .eq("id", requestId);
    return { allDone: true };
  }

  await db.from("sign_requests").update({ status: "in_progress" }).eq("id", requestId);

  if (request.signing_flow === "sequential") {
    const next = remaining[0];
    if (next.status === "pending") {
      await deliverToSigner(request, request.documents, next, request.sender_name, request.message, request.mode);
    }
  }

  if (request.sender_phone) {
    const justSigned = signers.find((s) => s.status === "signed");
    await sendText(
      request.sender_phone,
      t("sign_sender_progress", {
        name: justSigned?.name ?? "A signer",
        filename: request.documents.filename,
        remaining: remaining.length,
      })
    ).catch(() => {});
  }

  return { allDone: false };
}

/**
 * Builds the final certified PDF (placed fields OR legacy bottom signatures),
 * stores it, and delivers to all signers + sender. Returns a download URL.
 */
export async function buildAndDeliverFinal(requestId: string, senderTokenForTemplate: string): Promise<string | null> {
  const { stampAndCertify } = await import("@/lib/pdf");
  const { sendDocument, sendText, sendTemplate } = await import("@/lib/whatsapp");
  const { t } = await import("@/lib/i18n");
  const db = supabaseAdmin();

  const { data: request } = await db
    .from("sign_requests")
    .select("*, documents(*)")
    .eq("id", requestId)
    .single();
  if (!request) return null;
  const document = request.documents;

  const { data: allSigners } = await db
    .from("signers")
    .select("*")
    .eq("request_id", requestId)
    .order("sign_order", { ascending: true });

  const { data: origFile } = await db.storage.from(BUCKET).download(document.storage_path);
  if (!origFile) return null;

  const { data: events } = await db
    .from("audit_events")
    .select("event_type, created_at, meta")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  // Signature blocks (used for the legacy bottom stamp AND the certificate list)
  const sigImages: { name: string; phone: string; png: Uint8Array; signedAt: string }[] = [];
  for (const s of allSigners ?? []) {
    if (!s.signature_path) continue;
    const { data: img } = await db.storage.from(BUCKET).download(s.signature_path);
    if (img) {
      sigImages.push({
        name: s.name,
        phone: s.phone_e164,
        png: new Uint8Array(await img.arrayBuffer()),
        signedAt: (s.signed_at ?? "").replace("T", " ").slice(0, 19),
      });
    }
  }

  // Placed fields, if any
  let placedFields:
    | { type: "signature" | "date" | "initials" | "text"; page: number; x: number; y: number; w: number; h: number; value?: string | null; png?: Uint8Array | null }[]
    | undefined;
  if (request.placement === "done") {
    const { data: fields } = await db.from("doc_fields").select("*").eq("request_id", requestId);
    placedFields = [];
    for (const f of fields ?? []) {
      let png: Uint8Array | null = null;
      if (f.value_path) {
        const { data: img } = await db.storage.from(BUCKET).download(f.value_path);
        if (img) png = new Uint8Array(await img.arrayBuffer());
      }
      placedFields.push({ type: f.type, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h, value: f.value, png });
    }
    // If we have placed fields but a signer used the fallback signature, still ensure at least one has content
    if (placedFields.length === 0) placedFields = undefined;
  }

  const finalPdf = await stampAndCertify({
    originalPdf: new Uint8Array(await origFile.arrayBuffer()),
    signatures: sigImages,
    placedFields,
    requestId,
    sha256: document.sha256,
    events: events ?? [],
  });

  const signedPath = `signed/${requestId}.pdf`;
  await db.storage.from(BUCKET).upload(signedPath, Buffer.from(finalPdf), { contentType: "application/pdf", upsert: true });
  await db.from("sign_requests").update({ signed_pdf_path: signedPath }).eq("id", requestId);

  const { data: dl } = await db.storage.from(BUCKET).createSignedUrl(signedPath, 60 * 60 * 24 * 7);
  const recipients = new Map<string, string>();
  for (const s of allSigners ?? []) recipients.set(s.phone_e164, s.name);
  if (request.sender_phone) recipients.set(request.sender_phone, request.sender_name);

  if (dl?.signedUrl) {
    const signedName = document.filename.replace(/\.pdf$/i, "") + " (signed).pdf";
    for (const [phone, name] of Array.from(recipients.entries())) {
      try {
        await sendDocument(phone, dl.signedUrl, signedName, t("sign_done_signer"));
        await sendText(phone, t("sign_thanks", { first: name.split(" ")[0] }));
      } catch {
        const template = process.env.WHATSAPP_TEMPLATE_SIGNED_COPY;
        if (template) await sendTemplate(phone, template, [document.filename], senderTokenForTemplate).catch(() => {});
      }
    }
    await db.from("audit_events").insert({
      request_id: requestId,
      event_type: "signed_pdf_delivered",
      meta: { recipients: recipients.size },
    });
  }

  return dl?.signedUrl ?? null;
}

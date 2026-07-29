import { createHash, randomBytes, randomInt } from "crypto";
import { supabaseAdmin, BUCKET } from "@/lib/supabase";
import { sendDocument, sendText, sendCtaLink } from "@/lib/telegram";
import { t } from "@/lib/i18n";
import { extractPdfText } from "@/lib/doctext";
import { summariseDocument } from "@/lib/summary";

const BOT = process.env.TELEGRAM_BOT_USERNAME ?? "InklineSignbot";

/** Deep link a signer taps to start signing in Telegram. */
function signerDeepLink(signToken: string) {
  return `https://t.me/${BOT}?start=sign_${signToken}`;
}

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

/**
 * Delivers a request that already exists (fields placed or skipped).
 *
 * TELEGRAM MODEL: the bot cannot message a stranger. So instead of pushing to
 * the signer, we hand the SENDER a deep link to forward. If a signer has already
 * started the bot (signer_chat_id is set), we message them directly as well.
 */
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

  // Message any signer we can already reach (they've started the bot before).
  for (const signer of toNotify) {
    await deliverToSigner(request, doc, signer).catch(() => {});
  }

  // Hand the sender the link(s) to forward. This is the moment the sender has
  // been waiting for after placing fields — it must not fire before placement.
  if (request.sender_chat_id) {
    for (const signer of toNotify) {
      if (signer.signer_chat_id) {
        await sendText(
          request.sender_chat_id,
          `✅ <b>${doc.filename}</b> is ready and I've sent it straight to ${signer.name}.`
        ).catch(() => {});
      } else {
        await sendText(
          request.sender_chat_id,
          `✅ Ready to send.\n\nForward this to <b>${signer.name}</b> — when they tap it I'll walk them through signing:\n\n${signerDeepLink(signer.sign_token)}\n\nYou'll both get the certified copy back here once it's signed.`
        ).catch(() => {});
      }
    }
  }

  return {
    requestId,
    delivered: true,
    signUrl: `${process.env.APP_BASE_URL}/sign/${ordered[0].sign_token}`,
    shareLink: signerDeepLink(ordered[0].sign_token),
  };
}

/** Convenience wrapper: create then immediately deliver (used by the single-signer API). */
export async function createAndDeliverRequest(input: CreateRequestInput) {
  const requestId = await createRequestPending(input);
  return deliverPlacedRequest(requestId);
}

/**
 * Messages a signer directly — only possible once they've started the bot
 * (signer_chat_id set by the /start sign_<token> deep link).
 */
async function deliverToSigner(
  request: { id: string; sender_name: string },
  doc: { filename: string; storage_path: string },
  signer: { id: string; name: string; sign_token: string; signer_chat_id?: string | null }
): Promise<boolean> {
  if (!signer.signer_chat_id) return false; // unreachable until they tap the link

  const db = supabaseAdmin();
  const signUrl = `${process.env.APP_BASE_URL}/sign/${signer.sign_token}`;

  try {
    await sendCtaLink(
      signer.signer_chat_id,
      `${request.sender_name} has asked you to sign <b>${doc.filename}</b>. It takes about 20 seconds.`,
      "Review & sign",
      signUrl
    );
    await db.from("audit_events").insert({
      request_id: request.id,
      signer_id: signer.id,
      event_type: "tg_sent",
      meta: { channel: "telegram" },
    });
    return true;
  } catch (e) {
    console.error("deliverToSigner:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Sends the OTP code to a signer in Telegram. */
export async function issueOtp(signerId: string, _phone: string): Promise<void> {
  const db = supabaseAdmin();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.from("signers").update({ otp_code: hashOtp(code) }).eq("id", signerId);
  const { data: signer } = await db
    .from("signers")
    .select("signer_chat_id")
    .eq("id", signerId)
    .maybeSingle();
  if (signer?.signer_chat_id) {
    await sendText(signer.signer_chat_id, t("sign_otp_message", { code })).catch(() => {});
  }
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
      await deliverToSigner(request, request.documents, next).catch(() => {});
      // If we can't reach them yet, give the sender their link to forward.
      if (!next.signer_chat_id && request.sender_chat_id) {
        await sendText(
          request.sender_chat_id,
          `Next up: <b>${next.name}</b>. Forward this to them:\n\n${signerDeepLink(next.sign_token)}`
        ).catch(() => {});
      }
    }
  }

  // Progress ping to the sender.
  if (request.sender_chat_id) {
    const justSigned = signers.find((s) => s.status === "signed");
    await sendText(
      request.sender_chat_id,
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
 * stores it, and delivers it to every signer we can reach plus the sender.
 */
export async function buildAndDeliverFinal(requestId: string, _unused?: string): Promise<string | null> {
  const { stampAndCertify } = await import("@/lib/pdf");
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
  await db.storage.from(BUCKET).upload(signedPath, Buffer.from(finalPdf), {
    contentType: "application/pdf",
    upsert: true,
  });
  await db.from("sign_requests").update({ signed_pdf_path: signedPath }).eq("id", requestId);

  const { data: dl } = await db.storage.from(BUCKET).createSignedUrl(signedPath, 60 * 60 * 24 * 7);

  // TELEGRAM DELIVERY: recipients are chat ids, not phone numbers.
  const recipients = new Map<string, string>();
  for (const s of allSigners ?? []) {
    if (s.signer_chat_id) recipients.set(s.signer_chat_id, s.name);
  }
  if (request.sender_chat_id) recipients.set(request.sender_chat_id, request.sender_name);

  if (dl?.signedUrl) {
    const signedName = document.filename.replace(/\.pdf$/i, "") + " (signed).pdf";
    for (const [chatId, name] of Array.from(recipients.entries())) {
      try {
        await sendDocument(chatId, dl.signedUrl, signedName, t("sign_done_signer"));
        await sendText(chatId, t("sign_thanks", { first: name.split(" ")[0] }));
      } catch (e) {
        console.error("final delivery failed for", chatId, e instanceof Error ? e.message : e);
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

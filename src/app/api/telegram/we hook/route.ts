import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendText, sendDocument, sendCtaLink, fetchMedia } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---- Supabase (service role) ----
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
const BUCKET = "inkline";
const BOT = process.env.TELEGRAM_BOT_USERNAME ?? "InklineSignbot";
const BASE = process.env.APP_BASE_URL ?? "https://inklinesign.com";

// ============================================================
// Webhook entry
// ============================================================
export async function POST(req: NextRequest) {
  // Optional shared-secret check (set TELEGRAM_WEBHOOK_SECRET + pass as ?secret=)
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ ok: true }); // ignore silently
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  try {
    const msg = update.message;
    if (msg) await handleMessage(msg);
  } catch (e) {
    console.error("TG webhook error:", e instanceof Error ? e.message : e);
  }
  // Always 200 so Telegram doesn't retry-storm.
  return NextResponse.json({ ok: true });
}

// ============================================================
// Message router
// ============================================================
async function handleMessage(msg: Record<string, any>) {
  const chatId = String(msg.chat?.id ?? "");
  if (!chatId) return;
  const fromName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "there";
  const text: string = (msg.text ?? "").trim();
  const upper = text.toUpperCase();

  // ---- Deep-link entry: /start sign_<token> (a signer tapping their link) ----
  if (text.startsWith("/start")) {
    const param = text.split(" ")[1] ?? "";
    if (param.startsWith("sign_")) {
      return startSigner(chatId, fromName, param.slice(5));
    }
    return sendText(chatId, welcome(fromName));
  }

  // ---- Global commands ----
  if (upper === "HELP") return sendText(chatId, helpText());
  if (upper === "CANCEL" || upper === "RESTART" || upper === "RESET") {
    await clearSession(chatId);
    return sendText(chatId, "Okay, cleared. Send a PDF whenever you're ready.");
  }
  if (upper === "ADMIN") return handleAdmin(chatId);

  // ---- Inbound document (the sender's PDF) ----
  if (msg.document) {
    return handleDocument(chatId, fromName, msg.document);
  }

  // ---- Session-driven text steps ----
  const session = await getSession(chatId);
  if (session?.state === "awaiting_signer_name") {
    return onSignerName(chatId, fromName, text, session);
  }
  if (session?.state === "awaiting_placement") {
    return onPlacementChoice(chatId, fromName, upper, session);
  }

  // ---- Fallback ----
  return sendText(chatId, welcome(fromName));
}

// ============================================================
// Sender flow: PDF -> signer name -> place/skip -> share link
// ============================================================
async function handleDocument(chatId: string, fromName: string, document: Record<string, any>) {
  const mime = document.mime_type ?? "";
  if (mime !== "application/pdf" && !(document.file_name ?? "").toLowerCase().endsWith(".pdf")) {
    return sendText(chatId, "Please send a PDF file to sign.");
  }
  if ((document.file_size ?? 0) > 19 * 1024 * 1024) {
    return sendText(chatId, "That file is a bit large (Telegram caps bot downloads at 20MB). Try a smaller PDF.");
  }

  // Credit gate (reuse your accounts table).
  const gate = await canSend(chatId);
  if (!gate.ok) {
    return sendPaywall(chatId);
  }

  await sendText(chatId, "Got it 📄 downloading…");
  const { bytes } = await fetchMedia(document.file_id);
  const filename = document.file_name ?? "document.pdf";

  const supa = db();
  const path = `docs/${chatId}-${Date.now()}-${filename}`;
  const up = await supa.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) {
    console.error("upload failed:", up.error.message);
    return sendText(chatId, "Something went wrong saving that file — please try again.");
  }

  const { data: doc, error: docErr } = await supa
    .from("documents")
    .insert({ storage_path: path, filename, sha256: "" })
    .select()
    .single();
  if (docErr) {
    console.error("doc insert:", docErr.message);
    return sendText(chatId, "Couldn't register the document — please try again.");
  }

  await setSession(chatId, "awaiting_signer_name", { document_id: doc.id, filename });
  await sendText(
    chatId,
    `<b>${filename}</b> received.\n\nWho's signing it? Send me their name (just so it appears on the certificate).`
  );
}

async function onSignerName(chatId: string, fromName: string, name: string, session: any) {
  if (!name || name.length < 2) {
    return sendText(chatId, "Please send the signer's name.");
  }
  await setSession(chatId, "awaiting_placement", { ...session.data, signer_name: name });
  await sendText(
    chatId,
    `Signing for <b>${name}</b>.\n\nWhere should the signature go?\n\n` +
      `📍 <b>PLACE</b> — position the signature exactly on the page\n` +
      `⬇️ <b>SKIP</b> — put it at the bottom of the last page\n\n` +
      `Reply PLACE or SKIP.`
  );
}

async function onPlacementChoice(chatId: string, fromName: string, upper: string, session: any) {
  const data = session.data;
  const supa = db();

  // Create the request + signer row, generate a sign token.
  const signToken = randomToken();
  const { data: request, error: reqErr } = await supa
    .from("sign_requests")
    .insert({
      document_id: data.document_id,
      sender_name: fromName,
      sender_chat_id: chatId, // NB: add this column (see notes)
      signing_flow: "single",
      status: "pending",
      placement: upper === "PLACE" ? "pending" : "none",
    })
    .select()
    .single();
  if (reqErr) {
    console.error("request insert:", reqErr.message);
    return sendText(chatId, "Something went wrong — reply RESTART to try again.");
  }

  await supa.from("signers").insert({
    request_id: request.id,
    name: data.signer_name,
    sign_token: signToken,
    sign_order: 1,
    status: "pending",
  });

  // Count the document against the sender's allowance.
  await recordDocumentSent(chatId);

  if (upper === "PLACE") {
    const placeToken = randomToken();
    await supa.from("placement_tokens").insert({ token: placeToken, request_id: request.id });
    await clearSession(chatId);
    await sendCtaLink(
      chatId,
      `Place the fields, then I'll give you a link to send <b>${data.signer_name}</b>.`,
      "Open placement editor",
      `${BASE}/place/${placeToken}`
    );
    return;
  }

  // SKIP — hand the sender the shareable signing link right away.
  await clearSession(chatId);
  await shareSignerLink(chatId, data.signer_name, signToken);
}

/** Gives the SENDER the deep link to forward to their signer. */
async function shareSignerLink(chatId: string, signerName: string, signToken: string) {
  const deep = `https://t.me/${BOT}?start=sign_${signToken}`;
  await sendText(
    chatId,
    `✅ Ready to send.\n\nForward this to <b>${signerName}</b> — when they tap it, I'll walk them through signing:\n\n${deep}\n\n` +
      `You'll both get the certified copy back here once it's signed.`
  );
}

// ============================================================
// Signer flow: taps t.me link -> gets their signing page
// ============================================================
async function startSigner(chatId: string, fromName: string, signToken: string) {
  const supa = db();
  const { data: signer } = await supa
    .from("signers")
    .select("*, sign_requests(*, documents(*))")
    .eq("sign_token", signToken)
    .maybeSingle();

  if (!signer) {
    return sendText(chatId, "That signing link isn't valid or has expired. Ask the sender to resend it.");
  }
  if (signer.status === "signed") {
    return sendText(chatId, "You've already signed this document ✓ The certified copy is on its way to everyone.");
  }

  // Remember this signer's chat_id so we can deliver their signed copy later.
  await supa.from("signers").update({ signer_chat_id: chatId }).eq("id", signer.id);

  const req = signer.sign_requests;
  const doc = req?.documents;
  const signUrl = `${BASE}/sign/${signToken}`;

  await sendCtaLink(
    chatId,
    `Hi ${fromName} 👋\n\n${req?.sender_name ?? "Someone"} has asked you to sign <b>${doc?.filename ?? "a document"}</b>. ` +
      `It takes about 20 seconds — no app, no account.`,
    "Review & sign",
    signUrl
  );
}

// ============================================================
// Billing gate (reuses your accounts table, keyed by chat_id)
// ============================================================
async function canSend(chatId: string): Promise<{ ok: boolean; used: number; limit: number }> {
  const supa = db();
  const { data } = await supa.from("accounts").select("*").eq("tg_chat_id", chatId).maybeSingle();
  if (!data) {
    await supa.from("accounts").insert({ tg_chat_id: chatId, documents_used: 0, free_limit: 3, plan: "free" });
    return { ok: true, used: 0, limit: 3 };
  }
  if (data.plan === "active") return { ok: true, used: data.documents_used, limit: Infinity };
  return { ok: data.documents_used < data.free_limit, used: data.documents_used, limit: data.free_limit };
}

async function recordDocumentSent(chatId: string) {
  const supa = db();
  const { data } = await supa.from("accounts").select("documents_used").eq("tg_chat_id", chatId).maybeSingle();
  await supa
    .from("accounts")
    .update({ documents_used: (data?.documents_used ?? 0) + 1 })
    .eq("tg_chat_id", chatId);
}

async function sendPaywall(chatId: string) {
  // Stripe checkout link generation stays the same as your web billing — point
  // them to a checkout page keyed by chat_id, or reuse createStripeCheckout.
  await sendText(
    chatId,
    `You've used your 3 free documents 🎉\n\nGo unlimited for $9/month:\n${BASE}/billing?u=${chatId}\n\n` +
      `Once you're subscribed, send your document again.`
  );
}

// ============================================================
// Admin
// ============================================================
async function handleAdmin(chatId: string) {
  const admin = process.env.ADMIN_TG_CHAT_ID;
  if (!admin || chatId !== admin) return sendText(chatId, welcome("there"));

  const supa = db();
  const [senders, subs, docsAll, docsSigned] = await Promise.all([
    supa.from("accounts").select("*", { count: "exact", head: true }),
    supa.from("accounts").select("*", { count: "exact", head: true }).eq("plan", "active"),
    supa.from("sign_requests").select("*", { count: "exact", head: true }),
    supa.from("sign_requests").select("*", { count: "exact", head: true }).eq("status", "signed"),
  ]);
  const total = docsAll.count ?? 0;
  const signed = docsSigned.count ?? 0;
  const rate = total ? Math.round((signed / total) * 100) : 0;
  await sendText(
    chatId,
    `📊 <b>Inkline stats</b>\n\n👤 Senders: ${senders.count ?? 0} · 💳 Subscribers: ${subs.count ?? 0}\n\n` +
      `📄 Documents: ${total} total\n   ✓ ${signed} completed (${rate}%)`
  );
}

// ============================================================
// Sessions (simple table keyed by chat_id)
// ============================================================
async function getSession(chatId: string): Promise<{ state: string; data: any } | null> {
  const supa = db();
  const { data } = await supa.from("tg_sessions").select("state, data").eq("chat_id", chatId).maybeSingle();
  return data ?? null;
}
async function setSession(chatId: string, state: string, data: any) {
  const supa = db();
  await supa.from("tg_sessions").upsert({ chat_id: chatId, state, data, updated_at: new Date().toISOString() });
}
async function clearSession(chatId: string) {
  const supa = db();
  await supa.from("tg_sessions").delete().eq("chat_id", chatId);
}

// ============================================================
// Helpers
// ============================================================
function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62])
    .join("");
}

function welcome(name: string): string {
  return (
    `Hi ${name} 👋 I'm <b>Inkline</b> — I get documents signed right here in Telegram.\n\n` +
    `📎 Send me a PDF to get started.\n\n` +
    `Type HELP anytime.`
  );
}
function helpText(): string {
  return (
    `<b>Inkline — help</b>\n\n` +
    `📎 Send a PDF, tell me who's signing, and I'll give you a link to forward to them.\n` +
    `They tap it, sign in ~20 seconds, and you both get the certified copy back here.\n\n` +
    `Commands: HELP · CANCEL`
  );
}

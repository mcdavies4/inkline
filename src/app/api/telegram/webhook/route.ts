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
  // Only operate in private chats — a group would otherwise be treated as a user.
  if (msg.chat?.type && msg.chat.type !== "private") return;
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
  if (upper === "BILLING" || upper === "SUBSCRIBE") return handleBilling(chatId);
  if (upper === "STATUS") return handleStatus(chatId);

  // ---- Inbound document (the sender's PDF) ----
  if (msg.document) {
    return handleDocument(chatId, fromName, msg.document);
  }
  if (msg.photo) {
    return sendText(
      chatId,
      "That came through as a photo, which I can't sign. Send the document as a <b>file</b> instead — in Telegram, tap 📎 → File → choose the PDF."
    );
  }

  // ---- Session-driven text steps ----
  const session = await getSession(chatId);
  if (session?.state === "awaiting_signer_name") {
    return onSignerName(chatId, fromName, text, session);
  }
  if (session?.state === "awaiting_plan") {
    return handlePlanChoice(chatId, upper);
  }
  if (session?.state === "awaiting_more") {
    return onMoreSigners(chatId, text, upper, session);
  }
  if (session?.state === "awaiting_flow") {
    return onFlowChoice(chatId, upper, session);
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

  // Compute a real sha256 (some schemas require a non-empty hash).
  const { createHash } = await import("crypto");
  const sha = createHash("sha256").update(bytes).digest("hex");

  const { data: doc, error: docErr } = await supa
    .from("documents")
    .insert({ storage_path: path, filename, sha256: sha, size_bytes: bytes.length })
    .select()
    .single();
  if (docErr) {
    // Log the FULL error so the exact cause (missing column, constraint, etc.)
    // shows in Vercel logs instead of a vague message.
    console.error("doc insert failed:", JSON.stringify(docErr));
    return sendText(chatId, `Couldn't register the document — ${docErr.message ?? "unknown error"}. Please try again.`);
  }

  // Generate the plain-English summary now (best effort) so it can be attached
  // to the request and shown on the signer's page.
  let aiSummary: string | null = null;
  try {
    const { extractPdfText } = await import("@/lib/doctext");
    const { summariseDocument } = await import("@/lib/summary");
    aiSummary = await summariseDocument(await extractPdfText(new Uint8Array(bytes)));
  } catch (e) {
    console.error("summary skipped:", e instanceof Error ? e.message : e);
  }

  await setSession(chatId, "awaiting_signer_name", { document_id: doc.id, filename, ai_summary: aiSummary });
  await sendText(
    chatId,
    `<b>${filename}</b> received.\n\nWho's signing it? Send me their name (just so it appears on the certificate).`
  );
}

async function onSignerName(chatId: string, fromName: string, name: string, session: any) {
  if (!name || name.length < 2 || name.length > 80) {
    return sendText(chatId, "Please send the signer's name.");
  }
  const signers = [...(session.data.signers ?? []), { name }];
  await setSession(chatId, "awaiting_more", { ...session.data, signers });
  await sendText(
    chatId,
    `Added <b>${name}</b>.\n\nAnyone else signing? Send the next name, or reply <b>DONE</b>.`
  );
}

/** DONE finishes the signer list; anything else is treated as another name. */
async function onMoreSigners(chatId: string, text: string, upper: string, session: any) {
  if (upper !== "DONE") {
    return onSignerName(chatId, "", text, session);
  }
  const signers = session.data.signers ?? [];
  if (signers.length === 0) {
    return sendText(chatId, "Send me at least one signer's name first.");
  }
  if (signers.length === 1) {
    await setSession(chatId, "awaiting_placement", { ...session.data, flow: "single" });
    return askPlacement(chatId, signers);
  }
  await setSession(chatId, "awaiting_flow", session.data);
  await sendText(
    chatId,
    `${signers.length} signers. How should they sign?\n\n` +
      `🔢 <b>ORDER</b> — one after another, in the order you added them\n` +
      `👥 <b>TOGETHER</b> — everyone gets it at the same time\n\n` +
      `Reply ORDER or TOGETHER.`
  );
}

async function onFlowChoice(chatId: string, upper: string, session: any) {
  if (upper !== "ORDER" && upper !== "TOGETHER") {
    return sendText(chatId, "Reply ORDER or TOGETHER.");
  }
  const flow = upper === "ORDER" ? "sequential" : "parallel";
  await setSession(chatId, "awaiting_placement", { ...session.data, flow });
  return askPlacement(chatId, session.data.signers ?? []);
}

function askPlacement(chatId: string, signers: { name: string }[]) {
  const who = signers.map((s) => s.name).join(", ");
  return sendText(
    chatId,
    `Signing for <b>${who}</b>.\n\nWhere should the signature go?\n\n` +
      `📍 <b>PLACE</b> — position the fields exactly on the page\n` +
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
      sender_chat_id: chatId,
      mode: "signature",       // allowed: 'signature' | 'quick_approval'
      signing_flow: data.flow ?? "single",  // allowed: 'single' | 'sequential' | 'parallel'
      ai_summary: data.ai_summary ?? null,
      status: "pending",       // allowed: 'pending' | 'in_progress' | ...
      placement: upper === "PLACE" ? "pending" : "none",  // allowed: 'none' | 'pending' | 'done'
    })
    .select()
    .single();
  if (reqErr) {
    console.error("request insert:", JSON.stringify(reqErr));
    return sendText(chatId, `Couldn't create the request — ${reqErr.message ?? "error"}. Reply RESTART.`);
  }

  const signerList: { name: string }[] = data.signers ?? [];
  const rows = signerList.map((sgr, i) => ({
    request_id: request.id,
    name: sgr.name,
    phone_e164: `tg:${chatId}:${randomToken().slice(0, 10)}`,  // NOT NULL; unique per signer
    sign_token: i === 0 ? signToken : randomToken(),
    sign_order: i + 1,
    status: "pending",
  }));
  const { error: sErr } = await supa.from("signers").insert(rows);
  if (sErr) {
    console.error("signers insert:", JSON.stringify(sErr));
    return sendText(chatId, `Couldn't add the signers — ${sErr.message ?? "error"}. Reply RESTART.`);
  }

  // Count the document against the sender's allowance.
  await recordDocumentSent(chatId);

  if (upper === "PLACE") {
    const placeToken = randomToken();
    await supa.from("placement_tokens").insert({ token: placeToken, request_id: request.id });
    await supa.from("sign_requests").update({ sender_chat_id: chatId }).eq("id", request.id);
    await clearSession(chatId);
    await sendCtaLink(
      chatId,
      `Position the fields, then tap Done in the editor.`,
      "Open placement editor",
      `${BASE}/place/${placeToken}`
    );
    // The share link is sent once placement completes (see deliverPlacedRequest),
    // so the sender isn't handed a link before the document is ready.
    return;
  }

  // SKIP — hand the sender the shareable link(s) right away.
  await clearSession(chatId);
  const toShare = data.flow === "sequential" ? rows.slice(0, 1) : rows;
  await shareSignerLinks(chatId, toShare, data.flow === "sequential" && rows.length > 1);
}

/** Gives the SENDER the deep link(s) to forward to each signer. */
async function shareSignerLinks(
  chatId: string,
  signers: { name: string; sign_token: string }[],
  sequential: boolean
) {
  const link = (tok: string) => `https://t.me/${BOT}?start=sign_${tok}`;

  if (signers.length === 1) {
    await sendText(
      chatId,
      `✅ Ready to send.\n\nForward this to <b>${signers[0].name}</b> — when they tap it I'll walk them through signing:\n\n${link(signers[0].sign_token)}\n\n` +
        (sequential
          ? `They're first in the order. I'll send you the next person's link as soon as they've signed.`
          : `You'll both get the certified copy back here once it's signed.`)
    );
    return;
  }

  const lines = signers
    .map((sg, i) => `${i + 1}. <b>${sg.name}</b>\n${link(sg.sign_token)}`)
    .join("\n\n");
  await sendText(
    chatId,
    `✅ Ready to send.\n\nForward each person their own link:\n\n${lines}\n\nEveryone gets the certified copy back here once all have signed.`
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
  // Founder/owner always has unlimited access — no paywall, no DB dependency.
  if (process.env.ADMIN_TG_CHAT_ID && chatId === process.env.ADMIN_TG_CHAT_ID) {
    return { ok: true, used: 0, limit: Infinity };
  }
  const supa = db();
  const { data } = await supa.from("accounts").select("*").eq("phone_e164", `tg:${chatId}`).maybeSingle();
  if (!data) {
    // accounts.phone_e164 is the NOT NULL primary key. Telegram has no phone, so
    // store a tg: marker as the key and keep the chat_id in tg_chat_id too.
    await supa.from("accounts").insert({
      phone_e164: `tg:${chatId}`,
      tg_chat_id: chatId,
      documents_used: 0,
      free_limit: 3,
      plan: "free",        // allowed: 'free' | 'active' | 'past_due' | 'cancelled'
      provider: "stripe",  // allowed: 'stripe' | 'flutterwave' (required by check)
    });
    return { ok: true, used: 0, limit: 3 };
  }
  if (data.plan === "active") return { ok: true, used: data.documents_used, limit: Infinity };
  return { ok: data.documents_used < data.free_limit, used: data.documents_used, limit: data.free_limit };
}

async function recordDocumentSent(chatId: string) {
  const supa = db();
  const { data } = await supa.from("accounts").select("documents_used").eq("phone_e164", `tg:${chatId}`).maybeSingle();
  await supa
    .from("accounts")
    .update({ documents_used: (data?.documents_used ?? 0) + 1 })
    .eq("phone_e164", `tg:${chatId}`);
}

async function sendPaywall(chatId: string) {
  await setSession(chatId, "awaiting_plan", {});
  await sendText(
    chatId,
    `You've used your 3 free documents 🎉\n\nGo unlimited with Inkline:\n\n` +
      `💳 <b>MONTHLY</b> — $9/month\n💳 <b>ANNUAL</b> — $90/year (2 months free)\n\n` +
      `Reply MONTHLY or ANNUAL to subscribe.`
  );
}

/** MONTHLY / ANNUAL reply -> real Stripe Checkout link. */
async function handlePlanChoice(chatId: string, upper: string) {
  if (upper !== "MONTHLY" && upper !== "ANNUAL") {
    return sendText(chatId, "Reply MONTHLY or ANNUAL to choose a plan, or CANCEL.");
  }
  const plan = upper === "ANNUAL" ? "annual" : "monthly";
  const { createStripeCheckout } = await import("@/lib/billing");
  // Accounts are keyed by phone_e164; for Telegram that key is `tg:<chatId>`.
  const url = await createStripeCheckout(`tg:${chatId}`, plan);
  await clearSession(chatId);
  if (!url) {
    return sendText(chatId, "Couldn't open checkout just now — please try again shortly.");
  }
  await sendCtaLink(
    chatId,
    `Complete your ${plan} subscription, then come back and send your document.`,
    "Subscribe securely",
    url
  );
}

/** BILLING command — portal for subscribers, plans for everyone else. */
async function handleBilling(chatId: string) {
  const { getAccount, createStripePortal } = await import("@/lib/billing");
  const account = await getAccount(`tg:${chatId}`);
  if ((account.plan === "active" || account.plan === "past_due") && account.stripe_customer_id) {
    const portal = await createStripePortal(`tg:${chatId}`);
    if (portal) {
      return sendCtaLink(
        chatId,
        "Manage your subscription — update your card, view invoices, or cancel.",
        "Open billing portal",
        portal
      );
    }
    return sendText(chatId, "Couldn't open your billing page just now — please try again shortly.");
  }
  return sendPaywall(chatId);
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
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getSession(chatId: string): Promise<{ state: string; data: any } | null> {
  const supa = db();
  const { data } = await supa
    .from("tg_sessions")
    .select("state, data, updated_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (!data) return null;
  // Expire stale sessions so an old half-finished flow doesn't swallow a new
  // message (e.g. "hi" being read as a signer's name a day later).
  if (data.updated_at && Date.now() - new Date(data.updated_at).getTime() > SESSION_TTL_MS) {
    await clearSession(chatId);
    return null;
  }
  return data;
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
    `Commands: HELP · STATUS · BILLING · CANCEL`
  );
}

/** STATUS — the sender's documents still awaiting signatures. */
async function handleStatus(chatId: string) {
  const supa = db();
  const { data: reqs } = await supa
    .from("sign_requests")
    .select("id, status, created_at, documents(filename), signers(name, status, sign_token)")
    .eq("sender_chat_id", chatId)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = (reqs ?? []) as unknown as {
    id: string;
    documents: { filename: string } | null;
    signers: { name: string; status: string; sign_token: string }[];
  }[];

  if (rows.length === 0) {
    return sendText(chatId, "Nothing waiting on signatures right now 👌\n\nSend me a PDF to start one.");
  }

  const lines = rows.map((r) => {
    const signed = r.signers.filter((s) => s.status === "signed").length;
    const pending = r.signers.find((s) => s.status !== "signed");
    const link = pending ? `\n   ↳ resend: https://t.me/${BOT}?start=sign_${pending.sign_token}` : "";
    return `📄 <b>${r.documents?.filename ?? "document"}</b>\n   ${signed}/${r.signers.length} signed · ref ${r.id.slice(0, 8)}${link}`;
  });

  await sendText(chatId, `<b>Awaiting signatures</b>\n\n${lines.join("\n\n")}`);
}

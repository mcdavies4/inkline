// Telegram Bot API helpers — drop-in replacement for the old WhatsApp Cloud API layer.
// No templates, no 24-hour window, no business verification. A user must have
// /start-ed the bot (or tapped a t.me deep link) before the bot can message them.

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const FILE_API = () => `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function call(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    console.error(`Telegram ${method} failed:`, res.status, JSON.stringify(data).slice(0, 300));
    throw new Error(`Telegram API ${method} ${res.status}`);
  }
  return data.result;
}

/**
 * `to` is the Telegram chat_id (a number, stored as string). This replaces the
 * WhatsApp phone number as the addressing key everywhere in the app.
 */
export function sendText(to: string, body: string) {
  return call("sendMessage", {
    chat_id: to,
    text: body,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

/** Sends a PDF into the chat. Telegram fetches the URL itself — a signed URL works fine. */
export function sendDocument(to: string, link: string, filename: string, caption?: string) {
  return call("sendDocument", {
    chat_id: to,
    document: link,
    caption: caption ?? undefined,
    // Telegram uses the URL's filename; to force a name we'd upload bytes instead.
  });
}

/**
 * The "Review & Sign" moment — an inline keyboard button under a message.
 * Far more reliable than WhatsApp's cta_url interactive message.
 */
export function sendCtaLink(to: string, bodyText: string, buttonText: string, url: string) {
  return call("sendMessage", {
    chat_id: to,
    text: bodyText,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: buttonText, url }]],
    },
  });
}

/**
 * Downloads an inbound document (the sender's PDF) by Telegram file_id.
 * Two steps: getFile → download from the file path. Note Telegram's Bot API
 * download limit is 20MB.
 */
export async function fetchMedia(fileId: string): Promise<{ bytes: Buffer; mime: string }> {
  const file = await call("getFile", { file_id: fileId });
  if (!file?.file_path) throw new Error("Telegram getFile: no file_path");
  const bin = await fetch(`${FILE_API()}/${file.file_path}`);
  if (!bin.ok) throw new Error(`Telegram file download failed: ${bin.status}`);
  // Telegram doesn't return a mime type here; infer from extension.
  const mime = file.file_path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "";
  return { bytes: Buffer.from(await bin.arrayBuffer()), mime };
}

/**
 * COMPAT SHIM: the old code called sendTemplate for cold signers. Telegram has no
 * templates and no cold-messaging concept — you simply can't message a user who
 * hasn't started the bot. So this just sends plain text IF the chat is reachable,
 * and otherwise throws (the caller already handles that by surfacing a shareable
 * link to the sender). Keeping the signature avoids touching every call site.
 */
export function sendTemplate(
  to: string,
  _templateName: string,
  bodyParams: string[],
  _urlButtonParam?: string
) {
  const [sender, filename] = bodyParams;
  const text = `Hi, ${sender ?? "someone"} has sent you a document to sign${filename ? `: <b>${filename}</b>` : ""}.`;
  return sendText(to, text);
}

/** Sets the webhook URL with Telegram (run once at setup, or via a route). */
export async function setWebhook(url: string) {
  return call("setWebhook", {
    url,
    allowed_updates: ["message", "callback_query"],
  });
}

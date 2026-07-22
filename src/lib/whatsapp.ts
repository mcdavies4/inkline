// Meta Cloud API helpers — same pattern as your Nolgic/Relink bots.
const GRAPH_VERSION = "v20.0";

async function send(payload: Record<string, unknown>) {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    console.error("WhatsApp send failed:", res.status, body);
    throw new Error(`WhatsApp API ${res.status}`);
  }
  return res.json();
}

export function sendText(to: string, body: string) {
  return send({ to, type: "text", text: { body, preview_url: false } });
}

/** Sends the PDF itself into the chat (link must be publicly fetchable — use a signed URL). */
export function sendDocument(to: string, link: string, filename: string, caption?: string) {
  return send({ to, type: "document", document: { link, filename, caption } });
}

/** Sends a pre-approved template — required for cold (business-initiated) messages in production. */
export function sendTemplate(
  to: string,
  templateName: string,
  bodyParams: string[],
  urlButtonParam?: string
) {
  const components: Record<string, unknown>[] = [
    {
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text })),
    },
  ];
  if (urlButtonParam !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: urlButtonParam }],
    });
  }
  return send({
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
      components,
    },
  });
}

/** Downloads inbound media (the sender's PDF) by media ID. */
export async function fetchMedia(mediaId: string): Promise<{ bytes: Buffer; mime: string }> {
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: auth,
  }).then((r) => r.json());
  if (!meta?.url) throw new Error("Media URL lookup failed");
  const bin = await fetch(meta.url, { headers: auth });
  if (!bin.ok) throw new Error(`Media download failed: ${bin.status}`);
  return { bytes: Buffer.from(await bin.arrayBuffer()), mime: meta.mime_type ?? "" };
}

/** Interactive message with a tappable URL button — this is the "Review & Sign" moment. */
export function sendCtaLink(to: string, bodyText: string, buttonText: string, url: string) {
  return send({
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: bodyText },
      action: { name: "cta_url", parameters: { display_text: buttonText, url } },
    },
  });
}

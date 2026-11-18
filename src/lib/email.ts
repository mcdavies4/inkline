// Email delivery via Resend — used by the web version to reach signers and
// senders who aren't on Telegram.
//
// Graceful by design: if RESEND_API_KEY isn't set, every send is a no-op that
// returns false. The web flow never depends on email succeeding — the sender
// always gets a shareable signing link to pass on themselves — so a missing or
// misconfigured key degrades to "copy the link" rather than breaking.

const FROM = process.env.RESEND_FROM ?? "Inkline <noreply@inklinesign.com>";
const BRAND = "#1a2238";
const SEAL = "#1f7a5c";

function appBase(): string {
  return process.env.APP_BASE_URL ?? "https://www.inklinesign.com";
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("EMAIL: RESEND_API_KEY not set — skipping email to", to);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("EMAIL: Resend rejected", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("EMAIL: send failed —", e instanceof Error ? e.message : e);
    return false;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c)
  );
}

function shell(inner: string): string {
  return `<div style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND}">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6eae8">
    <div style="padding:20px 28px;border-bottom:1px solid #eef1f0;font-weight:800;font-size:18px;letter-spacing:-0.02em;color:${BRAND}">Inkline</div>
    <div style="padding:28px">${inner}</div>
    <div style="padding:16px 28px;border-top:1px solid #eef1f0;font-size:12px;color:#8a978f">
      Legally recognised e-signatures · <a href="${appBase()}/terms" style="color:#8a978f">Terms</a> · <a href="${appBase()}/privacy" style="color:#8a978f">Privacy</a>
    </div>
  </div>
</div>`;
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:${SEAL};color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;font-size:15px">${escape(label)}</a>`;
}

/** Emails a signer their signing link (web flow, when the signer has an email). */
export async function sendSignRequestEmail(opts: {
  to: string;
  signerName: string;
  senderName: string;
  filename: string;
  signUrl: string;
  message?: string | null;
  reminder?: boolean;
}): Promise<boolean> {
  const { to, signerName, senderName, filename, signUrl, message, reminder } = opts;
  const eyebrow = reminder ? `${escape(senderName)} is still waiting on your signature` : `${escape(senderName)} asks you to sign`;
  const line = reminder
    ? `Hi ${escape(signerName.split(" ")[0])}, just a quick reminder — this is still waiting for your signature. It takes about 20 seconds, with no app or account.`
    : `Hi ${escape(signerName.split(" ")[0])}, it takes about 20 seconds — no app and no account needed.`;
  const subject = reminder ? `Reminder: please sign ${filename}` : `${senderName} asks you to sign ${filename}`;
  const inner = `
    <p style="margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;color:${SEAL};font-weight:700">${eyebrow}</p>
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escape(filename)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#45514b">${line}</p>
    ${message ? `<p style="margin:0 0 20px;padding:12px 14px;background:#f4f6f5;border-radius:10px;font-size:14px;color:#45514b">“${escape(message)}”</p>` : ""}
    <p style="margin:0 0 8px">${button(reminder ? "Sign now" : "Review & sign", signUrl)}</p>
    <p style="margin:18px 0 0;font-size:12px;color:#8a978f;word-break:break-all">Or paste this link into your browser:<br>${escape(signUrl)}</p>`;
  return send(to, subject, shell(inner));
}

/** Emails a party (signer or sender) the finished certified copy. */
export async function sendSignedCopyEmail(opts: {
  to: string;
  name: string;
  filename: string;
  downloadUrl: string;
  isSender?: boolean;
}): Promise<boolean> {
  const { to, name, filename, downloadUrl, isSender } = opts;
  const inner = `
    <div style="font-size:40px;line-height:1;color:${SEAL};margin:0 0 10px">✓</div>
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">Signed and sealed</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#45514b">Hi ${escape(name.split(" ")[0])}, your signed copy of <strong>${escape(filename)}</strong> is ready${isSender ? " — everyone has signed" : ""}. It's the original document with the signatures added, nothing else.</p>
    <p style="margin:0 0 8px">${button("Download signed copy", downloadUrl)}</p>
    <p style="margin:18px 0 0;font-size:12px;color:#8a978f">This download link is valid for 7 days.</p>`;
  return send(to, `Signed: ${filename}`, shell(inner));
}

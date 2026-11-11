// Paystack payments — Naira subscriptions for Inkline.
// A Telegram user has no email, so we encode their chat_id into a synthetic
// email (tg-<chatId>@users.inklinesign.com). That lets ANY Paystack webhook
// event — including renewals that carry none of our metadata — be mapped back
// to the right account just from the customer's email.

const PRICE_NAIRA = 5000;
export const PAYSTACK_PRICE_LABEL = "₦5,000/month";

const EMAIL_DOMAIN = "users.inklinesign.com";

export function emailForChat(chatId: string): string {
  return `tg-${chatId}@${EMAIL_DOMAIN}`;
}

/** Recovers the Telegram chat_id from a synthetic customer email, or null. */
export function chatIdFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  if (!local.startsWith("tg-")) return null;
  return local.slice(3) || null;
}

async function paystack(path: string, method: "GET" | "POST", body?: unknown) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    console.error("PAYSTACK: PAYSTACK_SECRET_KEY missing");
    return null;
  }
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.status) {
    console.error("PAYSTACK:", path, res.status, JSON.stringify(json).slice(0, 300));
    return null;
  }
  return json.data;
}

/**
 * Starts a ₦5,000/month subscription and returns the checkout URL.
 * Requires PAYSTACK_SECRET_KEY and PAYSTACK_PLAN_MONTHLY (a Plan code created in
 * the Paystack dashboard for ₦5,000/month, e.g. PLN_xxxxxxxx).
 */
export async function initPaystackSubscription(chatId: string): Promise<string | null> {
  const plan = process.env.PAYSTACK_PLAN_MONTHLY;
  const base = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";
  if (!plan) {
    console.error("PAYSTACK: PAYSTACK_PLAN_MONTHLY missing");
    return null;
  }
  const data = await paystack("/transaction/initialize", "POST", {
    email: emailForChat(chatId),
    plan, // the plan sets the amount (₦5,000) and makes it recurring
    amount: PRICE_NAIRA * 100, // kobo — ignored when plan is set, sent for safety
    currency: "NGN",
    callback_url: `${base}/billing/success`,
    metadata: { chat_id: chatId },
  });
  return data?.authorization_url ?? null;
}

/** Disables (cancels) a subscription. Needs the subscription code + email token. */
export async function disablePaystackSubscription(code: string, token: string): Promise<boolean> {
  const data = await paystack("/subscription/disable", "POST", { code, token });
  return data !== null;
}

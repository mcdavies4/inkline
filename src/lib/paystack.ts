// Paystack payments — Naira subscriptions for Inkline.
// A Telegram user has no email, so we encode their chat_id into a synthetic
// email (tg-<chatId>@users.inklinesign.com). That lets ANY Paystack webhook
// event — including renewals that carry none of our metadata — be mapped back
// to the right account just from the customer's email.

// Two currencies, each its own Paystack plan (plans are single-currency).
//   NGN → PAYSTACK_PLAN_NGN (falls back to legacy PAYSTACK_PLAN_MONTHLY)
//   USD → PAYSTACK_PLAN_USD (optional — USD option only appears when set)
// Labels are env-overridable so price/currency changes never touch code.
export type Currency = "NGN" | "USD";

export function planCodeFor(currency: Currency): string | undefined {
  if (currency === "USD") return process.env.PAYSTACK_PLAN_USD || undefined;
  return process.env.PAYSTACK_PLAN_NGN || process.env.PAYSTACK_PLAN_MONTHLY || undefined;
}

export function priceLabelFor(currency: Currency): string {
  if (currency === "USD") return process.env.PAYSTACK_PRICE_LABEL_USD ?? "$10/month";
  return process.env.PAYSTACK_PRICE_LABEL_NGN ?? process.env.PAYSTACK_PRICE_LABEL ?? "₦10,000/month";
}

/** Currencies that are actually configured (have a plan code). NGN always; USD if set. */
export function availableCurrencies(): Currency[] {
  const out: Currency[] = [];
  if (planCodeFor("NGN")) out.push("NGN");
  if (planCodeFor("USD")) out.push("USD");
  return out;
}

/** Back-compat: the primary (NGN) label, used where only one is shown. */
export const PAYSTACK_PRICE_LABEL = priceLabelFor("NGN");

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

/**
 * The accounts.phone_e164 key for a Paystack customer email. Telegram customers
 * use a synthetic tg-<chatId>@ email → 'tg:<chatId>'. Web customers use their
 * real email → 'web:<email>'. This lets any Paystack webhook (including renewals
 * that carry no metadata) map straight back to the right account.
 */
export function accountKeyFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const chatId = chatIdFromEmail(email);
  if (chatId) return `tg:${chatId}`;
  return `web:${email.toLowerCase()}`;
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
 * Starts a recurring subscription and returns the checkout URL. The plan (set in
 * the Paystack dashboard) governs the amount + currency, so we pass only the
 * plan — no hardcoded amount/currency, which keeps NGN and USD plans clean.
 */
async function initCheckout(
  email: string,
  currency: Currency,
  metadata: Record<string, unknown>
): Promise<string | null> {
  const plan = planCodeFor(currency);
  const base = process.env.APP_BASE_URL ?? "https://www.inklinesign.com";
  if (!plan) {
    console.error(`PAYSTACK: no plan code for ${currency} (set PAYSTACK_PLAN_${currency})`);
    return null;
  }
  const data = await paystack("/transaction/initialize", "POST", {
    email,
    plan, // the plan sets the amount + currency and makes it recurring
    callback_url: `${base}/billing/success`,
    metadata: { ...metadata, currency },
  });
  return data?.authorization_url ?? null;
}

/** Telegram subscription — chat_id encoded into a synthetic email. Naira. */
export async function initPaystackSubscription(
  chatId: string,
  currency: Currency = "NGN"
): Promise<string | null> {
  return initCheckout(emailForChat(chatId), currency, { chat_id: chatId, account_key: `tg:${chatId}` });
}

/** Web subscription — the sender's real email; account keyed 'web:<email>'. */
export async function initPaystackSubscriptionForEmail(
  email: string,
  currency: Currency = "NGN"
): Promise<string | null> {
  const key = `web:${email.toLowerCase()}`;
  return initCheckout(email, currency, { account_key: key });
}

/** Every configured currency's checkout option (label + URL), for the web paywall. */
export async function checkoutOptionsForEmail(
  email: string
): Promise<{ currency: Currency; label: string; url: string }[]> {
  const out: { currency: Currency; label: string; url: string }[] = [];
  for (const currency of availableCurrencies()) {
    const url = await initPaystackSubscriptionForEmail(email, currency);
    if (url) out.push({ currency, label: priceLabelFor(currency), url });
  }
  return out;
}

/** Disables (cancels) a subscription. Needs the subscription code + email token. */
export async function disablePaystackSubscription(code: string, token: string): Promise<boolean> {
  const data = await paystack("/subscription/disable", "POST", { code, token });
  return data !== null;
}

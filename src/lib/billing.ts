import { supabaseAdmin } from "@/lib/supabase";

export interface Account {
  phone_e164: string;
  documents_used: number;
  free_limit: number;
  plan: "free" | "active" | "past_due" | "cancelled";
  provider: "stripe" | "flutterwave" | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
}

/** Fetches or creates the account row for a sender. */
export async function getAccount(phone: string): Promise<Account> {
  const db = supabaseAdmin();
  const { data } = await db.from("accounts").select("*").eq("phone_e164", phone).maybeSingle();
  if (data) return data as Account;

  const { data: created, error } = await db
    .from("accounts")
    .insert({ phone_e164: phone })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created as Account;
}

/** True if this sender can start another document right now. */
export async function canSend(phone: string): Promise<{ ok: boolean; account: Account; remaining: number }> {
  const account = await getAccount(phone);
  if (account.plan === "active") return { ok: true, account, remaining: Infinity };
  const remaining = Math.max(0, account.free_limit - account.documents_used);
  return { ok: remaining > 0, account, remaining };
}

/** Increments the lifetime document counter after a successful send. */
export async function recordDocumentSent(phone: string): Promise<void> {
  const db = supabaseAdmin();
  const account = await getAccount(phone);
  await db
    .from("accounts")
    .update({ documents_used: account.documents_used + 1, updated_at: new Date().toISOString() })
    .eq("phone_e164", phone);
}

/** Which provider to use for a sender, by their country code. */
export function providerFor(_phone: string): "stripe" | "flutterwave" {
  // Global-first: everyone uses Stripe, which accepts cards worldwide.
  // A dedicated Flutterwave corridor can be added later for local rails;
  // until then, no one is blocked behind an unbuilt provider.
  return "stripe";
}

/**
 * Creates a Stripe Checkout session for a subscription and returns the URL.
 * plan: 'monthly' | 'annual' — picks the matching price.
 * Requires STRIPE_SECRET_KEY and STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL.
 */
export async function createStripeCheckout(
  phone: string,
  plan: "monthly" | "annual" = "monthly"
): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  const price =
    plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;

  // Temporary diagnostics — surfaces the real cause in logs.
  if (!key) { console.error("CHECKOUT: STRIPE_SECRET_KEY missing"); return null; }
  if (!price) { console.error(`CHECKOUT: STRIPE_PRICE_${plan.toUpperCase()} missing`); return null; }
  if (!process.env.APP_BASE_URL) { console.error("CHECKOUT: APP_BASE_URL missing"); return null; }

  let account;
  try {
    account = await getAccount(phone);
  } catch (e) {
    console.error("CHECKOUT: getAccount failed —", e instanceof Error ? e.message : e);
    return null;
  }
  const base = process.env.APP_BASE_URL;

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", price);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${base}/billing/success`);
  params.set("cancel_url", `${base}/billing/cancelled`);
  params.set("client_reference_id", phone);
  params.set("metadata[phone]", phone);
  if (account.stripe_customer_id) params.set("customer", account.stripe_customer_id);
  // In subscription mode Stripe creates the customer automatically —
  // customer_creation is only valid in payment mode, so we don't set it.
  params.set("subscription_data[metadata][phone]", phone);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    console.error("CHECKOUT: Stripe rejected —", await res.text());
    return null;
  }
  const session = await res.json();

  try {
    const db = supabaseAdmin();
    await db.from("checkout_sessions").insert({ id: session.id, phone_e164: phone, provider: "stripe" });
  } catch (e) {
    // Don't fail checkout just because the session-log insert failed.
    console.error("CHECKOUT: checkout_sessions insert failed (non-fatal) —", e instanceof Error ? e.message : e);
  }

  return session.url ?? null;
}

/** Human-readable price labels for the bot. Override via env if you change pricing. */
export const PRICING = {
  monthly: process.env.STRIPE_LABEL_MONTHLY ?? "$9/month",
  annual: process.env.STRIPE_LABEL_ANNUAL ?? "$90/year (2 months free)",
};

/**
 * Creates a Stripe Customer Portal session so a subscriber can manage or cancel
 * their subscription, update card, and see invoices. Returns the portal URL.
 */
export async function createStripePortal(phone: string): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.error("PORTAL: STRIPE_SECRET_KEY missing"); return null; }

  const account = await getAccount(phone);
  if (!account.stripe_customer_id) {
    console.error("PORTAL: no stripe_customer_id for", phone);
    return null;
  }

  const params = new URLSearchParams();
  params.set("customer", account.stripe_customer_id);
  params.set("return_url", `${process.env.APP_BASE_URL}/billing/success`);

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    console.error("PORTAL: Stripe rejected —", await res.text());
    return null;
  }
  const session = await res.json();
  return session.url ?? null;
}

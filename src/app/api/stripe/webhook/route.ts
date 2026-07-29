import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Accounts are keyed by `phone_e164`. On Telegram that key is `tg:<chat_id>`,
 * so to message someone we strip the prefix back off to get their chat id.
 * Returns null for legacy WhatsApp-era rows (we no longer message those).
 */
function chatIdFromKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.startsWith("tg:") ? key.slice(3) : null;
}

/** Verifies Stripe's signature header manually (no SDK). */
function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  );
  const timestamp = parts["t"];
  const sig = parts["v1"];
  if (!timestamp || !sig) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const header = req.headers.get("stripe-signature") ?? "";

  if (secret) {
    if (!verifyStripeSignature(payload, header, secret)) {
      return new NextResponse("Invalid signature", { status: 400 });
    }
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  const db = supabaseAdmin();
  const obj = event.data.object;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // `phone` here is the account key — `tg:<chat_id>` for Telegram users.
        const key =
          (obj.metadata as Record<string, string>)?.phone || (obj.client_reference_id as string);
        if (!key) break;
        await db
          .from("accounts")
          .update({
            plan: "active",
            provider: "stripe",
            stripe_customer_id: (obj.customer as string) ?? null,
            stripe_subscription_id: (obj.subscription as string) ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("phone_e164", key);
        await db.from("checkout_sessions").update({ status: "complete" }).eq("id", obj.id as string);

        const chatId = chatIdFromKey(key);
        if (chatId) {
          await sendText(
            chatId,
            "You're subscribed ✓ Inkline is now unlimited. Send a document whenever you're ready."
          ).catch(() => {});
        }
        break;
      }

      case "invoice.paid": {
        const subId = obj.subscription as string;
        const periodEnd = (obj.lines as { data?: { period?: { end?: number } }[] })?.data?.[0]?.period?.end;
        if (subId) {
          await db
            .from("accounts")
            .update({
              plan: "active",
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const subId = obj.subscription as string;
        if (subId) {
          await db
            .from("accounts")
            .update({ plan: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);
          const { data: acc } = await db
            .from("accounts")
            .select("phone_e164")
            .eq("stripe_subscription_id", subId)
            .maybeSingle();
          const chatId = chatIdFromKey(acc?.phone_e164);
          if (chatId) {
            await sendText(
              chatId,
              "We couldn't process your Inkline subscription payment. Reply BILLING to update your card and keep sending."
            ).catch(() => {});
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subId = obj.id as string;
        await db
          .from("accounts")
          .update({ plan: "cancelled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);
        break;
      }
    }
  } catch (e) {
    console.error("Stripe webhook error:", e);
    return NextResponse.json({ received: true, note: "handled with error" });
  }

  return NextResponse.json({ received: true });
}

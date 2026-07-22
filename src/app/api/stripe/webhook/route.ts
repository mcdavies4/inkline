import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Verifies Stripe's signature header manually (no SDK).
 * Header format: t=timestamp,v1=signature
 */
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
        const phone = (obj.metadata as Record<string, string>)?.phone || (obj.client_reference_id as string);
        if (!phone) break;
        await db
          .from("accounts")
          .update({
            plan: "active",
            provider: "stripe",
            stripe_customer_id: (obj.customer as string) ?? null,
            stripe_subscription_id: (obj.subscription as string) ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("phone_e164", phone);
        await db.from("checkout_sessions").update({ status: "complete" }).eq("id", obj.id as string);
        await sendText(
          phone,
          "You're subscribed ✓ Inkline is now unlimited. Send a document whenever you're ready."
        ).catch(() => {});
        break;
      }

      case "invoice.paid": {
        // Renewal — keep the account active and extend the period.
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
          if (acc?.phone_e164) {
            await sendText(
              acc.phone_e164,
              "We couldn't process your Inkline subscription payment. Please update your card to keep sending — reply BILLING for a link."
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
    // Return 200 anyway so Stripe doesn't hammer retries on a transient error we've logged.
    return NextResponse.json({ received: true, note: "handled with error" });
  }

  return NextResponse.json({ received: true });
}

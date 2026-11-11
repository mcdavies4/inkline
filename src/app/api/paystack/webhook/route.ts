import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText } from "@/lib/telegram";
import { chatIdFromEmail } from "@/lib/paystack";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Paystack signs the raw body with HMAC-SHA512 using your secret key. */
function verify(payload: string, header: string, secret: string): boolean {
  const expected = createHmac("sha512", secret).update(payload).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const header = req.headers.get("x-paystack-signature") ?? "";

  if (secret) {
    if (!verify(payload, header, secret)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  let event: { event: string; data: Record<string, any> };
  try {
    event = JSON.parse(payload);
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  const db = supabaseAdmin();
  const data = event.data ?? {};
  const email: string | undefined = data.customer?.email;
  const chatId = chatIdFromEmail(email) ?? (data.metadata?.chat_id as string | undefined) ?? null;
  const key = chatId ? `tg:${chatId}` : null;

  try {
    switch (event.event) {
      // A successful charge — initial payment OR a monthly renewal.
      case "charge.success": {
        if (key) {
          await db
            .from("accounts")
            .update({ plan: "active", provider: "paystack", updated_at: new Date().toISOString() })
            .eq("phone_e164", key);
        }
        if (chatId) {
          await sendText(
            chatId,
            "You're subscribed ✓ Inkline is now unlimited. Send a document whenever you're ready."
          ).catch(() => {});
        }
        break;
      }

      // Subscription created — stash the code + token so we can cancel later.
      case "subscription.create": {
        if (key) {
          await db
            .from("accounts")
            .update({
              plan: "active",
              provider: "paystack",
              paystack_subscription_code: data.subscription_code ?? null,
              paystack_email_token: data.email_token ?? null,
              current_period_end: data.next_payment_date ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("phone_e164", key);
        }
        break;
      }

      case "invoice.payment_failed": {
        if (key) {
          await db
            .from("accounts")
            .update({ plan: "past_due", updated_at: new Date().toISOString() })
            .eq("phone_e164", key);
          if (chatId) {
            await sendText(
              chatId,
              "We couldn't process your Inkline payment. Reply BILLING to fix your card and keep sending."
            ).catch(() => {});
          }
        }
        break;
      }

      // Subscription ended or cancelled.
      case "subscription.disable":
      case "subscription.not_renew": {
        if (key) {
          await db
            .from("accounts")
            .update({ plan: "cancelled", updated_at: new Date().toISOString() })
            .eq("phone_e164", key);
        }
        break;
      }
    }
  } catch (e) {
    console.error("Paystack webhook error:", e);
    // 200 so Paystack doesn't hammer retries on a transient error we've logged.
    return NextResponse.json({ received: true, note: "handled with error" });
  }

  return NextResponse.json({ received: true });
}

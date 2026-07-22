import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { sendText, fetchMedia } from "@/lib/whatsapp";
import { createDocument, createAndDeliverRequest, SignerInput } from "@/lib/requests";
import { canSend, recordDocumentSent, providerFor, createStripeCheckout, createStripePortal, getAccount, PRICING } from "@/lib/billing";
import { generatePdfFromText } from "@/lib/doctext";
import { t } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const header = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const payload = JSON.parse(raw || "{}");
  const value = payload?.entry?.[0]?.changes?.[0]?.value;

  // Guard against cross-wiring: only respond to messages delivered to Inkline's
  // own WhatsApp number. If another product (e.g. Nolgic) shares a Meta app or
  // its webhook gets crossed, ignore those messages instead of replying.
  const receivedOn = value?.metadata?.phone_number_id;
  const ownNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (receivedOn && ownNumberId && receivedOn !== ownNumberId) {
    console.log(`Ignoring message for phone_number_id ${receivedOn} (not Inkline's ${ownNumberId})`);
    return NextResponse.json({ ok: true });
  }

  const msg = value?.messages?.[0];
  if (!msg) return NextResponse.json({ ok: true });

  const from: string = msg.from;
  const profileName: string =
    value?.contacts?.[0]?.profile?.name ?? "A contact";

  try {
    if (msg.type === "document") {
      await handleDocument(from, msg);
    } else if (msg.type === "text") {
      await handleText(from, profileName, (msg.text?.body ?? "").trim(), msg.id);
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    await sendText(from, t("bot_error")).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

// ---------------- Session ----------------
type SessionData = {
  document_id?: string;
  filename?: string;
  signers?: SignerInput[];
  flow?: "sequential" | "parallel";
  require_otp?: boolean;
  pending_name?: string;
  // template flow
  template_id?: string;
  template_title?: string;
  template_fields?: { key: string; label: string }[];
  template_values?: Record<string, string>;
  template_field_index?: number;
  template_body?: string;
  // placement flow
  request_id_pending?: string;
  place_token?: string;
};

async function getSession(phone: string) {
  const db = supabaseAdmin();
  const { data } = await db.from("bot_sessions").select().eq("phone_e164", phone).maybeSingle();
  return data as { state: string; data: SessionData } | null;
}
async function setSession(phone: string, state: string, data: SessionData) {
  const db = supabaseAdmin();
  // Strip undefined values — jsonb serialization can choke on them.
  const clean = JSON.parse(JSON.stringify(data));
  const { error } = await db
    .from("bot_sessions")
    .upsert({ phone_e164: phone, state, data: clean, updated_at: new Date().toISOString() });
  if (error) {
    console.error("setSession failed:", state, error.message);
    throw new Error(`session write failed: ${error.message}`);
  }
}
async function clearSession(phone: string) {
  const db = supabaseAdmin();
  await db.from("bot_sessions").delete().eq("phone_e164", phone);
}

// ---------------- Document inbound ----------------
async function handleDocument(from: string, msg: { document?: { id?: string; filename?: string; mime_type?: string } }) {
  const docMeta = msg.document;
  if (!docMeta?.id) return;
  if (docMeta.mime_type !== "application/pdf") {
    await sendText(from, t("bot_not_pdf"));
    return;
  }

  // Credit gate — block before doing any work if they're out of free documents.
  const { ok } = await canSend(from);
  if (!ok) {
    await sendPaywall(from);
    return;
  }

  const { bytes } = await fetchMedia(docMeta.id);
  if (bytes.length > 15 * 1024 * 1024) {
    await sendText(from, t("bot_too_big"));
    return;
  }
  const filename = docMeta.filename ?? "document.pdf";
  const doc = await createDocument(bytes, filename);
  await setSession(from, "awaiting_name", { document_id: doc.id, filename, signers: [] });
  await sendText(from, t("bot_got_doc", { filename }));
}

/** Sends the "you're out of free documents" message and offers a plan choice. */
async function sendPaywall(from: string) {
  const provider = providerFor(from);
  if (provider === "stripe") {
    await setSession(from, "awaiting_plan", {});
    await sendText(
      from,
      `You've used your 3 free documents 🎉\n\nGo unlimited with Inkline:\n\n💳 *MONTHLY* — ${PRICING.monthly}\n💳 *ANNUAL* — ${PRICING.annual}\n\nReply MONTHLY or ANNUAL to subscribe.`
    );
    return;
  }
  // Flutterwave (Nigeria) not wired yet.
  await sendText(
    from,
    "You've used your 3 free documents 🎉 Paid plans are launching in your region very soon — reply BILLING and we'll set you up."
  );
}

/** Handles the MONTHLY/ANNUAL reply → sends the matching Stripe link. */
async function handlePlanChoice(from: string, upper: string) {
  if (upper !== "MONTHLY" && upper !== "ANNUAL") {
    await sendText(from, "Reply MONTHLY or ANNUAL to choose a plan, or CANCEL.");
    return;
  }
  const plan = upper === "ANNUAL" ? "annual" : "monthly";
  const url = await createStripeCheckout(from, plan);
  await clearSession(from);
  if (url) {
    await sendText(
      from,
      `Great choice. Complete your ${plan} subscription here:\n${url}\n\nOnce you're done, come straight back and send your document.`
    );
  } else {
    await sendText(from, "Something went wrong setting up checkout — please try again shortly.");
  }
}

// ---------------- Text / state machine ----------------
async function handleText(from: string, profileName: string, text: string, waMessageId: string) {
  const upper = text.toUpperCase();
  const session = await getSession(from);

  // Cold-signer recovery: if this person has a PENDING signature waiting and
  // isn't in the middle of their own sender flow, send them their signing link.
  // This closes the gap where a cold signer got the template notification but
  // not the link — the moment they reply anything, they get their link.
  if (!session || session.state === "idle") {
    const linkSent = await maybeSendPendingSignerLink(from);
    if (linkSent) return;
  }

  if (upper === "CANCEL" && session && session.state !== "idle") {
    await clearSession(from);
    await sendText(from, t("bot_cancelled"));
    return;
  }

  // RESTART always clears a stuck session, from any state.
  if (upper === "RESTART" || upper === "RESET") {
    await clearSession(from);
    await sendText(from, t("bot_intro"));
    return;
  }

  // Greetings mid-flow: if the sender says hi/hello/start while stuck in a
  // placement or plan state, treat it as "start over" rather than nagging.
  if (
    ["HI", "HELLO", "HEY", "START", "MENU"].includes(upper) &&
    session &&
    ["awaiting_placement", "awaiting_plan"].includes(session.state)
  ) {
    await clearSession(from);
    await sendText(from, t("bot_intro"));
    return;
  }

  // Plan selection can arrive right after the paywall.
  if (session?.state === "awaiting_plan") {
    return handlePlanChoice(from, upper);
  }

  // Placement choice after confirming signers.
  if (session?.state === "awaiting_placement") {
    return handlePlacementChoice(from, upper, session.data);
  }

  // Global commands (only when not mid-flow, to avoid hijacking a name entry)
  if (!session || session.state === "idle") {
    if (upper === "HELP") return void (await sendText(from, t("bot_help")));
    if (upper === "STATUS") return void (await handleStatus(from));
    if (upper === "DASHBOARD") return void (await handleDashboard(from));
    if (upper === "BILLING" || upper === "SUBSCRIBE") return void (await handleBilling(from));
    if (upper === "ADMIN") return void (await handleAdmin(from));
    const tpl = await matchTemplate(upper);
    if (tpl) return void (await startTemplate(from, tpl));
    if (["YES", "APPROVE", "APPROVED", "I APPROVE"].includes(upper)) {
      if (await tryQuickApproval(from, text, waMessageId)) return;
    }
    return void (await sendText(from, t("bot_intro")));
  }

  switch (session.state) {
    case "awaiting_name":
      return handleSignerName(from, text, session.data);
    case "awaiting_phone":
      return handleSignerPhone(from, text, session.data);
    case "awaiting_more":
      return handleMore(from, text, upper, session.data);
    case "awaiting_flow":
      return handleFlow(from, upper, session.data);
    case "awaiting_otp":
      return handleOtpChoice(from, upper, session.data);
    case "awaiting_confirm":
      return handleConfirm(from, upper, profileName, session.data);
    case "template_field":
      return handleTemplateField(from, text, session.data);
    case "template_name":
      return handleSignerName(from, text, session.data);
  }
}

async function handleSignerName(from: string, text: string, data: SessionData) {
  if (text.length < 2 || text.length > 80) return void (await sendText(from, t("bot_bad_name")));
  await setSession(from, "awaiting_phone", { ...data, pending_name: text });
  await sendText(from, t("bot_ask_phone", { first: text.split(" ")[0] }));
}

async function handleSignerPhone(from: string, text: string, data: SessionData) {
  const upper = text.trim().toUpperCase();
  // Safety net: if the user typed a control word here, route it correctly
  // instead of rejecting it as a bad phone number.
  if (["DONE", "SEND", "ORDER", "TOGETHER", "OTP", "SKIP"].includes(upper)) {
    // If we already have at least one signer, treat DONE as "finish adding".
    if ((data.signers ?? []).length > 0 && upper === "DONE") {
      return handleMore(from, text, upper, data);
    }
  }
  const digits = text.replace(/[^\d]/g, "");
  if (text.trim().startsWith("0") || digits.length < 10 || digits.length > 15) {
    return void (await sendText(from, t("bot_bad_phone")));
  }
  const signers = [...(data.signers ?? []), { name: data.pending_name!, phone: digits }];
  await setSession(from, "awaiting_more", { ...data, signers, pending_name: undefined });
  await sendText(from, t("bot_ask_more_signers", { name: data.pending_name! }));
}

async function handleMore(from: string, text: string, upper: string, data: SessionData) {
  if (upper === "DONE") {
    const signers = data.signers ?? [];
    if (signers.length > 1) {
      await setSession(from, "awaiting_flow", data);
      await sendText(from, t("bot_ask_flow", { count: signers.length }));
    } else {
      await setSession(from, "awaiting_otp", data);
      await sendText(from, t("bot_ask_otp"));
    }
    return;
  }
  // treat as next signer's name
  return handleSignerName(from, text, data);
}

async function handleFlow(from: string, upper: string, data: SessionData) {
  if (upper !== "ORDER" && upper !== "TOGETHER") {
    return void (await sendText(from, "Reply ORDER or TOGETHER."));
  }
  const flow = upper === "ORDER" ? "sequential" : "parallel";
  await setSession(from, "awaiting_otp", { ...data, flow });
  await sendText(from, t("bot_ask_otp"));
}

async function handleOtpChoice(from: string, upper: string, data: SessionData) {
  if (upper !== "OTP" && upper !== "SKIP") {
    return void (await sendText(from, "Reply OTP to enable the code check, or SKIP."));
  }
  const require_otp = upper === "OTP";
  await setSession(from, "awaiting_confirm", { ...data, require_otp });
  await sendConfirm(from, { ...data, require_otp });
}

async function sendConfirm(from: string, data: SessionData) {
  const signers = data.signers ?? [];
  if (signers.length === 1) {
    await sendText(
      from,
      t("bot_confirm_single", { filename: data.filename!, signer: signers[0].name, phone: signers[0].phone })
    );
  } else {
    const signerList = signers.map((s, i) => `  ${i + 1}. ${s.name} (+${s.phone})`).join("\n");
    const flow = data.flow === "sequential" ? "Sign in order" : "Sign together";
    const otp = data.require_otp ? " · code check on" : "";
    await sendText(from, t("bot_confirm_multi", { filename: data.filename!, signerList, flow, otp }));
  }
}

async function handleConfirm(from: string, upper: string, profileName: string, data: SessionData) {
  if (!["SEND", "YES", "GO", "CONFIRM"].includes(upper)) {
    return void (await sendText(from, t("bot_send_prompt")));
  }
  const signers = data.signers ?? [];

  // Create the request now, but hold delivery until placement is decided.
  const { createRequestPending } = await import("@/lib/requests");
  const requestId = await createRequestPending({
    documentId: data.document_id!,
    signers,
    senderName: profileName,
    senderPhone: from,
    flow: data.flow,
    requireOtp: data.require_otp,
  });

  // Count the document now (it's committed).
  await recordDocumentSent(from).catch(() => {});

  // Offer field placement or skip.
  const db = supabaseAdmin();
  const { randomBytes } = await import("crypto");
  const placeToken = randomBytes(20).toString("base64url");
  await db.from("placement_tokens").insert({ token: placeToken, request_id: requestId });
  await db.from("sign_requests").update({ placement: "pending" }).eq("id", requestId);

  await setSession(from, "awaiting_placement", { ...data, request_id_pending: requestId, place_token: placeToken });
  await sendText(
    from,
    `Almost there. Where should the signature go?\n\n📍 *PLACE* — open a page to drag the signature, date and other fields onto the exact spot\n⬇️ *SKIP* — just put the signature at the bottom of the last page\n\nReply PLACE or SKIP.`
  );
}

/** Handles PLACE / SKIP after the sender confirms. */
async function handlePlacementChoice(from: string, upper: string, data: SessionData) {
  const requestId = data.request_id_pending!;
  const db = supabaseAdmin();

  if (upper === "SKIP") {
    await db.from("sign_requests").update({ placement: "none" }).eq("id", requestId);
    const { deliverPlacedRequest } = await import("@/lib/requests");
    const result = await deliverPlacedRequest(requestId);
    await clearSession(from);
    const ref = requestId.slice(0, 8);
    const signers = data.signers ?? [];
    if (!result.delivered) {
      return void (await sendText(from, t("bot_send_failed", { phone: signers[0].phone, url: result.signUrl })));
    }
    if (signers.length === 1) {
      await sendText(from, t("bot_sent_single", { name: signers[0].name, ref }));
    } else {
      const queue = data.flow === "sequential" ? ` The others will be notified in turn.` : ` All ${signers.length} have it now.`;
      await sendText(from, t("bot_sent_multi", { first: signers[0].name, queue, ref }));
    }
    return;
  }

  if (upper === "PLACE") {
    const url = `${process.env.APP_BASE_URL}/place/${data.place_token}`;
    // Placement now happens entirely on the web. Clear the session so the sender's
    // next WhatsApp message (e.g. "hi") starts fresh instead of being read as a
    // placement choice. Delivery is triggered by the placement page on completion.
    await clearSession(from);
    await sendText(
      from,
      `Open this to place the fields:\n${url}\n\nDrag on signature, date, initials or text, then tap Done. I'll deliver the document to your signers automatically once you're finished.\n\n(Changed your mind? Reply SKIP is no longer available once you're here — just send a new document to start over.)`
    );
    return;
  }

  await sendText(from, "Reply PLACE to position the fields, or SKIP to use the bottom of the last page.");
}

// ---------------- Billing ----------------
async function handleBilling(from: string) {
  const provider = providerFor(from);
  if (provider !== "stripe") {
    await sendText(from, "Paid plans are launching in your region very soon. We'll let you know the moment they're live.");
    return;
  }

  // Already subscribed with a real Stripe customer? Give them the portal.
  const account = await getAccount(from);
  if ((account.plan === "active" || account.plan === "past_due") && account.stripe_customer_id) {
    const portalUrl = await createStripePortal(from);
    if (portalUrl) {
      await sendText(
        from,
        `Manage your Inkline subscription here — update your card, view invoices, or cancel:\n${portalUrl}`
      );
      return;
    }
    await sendText(from, "Couldn't open your billing page just now — please try again shortly.");
    return;
  }

  // Not subscribed (or active without a real customer, e.g. comped) → offer plans.
  await setSession(from, "awaiting_plan", {});
  await sendText(
    from,
    `Subscribe to Inkline for unlimited documents:\n\n💳 *MONTHLY* — ${PRICING.monthly}\n💳 *ANNUAL* — ${PRICING.annual}\n\nReply MONTHLY or ANNUAL.`
  );
}

// ---------------- Templates ----------------
async function matchTemplate(upper: string) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("doc_templates")
    .select("*")
    .is("owner_phone", null)
    .eq("active", true)
    .ilike("keyword", upper)
    .maybeSingle();
  return data;
}

async function startTemplate(from: string, tpl: { id: string; title: string; description: string; fields: { key: string; label: string }[]; body_template: string }) {
  const { ok } = await canSend(from);
  if (!ok) {
    await sendPaywall(from);
    return;
  }
  await setSession(from, "template_field", {
    template_id: tpl.id,
    template_title: tpl.title,
    template_fields: tpl.fields,
    template_values: {},
    template_field_index: 0,
    template_body: tpl.body_template,
  });
  await sendText(from, t("tpl_start", { title: tpl.title, description: tpl.description ?? "" }));
  await sendText(from, t("tpl_ask_field", { label: tpl.fields[0].label }));
}

async function handleTemplateField(from: string, text: string, data: SessionData) {
  const fields = data.template_fields ?? [];
  const idx = data.template_field_index ?? 0;
  const values = { ...(data.template_values ?? {}), [fields[idx].key]: text };
  const nextIdx = idx + 1;

  if (nextIdx < fields.length) {
    await setSession(from, "template_field", { ...data, template_values: values, template_field_index: nextIdx });
    return void (await sendText(from, t("tpl_ask_field", { label: fields[nextIdx].label })));
  }

  // All fields collected — render the document to a PDF
  let body = data.template_body ?? "";
  for (const [k, v] of Object.entries(values)) body = body.replaceAll(`{{${k}}}`, v);
  const pdf = await generatePdfFromText(data.template_title ?? "Document", body);
  const filename = `${(data.template_title ?? "document").toLowerCase().replace(/\s+/g, "-")}.pdf`;
  const doc = await createDocument(Buffer.from(pdf), filename);

  await setSession(from, "template_name", { document_id: doc.id, filename, signers: [] });
  await sendText(from, t("tpl_ready", { title: data.template_title ?? "document" }));
}

// ---------------- STATUS ----------------
async function handleStatus(from: string) {
  const db = supabaseAdmin();
  const { data: reqs } = await db
    .from("sign_requests")
    .select("id, status, created_at, documents(filename), signers(status)")
    .eq("sender_phone", from)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!reqs || reqs.length === 0) return void (await sendText(from, t("bot_status_empty")));

  let out = t("bot_status_header");
  for (const r of reqs as unknown as { id: string; documents: { filename: string }; signers: { status: string }[] }[]) {
    const signed = r.signers.filter((s) => s.status === "signed").length;
    const total = r.signers.length;
    out += `\n📄 ${r.documents.filename} — ${signed}/${total} signed  ·  ref ${r.id.slice(0, 8)}`;
  }
  await sendText(from, out);
}

// ---------------- DASHBOARD ----------------
async function handleDashboard(from: string) {
  const db = supabaseAdmin();
  const token = randomBytes(20).toString("base64url");
  await db.from("dashboard_tokens").insert({ token, sender_phone: from });
  await sendText(from, t("bot_dashboard", { url: `${process.env.APP_BASE_URL}/dashboard/${token}` }));
}

// ---------------- Quick approval ----------------
async function tryQuickApproval(from: string, reply: string, waMessageId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: signer } = await db
    .from("signers")
    .select("*, sign_requests!inner(*)")
    .eq("phone_e164", from)
    .in("status", ["pending", "viewed"])
    .eq("sign_requests.mode", "quick_approval")
    .eq("sign_requests.status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!signer) return false;

  const now = new Date().toISOString();
  await db.from("signers").update({ status: "signed", signed_at: now }).eq("id", signer.id);
  await db.from("sign_requests").update({ status: "signed", completed_at: now }).eq("id", signer.request_id);
  await db.from("audit_events").insert({
    request_id: signer.request_id,
    signer_id: signer.id,
    event_type: "quick_approved",
    meta: { reply, wa_message_id: waMessageId },
  });
  await sendText(from, t("approve_recorded", { time: now.slice(0, 16).replace("T", " "), sender: signer.sign_requests.sender_name }));
  if (signer.sign_requests.sender_phone) {
    await sendText(signer.sign_requests.sender_phone, `✓ ${signer.name} approved by WhatsApp reply.`).catch(() => {});
  }
  return true;
}

// ---------------- Admin stats (owner only) ----------------
async function handleAdmin(from: string) {
  // Restricted to the owner's number. Set ADMIN_PHONE in env (digits only).
  const admin = (process.env.ADMIN_PHONE ?? "").replace(/[^\d]/g, "");
  if (!admin || from !== admin) {
    // Not the owner — behave as if the command doesn't exist.
    await sendText(from, t("bot_intro"));
    return;
  }

  const db = supabaseAdmin();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [senders, subs, docsAll, docsSigned, docsWeek, docsToday, pending, signersAll, signedSigners] =
    await Promise.all([
      db.from("accounts").select("*", { count: "exact", head: true }),
      db.from("accounts").select("*", { count: "exact", head: true }).eq("plan", "active"),
      db.from("sign_requests").select("*", { count: "exact", head: true }),
      db.from("sign_requests").select("*", { count: "exact", head: true }).eq("status", "signed"),
      db.from("sign_requests").select("*", { count: "exact", head: true }).gt("created_at", weekAgo),
      db.from("sign_requests").select("*", { count: "exact", head: true }).gt("created_at", dayAgo),
      db.from("sign_requests").select("*", { count: "exact", head: true }).in("status", ["pending", "in_progress"]),
      db.from("signers").select("*", { count: "exact", head: true }),
      db.from("signers").select("*", { count: "exact", head: true }).eq("status", "signed"),
    ]);

  const total = docsAll.count ?? 0;
  const signed = docsSigned.count ?? 0;
  const rate = total > 0 ? Math.round((signed / total) * 100) : 0;

  await sendText(
    from,
    `📊 *Inkline stats*\n\n` +
      `👤 Senders: ${senders.count ?? 0}  ·  💳 Subscribers: ${subs.count ?? 0}\n\n` +
      `📄 Documents: ${total} total\n` +
      `   ✓ ${signed} completed (${rate}%)\n` +
      `   ⏳ ${pending.count ?? 0} awaiting signatures\n` +
      `   📅 ${docsToday.count ?? 0} today · ${docsWeek.count ?? 0} this week\n\n` +
      `✍️ Signers: ${signedSigners.count ?? 0}/${signersAll.count ?? 0} signed`
  );
}

/**
 * If this phone number has a pending (unsigned) signature, send them their
 * signing link and return true. This recovers cold signers who received the
 * template notification but couldn't get the link until they opened a window.
 */
async function maybeSendPendingSignerLink(from: string): Promise<boolean> {
  const db = supabaseAdmin();
  // Find the most recent pending signer row for this number whose turn it is.
  const { data: signers } = await db
    .from("signers")
    .select("id, name, sign_token, status, sign_order, request_id")
    .eq("phone_e164", from)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  const signer = signers?.[0];
  if (!signer) return false;

  // For sequential flows, only prompt if it's actually this signer's turn.
  const { data: request } = await db
    .from("sign_requests")
    .select("signing_flow, sender_name")
    .eq("id", signer.request_id)
    .maybeSingle();

  if (request?.signing_flow === "sequential") {
    const { data: earlier } = await db
      .from("signers")
      .select("id")
      .eq("request_id", signer.request_id)
      .lt("sign_order", signer.sign_order)
      .neq("status", "signed")
      .limit(1);
    if (earlier && earlier.length > 0) return false; // not their turn yet
  }

  const signUrl = `${process.env.APP_BASE_URL}/sign/${signer.sign_token}`;
  await sendText(
    from,
    `Hi ${signer.name.split(" ")[0]} 👋\n\n${request?.sender_name ?? "Someone"} has asked you to sign a document. Here's your secure signing link — it takes about 20 seconds:\n\n${signUrl}`
  );
  await db
    .from("audit_events")
    .insert({ request_id: signer.request_id, signer_id: signer.id, event_type: "link_resent_on_reply", meta: {} });
  return true;
}

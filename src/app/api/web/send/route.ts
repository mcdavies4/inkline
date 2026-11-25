import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createDocument, createRequestPending, summariseDocumentById } from "@/lib/requests";
import { supabaseAdmin } from "@/lib/supabase";
import { createStripeCheckout, PRICING } from "@/lib/billing";
import { webSendAllowed, validateCompose, parseSigners, parseCcEmails, deliverWebRequest, deliverWebRequestsIndividually } from "@/lib/web";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/web/send  (multipart/form-data)
 *
 * The web version's send endpoint — no Telegram needed. A sender enters their
 * email, uploads a PDF, and adds signers (name + optional email). We create the
 * request, email any signer who gave an email their signing link, and return a
 * shareable link per signer for the ones who didn't (or as a fallback).
 *
 * Billing: a 7-day free trial from the sender's first send, then a Paystack
 * subscription. Founder emails skip the gate entirely.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }

  const senderName = String(form.get("sender_name") ?? "").trim();
  const senderEmail = String(form.get("sender_email") ?? "").trim().toLowerCase();
  const message = String(form.get("message") ?? "").trim() || null;
  const file = form.get("file") as File | null;
  const ccEmails = parseCcEmails(String(form.get("cc_emails") ?? ""));
  const signers = parseSigners(String(form.get("signers") ?? "[]"));

  // ---- Validation ----
  const invalid = validateCompose({ senderName, senderEmail, signers, ccEmails });
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (!file) return NextResponse.json({ error: "Please attach a PDF to sign." }, { status: 400 });
  if (file.type !== "application/pdf")
    return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: "That PDF is over 20MB — please upload a smaller file." }, { status: 400 });

  // ---- Billing gate: founder, active plan, or still within the 7-day trial ----
  let gate;
  try {
    gate = await webSendAllowed(senderEmail);
  } catch (e) {
    console.error("WEB SEND: gate failed —", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!gate.allowed) {
    const [monthly, annual] = await Promise.all([
      createStripeCheckout(`web:${senderEmail}`, "monthly"),
      createStripeCheckout(`web:${senderEmail}`, "annual"),
    ]);
    const plans = [
      monthly ? { plan: "monthly", label: PRICING.monthly, url: monthly } : null,
      annual ? { plan: "annual", label: PRICING.annual, url: annual } : null,
    ].filter(Boolean);
    return NextResponse.json(
      {
        error: "Your 7-day free trial has ended.",
        needsSubscription: true,
        plans,
        // Back-compat: monthly as the default single option.
        checkoutUrl: monthly,
        priceLabel: PRICING.monthly,
      },
      { status: 402 }
    );
  }

  // "place_first" = the sender wants to drop signature fields on the document
  // before it goes out. We create the request but hold delivery; the /place
  // editor saves the fields and triggers the email send.
  const placeFirst = String(form.get("place_first") ?? "") === "1";
  // "individual" = each signer gets their own separate copy (mail-merge).
  const individual = String(form.get("send_mode") ?? "") === "individual";

  // ---- Store the PDF + create and deliver the request ----
  try {
    const doc = await createDocument(Buffer.from(await file.arrayBuffer()), file.name);

    if (individual && placeFirst) {
      // Place fields ONCE on a throwaway template request, then (on save) the
      // /place editor replicates them to one independent copy per signer.
      const templateId = await createRequestPending({
        documentId: doc.id,
        senderName,
        senderEmail,
        message,
        signers: [{ name: "Signer", email: null, phone: "web:template" }],
        flow: "parallel",
      });
      const token = randomBytes(24).toString("base64url");
      const { error: tokErr } = await supabaseAdmin()
        .from("placement_tokens")
        .insert({ token, request_id: templateId, batch: { mode: "individual", signers } });
      if (tokErr) throw new Error(tokErr.message);
      return NextResponse.json({ ok: true, placeToken: token, filename: doc.filename });
    }

    if (individual) {
      // One summary for the whole batch, then a separate copy per signer.
      const summary = await summariseDocumentById(doc.id);
      const { count, signers: results } = await deliverWebRequestsIndividually({
        documentId: doc.id,
        filename: doc.filename,
        senderName,
        senderEmail,
        message,
        signers,
        accountDocsUsed: gate.account.documents_used,
        aiSummary: summary,
      });
      return NextResponse.json({ ok: true, bulk: true, count, filename: doc.filename, signers: results });
    }

    if (placeFirst) {
      const requestId = await createRequestPending({
        documentId: doc.id,
        senderName,
        senderEmail,
        message,
        ccEmails,
        signers: signers.map((s) => ({ name: s.name, email: s.email, phone: `web:${s.email ?? "anon"}` })),
        flow: "parallel",
      });
      const token = randomBytes(24).toString("base64url");
      const db = supabaseAdmin();
      const { error: tokErr } = await db.from("placement_tokens").insert({ token, request_id: requestId });
      if (tokErr) throw new Error(tokErr.message);
      return NextResponse.json({ ok: true, placeToken: token, filename: doc.filename });
    }

    const { requestId, signers: results } = await deliverWebRequest({
      documentId: doc.id,
      filename: doc.filename,
      senderName,
      senderEmail,
      message,
      ccEmails,
      signers,
      accountDocsUsed: gate.account.documents_used,
    });
    return NextResponse.json({ ok: true, requestId, filename: doc.filename, signers: results });
  } catch (e) {
    console.error("WEB SEND: failed —", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't send the document. Please try again." },
      { status: 500 }
    );
  }
}

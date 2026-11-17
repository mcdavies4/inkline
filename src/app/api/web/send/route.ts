import { NextRequest, NextResponse } from "next/server";
import { createDocument } from "@/lib/requests";
import { checkoutOptionsForEmail } from "@/lib/paystack";
import { webSendAllowed, validateCompose, parseSigners, parseCcEmails, deliverWebRequest } from "@/lib/web";

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
 * Billing: a 14-day free trial from the sender's first send, then a Paystack
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

  // ---- Billing gate: founder, active plan, or still within the 14-day trial ----
  let gate;
  try {
    gate = await webSendAllowed(senderEmail);
  } catch (e) {
    console.error("WEB SEND: gate failed —", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  if (!gate.allowed) {
    const options = await checkoutOptionsForEmail(senderEmail);
    return NextResponse.json(
      { error: "Your 14-day free trial has ended.", needsSubscription: true, options },
      { status: 402 }
    );
  }

  // ---- Store the PDF + create and deliver the request ----
  try {
    const doc = await createDocument(Buffer.from(await file.arrayBuffer()), file.name);
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

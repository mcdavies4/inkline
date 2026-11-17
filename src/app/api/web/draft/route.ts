import { NextRequest, NextResponse } from "next/server";
import { createDocument } from "@/lib/requests";
import { supabaseAdmin } from "@/lib/supabase";
import { EMAIL_RE, parseSigners, parseCcEmails, type WebSigner } from "@/lib/web";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/web/draft  (multipart/form-data)
 * Save a signing as a draft to send later. Creates/updates a web_drafts row.
 * Fields: sender_email (required), sender_name, message, cc_emails, signers,
 *         file (PDF — required to create; optional to replace on update),
 *         draft_id (optional — update instead of create).
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a form upload." }, { status: 400 });
  }

  const draftId = String(form.get("draft_id") ?? "").trim() || null;
  const senderName = String(form.get("sender_name") ?? "").trim();
  const senderEmail = String(form.get("sender_email") ?? "").trim().toLowerCase();
  const message = String(form.get("message") ?? "").trim() || null;
  const ccEmails = parseCcEmails(String(form.get("cc_emails") ?? ""));
  const signers: WebSigner[] = parseSigners(String(form.get("signers") ?? "[]"));
  const file = form.get("file") as File | null;

  if (!EMAIL_RE.test(senderEmail))
    return NextResponse.json({ error: "Please enter your email to save a draft." }, { status: 400 });
  for (const s of signers) if (s.email && !EMAIL_RE.test(s.email))
    return NextResponse.json({ error: `“${s.email}” doesn't look like a valid email.` }, { status: 400 });
  for (const cc of ccEmails) if (!EMAIL_RE.test(cc))
    return NextResponse.json({ error: `“${cc}” doesn't look like a valid email.` }, { status: 400 });

  const db = supabaseAdmin();

  // Store a newly-attached PDF, if any.
  let documentId: string | null = null;
  let filename: string | null = null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf")
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: "That PDF is over 20MB — please upload a smaller file." }, { status: 400 });
    try {
      const doc = await createDocument(Buffer.from(await file.arrayBuffer()), file.name);
      documentId = doc.id;
      filename = doc.filename;
    } catch (e) {
      console.error("DRAFT: store PDF failed —", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Couldn't save the PDF. Please try again." }, { status: 500 });
    }
  }

  try {
    if (draftId) {
      // Update — only overwrite the document when a new file was attached.
      const patch: Record<string, unknown> = {
        sender_name: senderName || null,
        message,
        cc_emails: ccEmails.join(",") || null,
        signers,
        updated_at: new Date().toISOString(),
      };
      if (documentId) { patch.document_id = documentId; patch.filename = filename; }
      const { data, error } = await db
        .from("web_drafts")
        .update(patch)
        .eq("id", draftId)
        .eq("sender_email", senderEmail) // only the owner can update
        .select("id, filename")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
      return NextResponse.json({ ok: true, id: data.id, filename: data.filename });
    }

    if (!documentId)
      return NextResponse.json({ error: "Please attach a PDF to save a draft." }, { status: 400 });

    const { data, error } = await db
      .from("web_drafts")
      .insert({
        sender_email: senderEmail,
        sender_name: senderName || null,
        message,
        cc_emails: ccEmails.join(",") || null,
        signers,
        document_id: documentId,
        filename,
      })
      .select("id, filename")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, filename: data.filename });
  } catch (e) {
    console.error("DRAFT: save failed —", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't save the draft. Please try again." }, { status: 500 });
  }
}

/** GET /api/web/draft?email=...  — list a sender's drafts, newest first. */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("web_drafts")
    .select("id, filename, sender_name, message, cc_emails, signers, updated_at")
    .eq("sender_email", email)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("DRAFT: list failed —", error.message);
    return NextResponse.json({ error: "Couldn't load drafts." }, { status: 500 });
  }

  const drafts = (data ?? []).map((d) => ({
    id: d.id,
    filename: d.filename,
    senderName: d.sender_name,
    message: d.message,
    ccEmails: d.cc_emails,
    signers: Array.isArray(d.signers) ? d.signers : [],
    updatedAt: d.updated_at,
  }));
  return NextResponse.json({ ok: true, drafts });
}

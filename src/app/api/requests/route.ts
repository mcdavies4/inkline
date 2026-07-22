import { NextRequest, NextResponse } from "next/server";
import { createDocument, createAndDeliverRequest } from "@/lib/requests";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/requests  (multipart/form-data)
 * Headers: x-api-key: INKLINE_API_KEY
 * Fields: file, signer_phone, signer_name, sender_name, [sender_phone], [message], [mode]
 * (Single-signer API. The WhatsApp bot handles multi-signer.)
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-api-key") !== process.env.INKLINE_API_KEY) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const signerPhone = String(form.get("signer_phone") ?? "").replace(/[^\d]/g, "");
  const signerName = String(form.get("signer_name") ?? "").trim();
  const senderName = String(form.get("sender_name") ?? "").trim();
  const senderPhone = String(form.get("sender_phone") ?? "").replace(/[^\d]/g, "") || null;
  const message = String(form.get("message") ?? "").trim() || null;
  const mode = form.get("mode") === "quick_approval" ? "quick_approval" : "signature";

  if (!file || !signerPhone || !signerName || !senderName) {
    return NextResponse.json(
      { error: "file, signer_phone, signer_name and sender_name are required" },
      { status: 400 }
    );
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  try {
    const doc = await createDocument(Buffer.from(await file.arrayBuffer()), file.name);
    const result = await createAndDeliverRequest({
      documentId: doc.id,
      signers: [{ name: signerName, phone: signerPhone }],
      senderName,
      senderPhone,
      message,
      mode,
    });
    if (!result.delivered) {
      return NextResponse.json(
        { request_id: result.requestId, sign_url: result.signUrl, warning: "WhatsApp delivery failed" },
        { status: 207 }
      );
    }
    return NextResponse.json({ request_id: result.requestId, sign_url: result.signUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Request creation failed" },
      { status: 500 }
    );
  }
}

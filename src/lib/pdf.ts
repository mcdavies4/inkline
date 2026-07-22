import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const INK = rgb(0.1, 0.13, 0.22);
const MUTE = rgb(0.45, 0.47, 0.53);

export interface SignatureBlock {
  name: string;
  phone: string;
  png: Uint8Array;
  signedAt: string; // "YYYY-MM-DD HH:MM:SS"
}

export interface PlacedField {
  type: "signature" | "date" | "initials" | "text";
  page: number;
  x: number; // 0..1 from left
  y: number; // 0..1 from top
  w: number;
  h: number;
  value?: string | null; // for date/text
  png?: Uint8Array | null; // for signature/initials
}

export interface StampInput {
  originalPdf: Uint8Array;
  signatures: SignatureBlock[];
  placedFields?: PlacedField[]; // when the sender placed fields at exact positions
  requestId: string;
  sha256: string;
  events: { event_type: string; created_at: string; meta: Record<string, unknown> }[];
}

/**
 * Stamps every signature onto the last content page (stacked), then appends
 * a certificate page listing all signers and the full event trail.
 */
export async function stampAndCertify(input: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.originalPdf);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages = doc.getPages();
  const last = pages[pages.length - 1];

  // If the sender placed fields at exact positions, stamp those instead of stacking.
  if (input.placedFields && input.placedFields.length > 0) {
    for (const f of input.placedFields) {
      const page = pages[Math.min(f.page, pages.length - 1)];
      if (!page) continue;
      const { width: pw, height: ph } = page.getSize();
      // Convert page-relative fractions (y from top) to PDF coords (y from bottom).
      const bx = f.x * pw;
      const bw = f.w * pw;
      const bh = f.h * ph;
      const by = ph - f.y * ph - bh; // top-origin → bottom-origin

      if ((f.type === "signature" || f.type === "initials") && f.png) {
        try {
          const img = await doc.embedPng(f.png);
          const scale = Math.min(bw / img.width, bh / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          page.drawImage(img, { x: bx, y: by, width: dw, height: dh });
        } catch {
          /* skip unrenderable image */
        }
      } else if ((f.type === "date" || f.type === "text") && f.value) {
        const size = Math.min(11, bh * 0.8);
        page.drawText(f.value, { x: bx + 2, y: by + bh * 0.25, size, font: helv, color: INK });
      }
    }
  } else {
    // Legacy/skip path: stack signature blocks along the bottom of the last page.
    const sigW = 150;
    const x = 48;
    const y = 70;
    let col = 0;
    for (const s of input.signatures) {
      const png = await doc.embedPng(s.png);
      const sigH = (png.height / png.width) * sigW;
      const bx = x + col * (sigW + 40);
      last.drawImage(png, { x: bx, y: y + 12, width: sigW, height: Math.min(sigH, 44) });
      last.drawLine({
        start: { x: bx, y: y + 10 },
        end: { x: bx + sigW, y: y + 10 },
        thickness: 0.8,
        color: INK,
      });
      last.drawText(s.name, { x: bx, y, size: 8, font: helvBold, color: INK });
      last.drawText(s.signedAt + " UTC", { x: bx, y: y - 10, size: 7, font: helv, color: MUTE });
      col++;
      if (col >= 3) col = 0;
    }
  }

  // Certificate page
  const page = doc.addPage([595.28, 841.89]);
  let cursor = 780;
  const line = (text: string, opts?: { bold?: boolean; size?: number; color?: typeof INK }) => {
    page.drawText(text, {
      x: 56,
      y: cursor,
      size: opts?.size ?? 9.5,
      font: opts?.bold ? helvBold : helv,
      color: opts?.color ?? INK,
      maxWidth: 483,
    });
    cursor -= (opts?.size ?? 9.5) + 7;
  };

  line("Signature certificate", { bold: true, size: 16 });
  cursor -= 10;
  line(`Document reference: ${input.requestId}`);
  line(`Original document SHA-256: ${input.sha256}`, { size: 7.5, color: MUTE });
  cursor -= 8;

  line(`Signers (${input.signatures.length})`, { bold: true, size: 11 });
  cursor -= 2;
  for (const s of input.signatures) {
    line(`${s.name}  ·  +${s.phone}  ·  ${s.signedAt} UTC`, { size: 9 });
  }
  cursor -= 12;

  line("Event trail", { bold: true, size: 11 });
  cursor -= 2;
  for (const ev of input.events) {
    const when = ev.created_at.replace("T", " ").slice(0, 19);
    line(`${when}  ·  ${labelFor(ev.event_type)}${metaSuffix(ev.meta)}`, { size: 8.5 });
    if (cursor < 90) break;
  }

  cursor = Math.max(cursor - 14, 60);
  line("Signed electronically via Inkline. Signer identity verified by possession of the", { size: 8, color: MUTE });
  line("WhatsApp number(s) above. Simple electronic signatures are legally recognised in the", { size: 8, color: MUTE });
  line("UK and EU under eIDAS.", { size: 8, color: MUTE });

  return doc.save();
}

function labelFor(type: string): string {
  const map: Record<string, string> = {
    request_created: "Signing request created",
    wa_sent: "Document delivered via WhatsApp",
    link_opened: "Signing link opened",
    otp_verified: "Identity verified by one-time code",
    signed: "Signature captured and consent given",
    quick_approved: "Approved by WhatsApp reply",
    signed_pdf_delivered: "Signed copy delivered to all parties",
  };
  return map[type] ?? type;
}

function metaSuffix(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if (meta.ip) parts.push(`IP ${meta.ip}`);
  if (meta.channel) parts.push(String(meta.channel));
  return parts.length ? `  (${parts.join(", ")})` : "";
}

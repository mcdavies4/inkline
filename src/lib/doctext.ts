import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Extracts plain text from a PDF for the AI summary. Best-effort, no hard failures. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    // unpdf ships a serverless-safe build of pdfjs that needs no DOM APIs
    // (DOMMatrix/Path2D/canvas), which is what broke pdf-parse and raw pdfjs in
    // Vercel's Node runtime.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: true });
    const raw: unknown = result.text;
    const out = (Array.isArray(raw) ? raw.join("\n") : String(raw ?? "")).trim();
    if (!out) console.error("extractPdfText: no text found (scanned/image PDF?)");
    return out.slice(0, 20000);
  } catch (e) {
    console.error("extractPdfText failed:", e instanceof Error ? e.message : e);
    return "";
  }
}

/** Renders a plain-text document (from a template) into a simple, clean PDF. */
export async function generatePdfFromText(title: string, body: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.13, 0.22);

  let page = doc.addPage([595.28, 841.89]); // A4
  const margin = 56;
  const width = 595.28 - margin * 2;
  let y = 780;

  const drawWrapped = (text: string, size: number, font: typeof helv, gap: number) => {
    const words = text.split(/\s+/);
    let line = "";
    const flush = () => {
      if (!line) return;
      if (y < margin + 40) {
        page = doc.addPage([595.28, 841.89]);
        y = 780;
      }
      page.drawText(line, { x: margin, y, size, font, color: ink });
      y -= size + gap;
      line = "";
    };
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > width) {
        flush();
        line = w;
      } else {
        line = test;
      }
    }
    flush();
  };

  drawWrapped(title, 18, helvBold, 10);
  y -= 12;
  for (const para of body.split("\n")) {
    if (para.trim() === "") {
      y -= 10;
      continue;
    }
    drawWrapped(para, 11, helv, 5);
    y -= 6;
  }

  return doc.save();
}

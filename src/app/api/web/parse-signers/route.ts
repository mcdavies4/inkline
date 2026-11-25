import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";
export const maxDuration = 30;

const EMAIL_RE = /[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]+/;
const MAX = 50;

type Row = string[];
type Signer = { name: string; email: string };

function titleCase(s: string) {
  return s.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Turn a grid of cells into {name,email} rows, tolerant of column order and headers. */
function rowsToSigners(rows: Row[]): Signer[] {
  const clean = rows.map((r) => r.map((c) => (c ?? "").toString().trim()));
  if (clean.length === 0) return [];

  const first = clean[0].map((c) => c.toLowerCase());
  const hasHeader = first.some((c) => /name|email|e-?mail/.test(c));
  let nameCol = 0;
  let emailCol = 1;
  let start = 0;
  if (hasHeader) {
    const ni = first.findIndex((c) => c.includes("name"));
    const ei = first.findIndex((c) => /mail/.test(c));
    if (ni >= 0) nameCol = ni;
    if (ei >= 0) emailCol = ei;
    start = 1;
  }

  const out: Signer[] = [];
  for (let i = start; i < clean.length; i++) {
    const r = clean[i];
    if (!r.some((c) => c)) continue;

    let email = (r[emailCol] ?? "").match(EMAIL_RE)?.[0] ?? "";
    let name = (r[nameCol] ?? "").trim();

    // Columns weren't where we guessed — scan the whole row for an email.
    if (!email) {
      const cellWithEmail = r.find((c) => EMAIL_RE.test(c));
      if (cellWithEmail) {
        email = cellWithEmail.match(EMAIL_RE)![0];
        const rest = r.filter((c) => c && c !== cellWithEmail);
        name = rest.length ? rest.join(" ").trim() : cellWithEmail.replace(EMAIL_RE, "").replace(/[<>()"]/g, "").trim();
      }
    }
    // If the name cell happens to contain the email too, strip it out.
    if (name && EMAIL_RE.test(name)) name = name.replace(EMAIL_RE, "").replace(/[<>()"]/g, "").trim();
    name = name.replace(/^[;,\s]+|[;,\s]+$/g, "").trim();
    if (!name && email) name = titleCase(email.split("@")[0]);
    if (!name && !email) continue;

    out.push({ name: name.slice(0, 120), email: email.toLowerCase().slice(0, 160) });
  }
  return out;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; hyperlink?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text ?? "").join("");
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink != null) return String(v.hyperlink).replace(/^mailto:/i, "");
  }
  return "";
}

async function parseXlsx(buf: Buffer): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Row[] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => vals.push(cellText(cell.value)));
    rows.push(vals);
  });
  return rows;
}

function splitDelim(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === d && !q) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const sample = lines.slice(0, 5).join("\n");
  const n = (re: RegExp) => (sample.match(re) ?? []).length;
  const tabs = n(/\t/g), semis = n(/;/g), commas = n(/,/g);
  const delim = tabs >= commas && tabs >= semis && tabs > 0 ? "\t" : semis > commas ? ";" : ",";
  return lines.map((l) => splitDelim(l, delim));
}

/** POST /api/web/parse-signers (multipart) — returns a parsed signer list from a CSV/Excel file. */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a file upload." }, { status: 400 });
  }
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Please choose a file." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "That file is too large (max 5MB)." }, { status: 400 });

  const name = (file.name || "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  let rows: Row[];
  try {
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xlsm") || file.type.includes("spreadsheetml");
    rows = isExcel ? await parseXlsx(buf) : parseCsv(buf.toString("utf8"));
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file. Use a CSV, or an .xlsx with name and email columns." },
      { status: 400 }
    );
  }

  const all = rowsToSigners(rows);
  if (all.length === 0) {
    return NextResponse.json(
      { error: "No names or emails found. Make sure the file has a name column and an email column." },
      { status: 400 }
    );
  }
  return NextResponse.json({ signers: all.slice(0, MAX), total: all.length, truncated: all.length > MAX, max: MAX });
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Signer = { id: string; name: string };
type FieldType = "signature" | "date" | "initials" | "text";
type Field = {
  id: string;
  type: FieldType;
  page: number;
  x: number; // 0..1
  y: number; // 0..1
  w: number;
  h: number;
  signerId: string | null;
  fillMode: "auto" | "signer";
};

const FIELD_LABEL: Record<FieldType, string> = {
  signature: "Signature",
  date: "Date",
  initials: "Initials",
  text: "Text",
};
const FIELD_SIZE: Record<FieldType, { w: number; h: number }> = {
  signature: { w: 0.28, h: 0.07 },
  date: { w: 0.18, h: 0.045 },
  initials: { w: 0.12, h: 0.05 },
  text: { w: 0.24, h: 0.045 },
};

export default function PlacePage() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<{ filename: string; pdfUrl: string; signers: Signer[]; multiSigner: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [activeType, setActiveType] = useState<FieldType>("signature");
  const [activeSigner, setActiveSigner] = useState<string | null>(null);
  const [pages, setPages] = useState<{ dataUrl: string; ratio: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [rendering, setRendering] = useState(true);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Load metadata
  useEffect(() => {
    fetch(`/api/place/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load the document.");
        setMeta(j);
        setActiveSigner(j.signers[0]?.id ?? null);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  // Render PDF pages to images with pdf.js
  useEffect(() => {
    if (!meta?.pdfUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Worker from CDN matching the version
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ url: meta.pdfUrl }).promise;
        const maxPages = Math.min(doc.numPages, 20);
        const out: { dataUrl: string; ratio: number }[] = [];
        for (let i = 1; i <= maxPages; i++) {
          if (cancelled) return;
          try {
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport }).promise;
            out.push({
              dataUrl: canvas.toDataURL("image/jpeg", 0.8),
              ratio: viewport.height / viewport.width,
            });
            // Show pages as they finish, so page 1 appears immediately and the rest fill in.
            if (!cancelled) {
              setPages([...out]);
              setRendering(false);
            }
          } catch (pageErr) {
            console.error(`Page ${i} render failed:`, pageErr);
            // keep going — one bad page shouldn't hide the others
          }
        }
        if (!cancelled) {
          setRendering(false);
          if (out.length === 0) setError("Couldn't display the document. Please try again.");
        }
      } catch (e) {
        console.error("PDF load failed:", e);
        if (!cancelled) {
          setError("Couldn't load the document. Please try again.");
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta?.pdfUrl]);

  const addField = useCallback(
    (pageIdx: number, xFrac: number, yFrac: number) => {
      const size = FIELD_SIZE[activeType];
      setFields((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          type: activeType,
          page: pageIdx,
          x: Math.max(0, Math.min(1 - size.w, xFrac - size.w / 2)),
          y: Math.max(0, Math.min(1 - size.h, yFrac - size.h / 2)),
          w: size.w,
          h: size.h,
          signerId: activeSigner,
          fillMode: "auto",
        },
      ]);
    },
    [activeType, activeSigner]
  );

  const onPageTap = (pageIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addField(pageIdx, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  const removeField = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id));

  const toggleDateMode = (id: string) =>
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, fillMode: f.fillMode === "auto" ? "signer" : "auto" } : f))
    );

  // Drag handling
  const startDrag = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const f = fields.find((x) => x.id === id);
    if (!f) return;
    dragRef.current = { id, dx: 0, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (pageIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setFields((prev) =>
      prev.map((f) =>
        f.id === dragRef.current!.id
          ? { ...f, page: pageIdx, x: clamp(x - f.w / 2, f.w), y: clamp(y - f.h / 2, f.h) }
          : f
      )
    );
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const save = async () => {
    if (fields.length === 0) {
      setError("Tap on the document to place at least one field first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/place/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fields.map((f) => ({
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            w: f.w,
            h: f.h,
            signerId: f.signerId,
            fillMode: f.fillMode,
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't save. Please try again.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signerColor = (id: string | null) => {
    if (!id || !meta) return "#1f7a5c";
    const idx = meta.signers.findIndex((s) => s.id === id);
    return ["#1f7a5c", "#2f6db5", "#a8562f", "#7a4fb5"][idx % 4];
  };
  const signerName = (id: string | null) =>
    meta?.signers.find((s) => s.id === id)?.name.split(" ")[0] ?? "Anyone";

  if (error && !meta)
    return <main className="wrap"><div className="card center"><p className="err">{error}</p></div></main>;
  if (done)
    return (
      <main className="wrap">
        <div className="card center">
          <div className="tick">✓</div>
          <h1>Fields placed</h1>
          <p className="mute">Your document is on its way to your signers, with the fields exactly where you put them. You can close this page and head back to WhatsApp.</p>
        </div>
      </main>
    );
  if (!meta) return <main className="wrap"><div className="card center"><p className="mute">Loading…</p></div></main>;

  return (
    <main className="place">
      <header className="place-head">
        <span className="l-brand">Inkline</span>
        <span className="place-file">{meta.filename}</span>
      </header>

      <div className="place-hint">Pick a field, then tap where it goes. Drag to fine-tune, tap ✕ to remove.</div>

      {/* Field type picker */}
      <div className="place-toolbar">
        {(Object.keys(FIELD_LABEL) as FieldType[]).map((tp) => (
          <button
            key={tp}
            className={`chip ${activeType === tp ? "chip-on" : ""}`}
            onClick={() => setActiveType(tp)}
          >
            {FIELD_LABEL[tp]}
          </button>
        ))}
      </div>

      {/* Signer picker (multi only) */}
      {meta.multiSigner && (
        <div className="place-signers">
          <span className="place-signers-label">For:</span>
          {meta.signers.map((s) => (
            <button
              key={s.id}
              className={`chip ${activeSigner === s.id ? "chip-on" : ""}`}
              style={activeSigner === s.id ? { background: signerColor(s.id), borderColor: signerColor(s.id) } : {}}
              onClick={() => setActiveSigner(s.id)}
            >
              {s.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {/* Pages */}
      <div className="place-pages">
        {rendering && <p className="mute" style={{ textAlign: "center" }}>Rendering document…</p>}
        {!rendering && pages.length > 0 && (
          <p className="place-pagecount">{pages.length} page{pages.length === 1 ? "" : "s"} — scroll to see all</p>
        )}
        {pages.map((pg, idx) => (
          <div key={idx}>
          <span className="place-pagenum">Page {idx + 1}</span>
          <div
            className="place-page"
            style={{ aspectRatio: `1 / ${pg.ratio}` }}
            onClick={(e) => onPageTap(idx, e)}
            onPointerMove={(e) => onDragMove(idx, e)}
            onPointerUp={endDrag}
          >
            <img src={pg.dataUrl} alt={`Page ${idx + 1}`} draggable={false} />
            {fields
              .filter((f) => f.page === idx)
              .map((f) => (
                <div
                  key={f.id}
                  className="place-field"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.w * 100}%`,
                    height: `${f.h * 100}%`,
                    borderColor: signerColor(f.signerId),
                    color: signerColor(f.signerId),
                  }}
                  onPointerDown={(e) => startDrag(f.id, e)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="place-field-label">
                    {FIELD_LABEL[f.type]}
                    {meta.multiSigner ? ` · ${signerName(f.signerId)}` : ""}
                    {f.type === "date" ? ` · ${f.fillMode === "auto" ? "auto" : "signer"}` : ""}
                  </span>
                  {f.type === "date" && (
                    <button className="place-field-mode" onClick={(e) => { e.stopPropagation(); toggleDateMode(f.id); }}>
                      ⇄
                    </button>
                  )}
                  <button className="place-field-x" onClick={(e) => { e.stopPropagation(); removeField(f.id); }}>✕</button>
                </div>
              ))}
          </div>
          </div>
        ))}
      </div>

      <div className="place-footer">
        <span className="place-count">{fields.length} field{fields.length === 1 ? "" : "s"} placed</span>
        {error && <span className="err">{error}</span>}
        <button className="primary" onClick={save} disabled={busy || fields.length === 0}>
          {busy ? "Saving…" : "Done — send to signers"}
        </button>
      </div>
    </main>
  );
}

function clamp(v: number, size: number): number {
  return Math.max(0, Math.min(1 - size, v));
}

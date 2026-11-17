"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import SignatureField from "./SignatureField";
import TelegramSignFix from "./TelegramSignFix";

type Props = {
  token: string;
  signerName: string;
  senderName: string;
  filename: string;
  pdfUrl: string;
  summary: string | null;
  message: string | null;
  onDone: (downloadUrl: string | null) => void;
  onWaiting: () => void;
};

const BOX_W = 0.3; // signature box size as a fraction of the page
const BOX_H = 0.08;

export default function TapToSign(props: Props) {
  const [pages, setPages] = useState<{ dataUrl: string; ratio: number }[]>([]);
  const [rendering, setRendering] = useState(true);
  const [renderFailed, setRenderFailed] = useState(false);
  const [spot, setSpot] = useState<{ page: number; x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{ kind: "move" | "resize"; startX: number; startY: number; rect: DOMRect; base: { x: number; y: number; w: number; h: number } } | null>(null);
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "place" = pick a spot on the page; "bottom" = fallback pad at the foot.
  const [mode, setMode] = useState<"place" | "bottom">("place");
  const padRef = useRef<HTMLDivElement>(null);

  // Render the PDF to images so the signer can tap where to sign.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ url: props.pdfUrl }).promise;
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
            out.push({ dataUrl: canvas.toDataURL("image/jpeg", 0.8), ratio: viewport.height / viewport.width });
            if (!cancelled) { setPages([...out]); setRendering(false); }
          } catch (e) {
            console.error(`Page ${i} render failed:`, e);
          }
        }
        if (!cancelled) {
          setRendering(false);
          if (out.length === 0) { setRenderFailed(true); setMode("bottom"); }
        }
      } catch {
        if (!cancelled) { setRenderFailed(true); setMode("bottom"); setRendering(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [props.pdfUrl]);

  const tapPage = (idx: number, e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    const w = spot?.w ?? BOX_W;
    const h = spot?.h ?? BOX_H;
    const x = Math.max(0, Math.min(1 - w, cx - w / 2));
    const y = Math.max(0, Math.min(1 - h, cy - h / 2));
    setSpot({ page: idx, x, y, w, h });
    // Bring the signature pad into view so they can draw next.
    setTimeout(() => padRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const onDragMove = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    setSpot((prev) => {
      if (!prev) return prev;
      if (d.kind === "move") {
        return { ...prev, x: clamp(d.base.x + dx, 0, 1 - prev.w), y: clamp(d.base.y + dy, 0, 1 - prev.h) };
      }
      return { ...prev, w: clamp(d.base.w + dx, 0.08, 1 - prev.x), h: clamp(d.base.h + dy, 0.03, 1 - prev.y) };
    });
  };
  const onDragEnd = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  };
  const startDrag = (kind: "move" | "resize", e: ReactPointerEvent<HTMLDivElement>) => {
    if (!spot) return;
    e.stopPropagation();
    e.preventDefault();
    const pageEl = (e.currentTarget as HTMLElement).closest(".place-page");
    if (!pageEl) return;
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, rect: pageEl.getBoundingClientRect(), base: { x: spot.x, y: spot.y, w: spot.w, h: spot.h } };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  };

  const canSubmit =
    !!signaturePng && consent && !busy && (mode === "bottom" || !!spot);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "place" && spot
          ? { placedSignature: { page: spot.page, x: spot.x, y: spot.y, w: spot.w, h: spot.h, png: signaturePng } }
          : { signaturePng };
      const r = await fetch(`/api/sign/${props.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Signing failed. Please try again.");
      if (j.status === "waiting_others") props.onWaiting();
      else props.onDone(j.signedPdfUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap">
      <header className="brand">Inkline</header>
      <TelegramSignFix />

      <div className="card">
        <p className="eyebrow">{props.senderName} asks you to sign</p>
        <h1>{props.filename}</h1>
        {props.message && <p className="note">&quot;{props.message}&quot;</p>}
        {mode === "place" && !renderFailed && (
          <p className="mute" style={{ fontSize: 13, marginTop: 8 }}>
            Tap the document where your signature should go, then draw it below. {spot ? "Tap again to move it." : ""}
          </p>
        )}
      </div>

      {props.summary && (
        <div className="card summary">
          <p className="eyebrow">In plain English</p>
          <div className="summary-body">{props.summary.split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>
          <p className="summary-fine">An automated summary to help you understand the document. Not legal advice — read the full document above.</p>
        </div>
      )}

      {mode === "place" && (
        <div className="place-pages">
          {rendering && <p className="mute" style={{ textAlign: "center" }}>Loading document…</p>}
          {pages.map((pg, idx) => (
            <div
              key={idx}
              className="place-page"
              style={{ aspectRatio: `1 / ${pg.ratio}`, cursor: "crosshair" }}
              onClick={(e) => tapPage(idx, e)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pg.dataUrl} alt={`Page ${idx + 1}`} draggable={false} />
              {spot && spot.page === idx && (
                <div
                  className="sign-spot"
                  style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%` }}
                  onPointerDown={(e) => startDrag("move", e)}
                >
                  {signaturePng ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signaturePng} alt="" style={{ maxWidth: "100%", maxHeight: "100%", pointerEvents: "none" }} />
                  ) : (
                    <span className="fill-label">Sign here · drag to move</span>
                  )}
                  <div className="sign-spot-handle" onPointerDown={(e) => startDrag("resize", e)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card" ref={padRef}>
        <p className="eyebrow">
          {mode === "place" ? (spot ? "Draw your signature" : "First, tap where to sign above") : "Sign with your finger"}
        </p>
        <SignatureField onChange={setSignaturePng} height={200} penColor="#1a2238" />

        <div className="sigline" style={{ marginTop: 4 }}>
          <span className="x">✕</span>
          <span className="who">{props.signerName}</span>
        </div>

        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I am {props.signerName} and I agree that my electronic signature is the legal equivalent of my handwritten signature.</span>
        </label>

        {error && <p className="err">{error}</p>}

        <button className="primary" onClick={submit} disabled={!canSubmit}>
          {busy ? "Sealing your document…" : "Sign document"}
        </button>

        {mode === "place" && !renderFailed && (
          <button className="ghost" onClick={() => { setMode("bottom"); setSpot(null); }}>
            Can&apos;t place it? Sign at the bottom instead
          </button>
        )}
        {mode === "bottom" && !renderFailed && (
          <button className="ghost" onClick={() => setMode("place")}>
            ← Place my signature on the page instead
          </button>
        )}
      </div>

      <footer className="foot">
        Signed copies delivered to all parties · legally recognised e-signatures
        <br />
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </footer>
    </main>
  );
}

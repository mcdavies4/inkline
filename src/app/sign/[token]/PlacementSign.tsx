"use client";

import { useEffect, useState } from "react";
import SignatureField from "./SignatureField";

type Field = {
  id: string;
  type: "signature" | "date" | "initials" | "text";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fillMode: "auto" | "signer";
};

type Props = {
  token: string;
  signerName: string;
  senderName: string;
  filename: string;
  pdfUrl: string;
  fields: Field[];
  summary: string | null;
  onDone: (downloadUrl: string | null) => void;
  onWaiting: () => void;
};

export default function PlacementSign(props: Props) {
  const [pages, setPages] = useState<{ dataUrl: string; ratio: number }[]>([]);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, { value?: string; png?: string }>>({});
  const [activeField, setActiveField] = useState<Field | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Render PDF pages
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
            if (!cancelled) {
              setPages([...out]);
              setRendering(false);
            }
          } catch (pageErr) {
            console.error(`Page ${i} render failed:`, pageErr);
          }
        }
        if (!cancelled) {
          setRendering(false);
          if (out.length === 0) setError("Couldn't display the document.");
        }
      } catch {
        if (!cancelled) {
          setError("Couldn't display the document.");
          setRendering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.pdfUrl]);

  // Auto-fill date fields set to 'auto'
  useEffect(() => {
    const auto: Record<string, { value: string }> = {};
    for (const f of props.fields) {
      if (f.type === "date" && f.fillMode === "auto") {
        auto[f.id] = { value: new Date().toISOString().slice(0, 10) };
      }
    }
    if (Object.keys(auto).length) setValues((v) => ({ ...auto, ...v }));
  }, [props.fields]);

  const isFilled = (f: Field) => {
    if (f.type === "date" && f.fillMode === "auto") return true;
    const v = values[f.id];
    return !!(v && (v.value || v.png));
  };
  const allFilled = props.fields.every(isFilled);

  const submit = async () => {
    if (!allFilled || !consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fieldValues = props.fields.map((f) => ({
        id: f.id,
        value: values[f.id]?.value,
        png: values[f.id]?.png,
      }));
      const r = await fetch(`/api/sign/${props.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldValues }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Signing failed.");
      if (j.status === "waiting_others") props.onWaiting();
      else props.onDone(j.signedPdfUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed.");
    } finally {
      setBusy(false);
    }
  };

  const fieldColor = "#1f7a5c";

  return (
    <main className="wrap">
      <header className="brand">Inkline</header>
      <div className="card">
        <p className="eyebrow">{props.senderName} asks you to sign</p>
        <h1>{props.filename}</h1>
        <p className="mute" style={{ fontSize: 13, marginTop: 8 }}>
          Tap each highlighted box to fill it. {props.fields.length} field{props.fields.length === 1 ? "" : "s"} for you.
        </p>
      </div>

      {props.summary && (
        <div className="card summary">
          <p className="eyebrow">In plain English</p>
          <div className="summary-body">{props.summary.split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>
        </div>
      )}

      <div className="place-pages">
        {rendering && <p className="mute" style={{ textAlign: "center" }}>Loading document…</p>}
        {error && <p className="err">{error}</p>}
        {pages.map((pg, idx) => (
          <div key={idx} className="place-page" style={{ aspectRatio: `1 / ${pg.ratio}`, cursor: "default" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pg.dataUrl} alt={`Page ${idx + 1}`} draggable={false} />
            {props.fields
              .filter((f) => f.page === idx)
              .map((f) => {
                const filled = isFilled(f);
                const v = values[f.id];
                return (
                  <button
                    key={f.id}
                    className="fill-field"
                    style={{
                      left: `${f.x * 100}%`,
                      top: `${f.y * 100}%`,
                      width: `${f.w * 100}%`,
                      height: `${f.h * 100}%`,
                      borderColor: fieldColor,
                      background: filled ? "rgba(31,122,92,0.12)" : "rgba(31,122,92,0.04)",
                    }}
                    onClick={() => setActiveField(f)}
                  >
                    {v?.png ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.png} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                    ) : v?.value ? (
                      <span className="fill-val">{v.value}</span>
                    ) : (
                      <span className="fill-label">{f.type === "date" && f.fillMode === "auto" ? "auto" : `Tap: ${f.type}`}</span>
                    )}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <div className="card">
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I am {props.signerName} and I agree that my electronic signature is the legal equivalent of my handwritten signature.</span>
        </label>
        {!allFilled && <p className="mute" style={{ fontSize: 12.5, marginTop: 8 }}>Fill all fields to continue.</p>}
        {error && <p className="err">{error}</p>}
        <button className="primary" onClick={submit} disabled={!allFilled || !consent || busy}>
          {busy ? "Sealing your document…" : "Complete signing"}
        </button>
      </div>

      {activeField && (
        <FieldModal
          field={activeField}
          onClose={() => setActiveField(null)}
          onSave={(payload) => {
            setValues((prev) => ({ ...prev, [activeField.id]: payload }));
            setActiveField(null);
          }}
        />
      )}
    </main>
  );
}

/** Modal to fill a single field by type. */
function FieldModal({
  field,
  onClose,
  onSave,
}: {
  field: Field;
  onClose: () => void;
  onSave: (payload: { value?: string; png?: string }) => void;
}) {
  const [signaturePng, setSignaturePng] = useState<string | null>(null);
  const [text, setText] = useState("");

  const isDraw = field.type === "signature" || field.type === "initials";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">
          {field.type === "signature" ? "Draw your signature" : field.type === "initials" ? "Draw your initials" : field.type === "date" ? "Enter the date" : "Enter text"}
        </p>

        {isDraw ? (
          <>
            {/* Smooth pad — replaces the old hand-rolled canvas that felt shaky.
                Returns the same PNG data URL, so onSave is unchanged. */}
            <SignatureField onChange={setSignaturePng} height={160} penColor="#1a2238" />
            <button
              className="primary"
              disabled={!signaturePng}
              onClick={() => onSave({ png: signaturePng! })}
            >
              Add
            </button>
          </>
        ) : (
          <>
            <input
              className="otp-input"
              style={{ fontSize: 18, letterSpacing: "normal", textAlign: "left" }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={field.type === "date" ? "e.g. 2026-07-18" : "Type here"}
            />
            <button className="primary" disabled={!text.trim()} onClick={() => onSave({ value: text.trim() })}>
              Add
            </button>
          </>
        )}
        <button className="ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

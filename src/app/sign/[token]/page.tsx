"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import PlacementSign from "./PlacementSign";

type PlacedField = {
  id: string;
  type: "signature" | "date" | "initials" | "text";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fillMode: "auto" | "signer";
};

type SignData = {
  status: string;
  signerName: string;
  senderName: string;
  message: string | null;
  filename: string;
  pdfUrl: string | null;
  requireOtp: boolean;
  summary: string | null;
  signedPdfUrl?: string | null;
  hasPlacement?: boolean;
  fields?: PlacedField[];
};

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
        setData(j);
        if (j.status === "signed") {
          setDone(true);
          setDownloadUrl(j.signedPdfUrl ?? null);
        } else if (j.status === "waiting_others") {
          setWaiting(true);
        }
        if (!j.requireOtp) setOtpVerified(true);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const canSign = data && !data.requireOtp || otpVerified;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || done || waiting || !canSign) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a2238";

    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      drawing.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setHasInk(true);
    };
    const up = () => (drawing.current = false);

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [data, done, waiting, canSign]);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const verifyOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otpInput.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "That code isn't right.");
      setOtpVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code isn't right.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!canvasRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signaturePng: canvasRef.current.toDataURL("image/png") }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Signing failed. Please try again.");
      if (j.status === "waiting_others") {
        setWaiting(true);
      } else {
        setDownloadUrl(j.signedPdfUrl ?? null);
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data)
    return <main className="wrap"><div className="card center"><p className="err">{error}</p></div></main>;
  if (!data)
    return <main className="wrap"><div className="card center"><p className="mute">Loading your document…</p></div></main>;

  if (done)
    return (
      <main className="wrap">
        <div className="card center">
          <div className="tick">✓</div>
          <h1>Signed and sealed</h1>
          <p className="mute">Your signed copy of <strong>{data.filename}</strong> is on its way to your WhatsApp, certificate included.</p>
          {downloadUrl && <a className="doclink" href={downloadUrl} target="_blank" rel="noreferrer">Download your signed copy ↗</a>}
        </div>
      </main>
    );

  if (waiting)
    return (
      <main className="wrap">
        <div className="card center">
          <div className="tick">✓</div>
          <h1>Your part is done</h1>
          <p className="mute">Thanks {data.signerName.split(" ")[0]} — this document is now waiting on the other signers. Everyone gets the final copy once it's complete.</p>
        </div>
      </main>
    );

  // Placement mode: signer fills fields at exact positions (after OTP if required)
  if (data.hasPlacement && data.fields && data.fields.length > 0 && data.pdfUrl && (!data.requireOtp || otpVerified)) {
    return (
      <PlacementSign
        token={token}
        signerName={data.signerName}
        senderName={data.senderName}
        filename={data.filename}
        pdfUrl={data.pdfUrl}
        fields={data.fields}
        summary={data.summary}
        onDone={(url) => {
          setDownloadUrl(url);
          setDone(true);
        }}
        onWaiting={() => setWaiting(true)}
      />
    );
  }

  return (
    <main className="wrap">
      <header className="brand">Inkline</header>

      <div className="card">
        <p className="eyebrow">{data.senderName} asks you to sign</p>
        <h1>{data.filename}</h1>
        {data.message && <p className="note">"{data.message}"</p>}
        {data.pdfUrl && <a className="doclink" href={data.pdfUrl} target="_blank" rel="noreferrer">Read the document ↗</a>}
      </div>

      {data.summary && (
        <div className="card summary">
          <p className="eyebrow">In plain English</p>
          <div className="summary-body">{data.summary.split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>
          <p className="summary-fine">An automated summary to help you understand the document. Not legal advice — read the full document above.</p>
        </div>
      )}

      {data.requireOtp && !otpVerified ? (
        <div className="card">
          <p className="eyebrow">Verify it's you</p>
          <p className="mute" style={{ marginBottom: 12 }}>Enter the 6-digit code we sent to your WhatsApp.</p>
          <input
            className="otp-input"
            inputMode="numeric"
            maxLength={6}
            value={otpInput}
            onChange={(e) => setOtpInput(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="______"
          />
          {error && <p className="err">{error}</p>}
          <button className="primary" onClick={verifyOtp} disabled={otpInput.length !== 6 || busy}>
            {busy ? "Checking…" : "Verify"}
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="eyebrow">Sign with your finger</p>
          <div className="sigbox">
            <canvas ref={canvasRef} className="sigcanvas" />
            <div className="sigline">
              <span className="x">✕</span>
              <span className="who">{data.signerName}</span>
            </div>
          </div>
          <button className="ghost" onClick={clear} disabled={!hasInk}>Start again</button>

          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I am {data.signerName} and I agree that my electronic signature is the legal equivalent of my handwritten signature.</span>
          </label>

          {error && <p className="err">{error}</p>}

          <button className="primary" onClick={submit} disabled={!hasInk || !consent || busy}>
            {busy ? "Sealing your document…" : "Sign document"}
          </button>
        </div>
      )}

      <footer className="foot">
        Verified via WhatsApp · Signed copies delivered to all parties · eIDAS-recognised
        <br />
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </footer>
    </main>
  );
}

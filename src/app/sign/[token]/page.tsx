"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PlacementSign from "./PlacementSign";
import SignatureField from "./SignatureField";
import TelegramSignFix from "./TelegramSignFix";

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
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  // Smooth signature pad gives us a PNG data URL (or null when cleared).
  const [signaturePng, setSignaturePng] = useState<string | null>(null);

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
    if (!signaturePng || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signaturePng }),
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
          <p className="mute">Your signed copy of <strong>{data.filename}</strong> is on its way to your Telegram, certificate included.</p>
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
      <TelegramSignFix />

      <div className="card">
        <p className="eyebrow">{data.senderName} asks you to sign</p>
        <h1>{data.filename}</h1>
        {data.message && <p className="note">&quot;{data.message}&quot;</p>}
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
          <p className="eyebrow">Verify it&apos;s you</p>
          <p className="mute" style={{ marginBottom: 12 }}>Enter the 6-digit code we sent you on Telegram.</p>
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

          {/* Smooth signature pad — replaces the old hand-rolled canvas.
              Returns the same PNG data URL the old canvas.toDataURL() gave. */}
          <SignatureField onChange={setSignaturePng} height={220} penColor="#1a2238" />

          <div className="sigline" style={{ marginTop: 4 }}>
            <span className="x">✕</span>
            <span className="who">{data.signerName}</span>
          </div>

          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I am {data.signerName} and I agree that my electronic signature is the legal equivalent of my handwritten signature.</span>
          </label>

          {error && <p className="err">{error}</p>}

          <button className="primary" onClick={submit} disabled={!signaturePng || !consent || busy}>
            {busy ? "Sealing your document…" : "Sign document"}
          </button>
        </div>
      )}

      <footer className="foot">
        Signed copies delivered to all parties · eIDAS-recognised
        <br />
        <a href="/terms" target="_blank" rel="noreferrer">Terms</a> · <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
      </footer>
    </main>
  );
}

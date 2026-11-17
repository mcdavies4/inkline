"use client";

import { useRef, useState } from "react";

type Signer = { name: string; email: string };
type SentSigner = { name: string; email: string | null; signUrl: string; emailed: boolean };

export default function WebSendPage() {
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState<Signer[]>([{ name: "", email: "" }]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ filename: string; signers: SentSigner[] } | null>(null);
  const [checkout, setCheckout] = useState<{ url: string | null; price: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const setSigner = (i: number, patch: Partial<Signer>) =>
    setSigners((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSigner = () => setSigners((prev) => (prev.length < 10 ? [...prev, { name: "", email: "" }] : prev));
  const removeSigner = (i: number) => setSigners((prev) => prev.filter((_, j) => j !== i));

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
    } catch {
      /* clipboard unavailable — the link is visible to select manually */
    }
  };

  const submit = async () => {
    if (busy) return;
    setError(null);
    setCheckout(null);
    const cleanSigners = signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })).filter((s) => s.name);
    if (!senderName.trim()) return setError("Please add your name.");
    if (!senderEmail.trim()) return setError("Please add your email so we can send you the signed copy.");
    if (!file) return setError("Please attach a PDF.");
    if (cleanSigners.length === 0) return setError("Add at least one signer.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("sender_name", senderName.trim());
      fd.set("sender_email", senderEmail.trim());
      if (message.trim()) fd.set("message", message.trim());
      fd.set("signers", JSON.stringify(cleanSigners));
      fd.set("file", file);

      const r = await fetch("/api/web/send", { method: "POST", body: fd });
      const j = await r.json();
      if (r.status === 402 && j.needsSubscription) {
        setCheckout({ url: j.checkoutUrl ?? null, price: j.priceLabel ?? "₦5,000/month" });
        return;
      }
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      setSent({ filename: j.filename, signers: j.signers ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Trial-ended / subscribe screen ----
  if (checkout) {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <div className="card center">
          <p className="eyebrow">Your free trial has ended</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>Keep sending with Inkline Unlimited</h1>
          <p className="mute" style={{ marginBottom: 16 }}>
            Unlimited documents and signers for <strong>{checkout.price}</strong>. Cancel anytime.
          </p>
          {checkout.url ? (
            <a className="primary" style={{ display: "inline-block", textDecoration: "none" }} href={checkout.url}>
              Subscribe — {checkout.price}
            </a>
          ) : (
            <p className="err">Couldn&apos;t open checkout just now. Please try again shortly.</p>
          )}
          <button className="ghost" onClick={() => setCheckout(null)}>← Back</button>
        </div>
      </main>
    );
  }

  // ---- Sent confirmation ----
  if (sent) {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <div className="card">
          <div className="tick">✓</div>
          <h1 style={{ margin: "6px 0 6px", fontSize: 22 }}>On its way</h1>
          <p className="mute" style={{ marginBottom: 4 }}>
            <strong>{sent.filename}</strong> is ready to sign. Everyone gets the certified copy by email once it&apos;s
            signed — and so do you.
          </p>
        </div>

        {sent.signers.map((s, i) => (
          <div className="card" key={i}>
            <p className="eyebrow">{s.name}</p>
            <p className="mute" style={{ margin: "0 0 10px", fontSize: 13 }}>
              {s.emailed ? `Emailed to ${s.email} ✓` : "Share this link so they can sign:"}
            </p>
            <div className="linkrow">
              <input className="field-input mono" readOnly value={s.signUrl} onFocus={(e) => e.currentTarget.select()} />
              <button className="copybtn" onClick={() => copy(s.signUrl, i)}>{copied === i ? "Copied" : "Copy"}</button>
            </div>
            {s.emailed && (
              <p className="mute" style={{ margin: "8px 0 0", fontSize: 12 }}>
                You can also share the link above directly.
              </p>
            )}
          </div>
        ))}

        <button className="ghost" onClick={() => { setSent(null); setFile(null); setSigners([{ name: "", email: "" }]); setMessage(""); if (fileInput.current) fileInput.current.value = ""; }}>
          Send another document
        </button>
        <footer className="foot">Legally recognised e-signatures · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
      </main>
    );
  }

  // ---- Compose form ----
  return (
    <main className="wrap">
      <header className="brand">Inkline</header>

      <div className="card">
        <p className="eyebrow">Send on the web</p>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Get a PDF signed</h1>
        <p className="mute" style={{ fontSize: 14 }}>Upload it, add who needs to sign, and we&apos;ll handle the rest. No app for them to install.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>Your name</label>
          <input className="field-input" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="field">
          <label>Your email</label>
          <input className="field-input" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@company.com" />
          <p className="field-hint">We send your signed copy here.</p>
        </div>
      </div>

      <div className="card">
        <label className="file-drop">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            style={{ display: "none" }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="file-icon">📄</span>
          <span className="file-label">{file ? file.name : "Choose a PDF to sign"}</span>
          <span className="file-sub">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · tap to change` : "PDF, up to 20MB"}</span>
        </label>
      </div>

      <div className="card">
        <p className="eyebrow">Who needs to sign?</p>
        {signers.map((s, i) => (
          <div className="signer-row" key={i}>
            <div className="signer-fields">
              <input className="field-input" value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} placeholder={`Signer ${i + 1} name`} />
              <input className="field-input" type="email" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} placeholder="Email (optional)" />
            </div>
            {signers.length > 1 && (
              <button className="rm" onClick={() => removeSigner(i)} aria-label="Remove signer">✕</button>
            )}
          </div>
        ))}
        {signers.length < 10 && <button className="ghost" onClick={addSigner}>+ Add another signer</button>}
        <p className="field-hint" style={{ marginTop: 10 }}>
          No email? Leave it blank — you&apos;ll get a link to share with them yourself.
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label>Message <span className="opt">(optional)</span></label>
          <textarea className="field-input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A quick note for the signers…" />
        </div>
      </div>

      {error && <p className="err" style={{ margin: 0 }}>{error}</p>}

      <button className="primary" onClick={submit} disabled={busy}>
        {busy ? "Sending…" : "Send for signing"}
      </button>

      <p className="field-hint" style={{ textAlign: "center" }}>Free for 14 days · no card needed</p>
      <footer className="foot">
        Prefer Telegram? <a href="https://t.me/InklineSignbot?start=web" target="_blank" rel="noreferrer">Use the bot ↗</a><br />
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}

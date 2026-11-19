"use client";

import { useEffect, useRef, useState } from "react";

type Signer = { name: string; email: string };
type SentSigner = { name: string; email: string | null; signUrl: string; emailed: boolean };
type Draft = {
  id: string;
  filename: string | null;
  senderName: string | null;
  message: string | null;
  ccEmails: string | null;
  signers: { name?: string; email?: string }[];
  updatedAt: string;
};
type SentDoc = {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
  pendingWithEmail: number;
  signers: { name: string; email: string | null; status: string; signedAt: string | null; token: string; signUrl: string }[];
};

export default function WebSendPage() {
  const [view, setView] = useState<"compose" | "drafts" | "sent">("compose");

  // Compose state
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [cc, setCc] = useState("");
  const [signers, setSigners] = useState<Signer[]>([{ name: "", email: "" }]);
  const [file, setFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [existingFile, setExistingFile] = useState<string | null>(null); // filename of a saved draft's PDF
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ filename: string; signers: SentSigner[] } | null>(null);
  type Plan = { plan: string; label: string; url: string };
  const [checkout, setCheckout] = useState<Plan[] | null>(null);
  // Normalize a 402 body into a list of plans (new `plans` array, or legacy single).
  const plansFrom = (j: { plans?: Plan[]; checkoutUrl?: string | null; priceLabel?: string }): Plan[] => {
    if (Array.isArray(j.plans) && j.plans.length) return j.plans;
    return j.checkoutUrl ? [{ plan: "monthly", label: j.priceLabel ?? "$9/month", url: j.checkoutUrl }] : [];
  };
  const [copied, setCopied] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Remember the sender's email across tabs and visits, so Sent/Drafts don't ask again.
  useEffect(() => {
    try { const e = localStorage.getItem("inkline_email"); if (e) setSenderEmail(e); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    try { if (senderEmail.trim()) localStorage.setItem("inkline_email", senderEmail.trim()); } catch { /* storage unavailable */ }
  }, [senderEmail]);

  // Drafts state
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Sent state
  const [sentDocs, setSentDocs] = useState<SentDoc[] | null>(null);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<{ key: string; text: string } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const setSigner = (i: number, patch: Partial<Signer>) =>
    setSigners((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSigner = () => setSigners((prev) => (prev.length < 10 ? [...prev, { name: "", email: "" }] : prev));
  const removeSigner = (i: number) => setSigners((prev) => prev.filter((_, j) => j !== i));

  const cleanSigners = () => signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })).filter((s) => s.name);

  const resetCompose = () => {
    setSenderName(""); setMessage(""); setCc(""); setSigners([{ name: "", email: "" }]);
    setFile(null); setDraftId(null); setExistingFile(null); setNotice(null); setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
    } catch { /* link is visible to select */ }
  };

  const buildForm = (extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.set("sender_name", senderName.trim());
    fd.set("sender_email", senderEmail.trim());
    if (message.trim()) fd.set("message", message.trim());
    if (cc.trim()) fd.set("cc_emails", cc.trim());
    fd.set("signers", JSON.stringify(cleanSigners()));
    if (file) fd.set("file", file);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    return fd;
  };

  // ---- Save as draft ----
  const saveDraft = async (silent = false) => {
    if (savingDraft) return;
    setError(null); setNotice(null);
    if (!senderEmail.trim()) { setError("Add your email to save a draft."); return false; }
    if (!file && !draftId) { setError("Attach a PDF to save a draft."); return false; }
    setSavingDraft(true);
    try {
      const fd = buildForm(draftId ? { draft_id: draftId } : undefined);
      const r = await fetch("/api/web/draft", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't save the draft.");
      setDraftId(j.id);
      if (j.filename) setExistingFile(j.filename);
      if (!silent) setNotice("Draft saved. You can send it from “Drafts” whenever you're ready.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the draft.");
      return false;
    } finally {
      setSavingDraft(false);
    }
  };

  // ---- Send (new compose, or a loaded draft) ----
  const submit = async () => {
    if (busy) return;
    setError(null); setNotice(null); setCheckout(null);
    if (!senderName.trim()) return setError("Please add your name.");
    if (!senderEmail.trim()) return setError("Please add your email so we can send you the signed copy.");
    if (cleanSigners().length === 0) return setError("Add at least one signer.");
    if (!file && !draftId) return setError("Please attach a PDF.");

    setBusy(true);
    try {
      let r: Response;
      if (draftId) {
        // Persist any edits, then send the draft.
        const ok = await saveDraft(true);
        if (!ok) { setBusy(false); return; }
        r = await fetch(`/api/web/draft/${draftId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: senderEmail.trim().toLowerCase() }),
        });
      } else {
        r = await fetch("/api/web/send", { method: "POST", body: buildForm() });
      }
      const j = await r.json();
      if (r.status === 402 && j.needsSubscription) { setCheckout(plansFrom(j)); return; }
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      setSent({ filename: j.filename, signers: j.signers ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Place fields, then send (sender marks where each signer signs) ----
  const placeThenSend = async () => {
    if (busy) return;
    setError(null); setNotice(null); setCheckout(null);
    if (!senderName.trim()) return setError("Please add your name.");
    if (!senderEmail.trim()) return setError("Please add your email so we can send you the signed copy.");
    if (cleanSigners().length === 0) return setError("Add at least one signer.");
    if (!file) return setError("Please attach a PDF to place fields on.");

    setBusy(true);
    try {
      const r = await fetch("/api/web/send", { method: "POST", body: buildForm({ place_first: "1" }) });
      const j = await r.json();
      if (r.status === 402 && j.needsSubscription) { setCheckout(plansFrom(j)); return; }
      if (!r.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      if (j.placeToken) { window.location.href = `/place/${j.placeToken}`; return; }
      throw new Error("Couldn't open the field editor. Please try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // ---- Drafts list ----
  const loadDrafts = async () => {
    if (!senderEmail.trim()) { setDraftError("Enter your email to see your drafts."); return; }
    setLoadingDrafts(true); setDraftError(null);
    try {
      const r = await fetch(`/api/web/draft?email=${encodeURIComponent(senderEmail.trim().toLowerCase())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't load drafts.");
      setDrafts(j.drafts ?? []);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Couldn't load drafts.");
    } finally {
      setLoadingDrafts(false);
    }
  };

  const editDraft = (d: Draft) => {
    setDraftId(d.id);
    setExistingFile(d.filename);
    setSenderName(d.senderName ?? "");
    setMessage(d.message ?? "");
    setCc(d.ccEmails ?? "");
    const ss = (d.signers ?? []).map((s) => ({ name: s.name ?? "", email: s.email ?? "" }));
    setSigners(ss.length ? ss : [{ name: "", email: "" }]);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
    setNotice(null); setError(null);
    setView("compose");
  };

  const sendDraft = async (d: Draft) => {
    setDraftError(null);
    try {
      const r = await fetch(`/api/web/draft/${d.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: senderEmail.trim().toLowerCase() }),
      });
      const j = await r.json();
      if (r.status === 402 && j.needsSubscription) { setView("compose"); setCheckout(plansFrom(j)); return; }
      if (!r.ok) throw new Error(j.error ?? "Couldn't send the draft.");
      setDrafts((prev) => (prev ?? []).filter((x) => x.id !== d.id));
      setView("compose");
      setSent({ filename: j.filename, signers: j.signers ?? [] });
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "Couldn't send the draft.");
    }
  };

  const deleteDraft = async (d: Draft) => {
    await fetch(`/api/web/draft/${d.id}?email=${encodeURIComponent(senderEmail.trim().toLowerCase())}`, { method: "DELETE" }).catch(() => {});
    setDrafts((prev) => (prev ?? []).filter((x) => x.id !== d.id));
    if (draftId === d.id) resetCompose();
  };

  // ---- Sent documents + resend ----
  const loadSent = async () => {
    if (!senderEmail.trim()) { setSentError("Enter your email to see your sent documents."); return; }
    setLoadingSent(true); setSentError(null); setResendMsg(null);
    try {
      const r = await fetch(`/api/web/sent?email=${encodeURIComponent(senderEmail.trim().toLowerCase())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't load your documents.");
      setSentDocs(j.documents ?? []);
    } catch (e) {
      setSentError(e instanceof Error ? e.message : "Couldn't load your documents.");
    } finally {
      setLoadingSent(false);
    }
  };

  // Remind all pending signers (no token), one signer (token), optionally
  // correcting that signer's email first (newEmail, with token).
  const remind = async (d: SentDoc, token?: string, newEmail?: string) => {
    const key = token ? `${d.id}:${token}` : d.id;
    setResending(key); setResendMsg(null);
    try {
      const r = await fetch(`/api/web/sent/${d.id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: senderEmail.trim().toLowerCase(),
          ...(token ? { token } : {}),
          ...(newEmail ? { newEmail } : {}),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't send the reminder.");
      // Reflect a corrected email in the list and close the editor.
      if (token && newEmail) {
        setSentDocs((prev) => (prev ?? []).map((doc) => {
          if (doc.id !== d.id) return doc;
          const signers = doc.signers.map((s) => (s.token === token ? { ...s, email: newEmail } : s));
          return { ...doc, signers, pendingWithEmail: signers.filter((s) => s.email && s.status !== "signed").length };
        }));
        setEditingKey(null);
      }
      setResendMsg({
        key,
        text: j.sent > 0
          ? (token ? (newEmail ? "Email updated & reminder sent ✓" : "Reminder sent ✓") : `Reminded ${j.sent} signer${j.sent === 1 ? "" : "s"} ✓`)
          : (j.note ?? "Nothing to remind."),
      });
    } catch (e) {
      setResendMsg({ key, text: e instanceof Error ? e.message : "Couldn't send the reminder." });
    } finally {
      setResending(null);
    }
  };

  // Navigation: when you open Sent or Drafts and we already know your email, load automatically.
  useEffect(() => {
    if (view === "sent" && senderEmail.trim() && sentDocs === null && !loadingSent) loadSent();
    if (view === "drafts" && senderEmail.trim() && drafts === null && !loadingDrafts) loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ============ Trial-ended / subscribe ============
  if (checkout) {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <div className="card center">
          <p className="eyebrow">Your free trial has ended</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>Keep sending with Inkline Unlimited</h1>
          <p className="mute" style={{ marginBottom: 16 }}>
            Unlimited documents and signers. Cancel anytime.
          </p>
          {checkout.length ? (
            checkout.map((p) => (
              <a
                key={p.plan}
                className={p.plan === "annual" ? "ghost" : "primary"}
                style={{ display: "block", textDecoration: "none", marginTop: 10 }}
                href={p.url}
              >
                {p.plan === "annual" ? "Pay yearly" : "Subscribe"} — {p.label}
              </a>
            ))
          ) : <p className="err">Couldn&apos;t open checkout just now. Please try again shortly.</p>}
          <button className="ghost" onClick={() => setCheckout(null)}>← Back</button>
        </div>
      </main>
    );
  }

  // ============ Sent confirmation ============
  if (sent) {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <div className="card">
          <div className="tick">✓</div>
          <h1 style={{ margin: "6px 0 6px", fontSize: 22 }}>On its way</h1>
          <p className="mute" style={{ marginBottom: 4 }}>
            <strong>{sent.filename}</strong> is ready to sign. Everyone gets the certified copy by email once it&apos;s signed — and so do you.
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
          </div>
        ))}
        <button className="ghost" onClick={() => { setSent(null); resetCompose(); }}>Send another document</button>
        <footer className="foot">Legally recognised e-signatures · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
      </main>
    );
  }

  // ============ Drafts view ============
  if (view === "drafts") {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <Tabs view={view} setView={setView} />
        <div className="card">
          <p className="eyebrow">Your saved drafts</p>
          <div className="field">
            <label>Your email</label>
            <input className="field-input" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <button className="primary" onClick={loadDrafts} disabled={loadingDrafts}>
            {loadingDrafts ? "Loading…" : "Show my drafts"}
          </button>
          {draftError && <p className="err">{draftError}</p>}
        </div>

        {drafts && drafts.length === 0 && (
          <div className="card center"><p className="mute">No drafts saved yet.</p></div>
        )}
        {(drafts ?? []).map((d) => (
          <div className="card" key={d.id}>
            <p className="eyebrow">{d.filename ?? "Untitled document"}</p>
            <p className="mute" style={{ fontSize: 13, margin: "0 0 10px" }}>
              {(d.signers?.length ?? 0)} signer{(d.signers?.length ?? 0) === 1 ? "" : "s"}
              {d.message ? ` · “${d.message.slice(0, 40)}${d.message.length > 40 ? "…" : ""}”` : ""}
              <br />Saved {new Date(d.updatedAt).toLocaleString()}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="copybtn" onClick={() => sendDraft(d)}>Send now</button>
              <button className="copybtn" style={{ background: "transparent", color: "var(--seal)" }} onClick={() => editDraft(d)}>Edit</button>
              <button className="copybtn" style={{ background: "transparent", color: "var(--err)", borderColor: "var(--err)" }} onClick={() => deleteDraft(d)}>Delete</button>
            </div>
          </div>
        ))}
        <footer className="foot"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
      </main>
    );
  }

  // ============ Sent view ============
  if (view === "sent") {
    return (
      <main className="wrap">
        <header className="brand">Inkline</header>
        <Tabs view={view} setView={setView} />
        <div className="card">
          <p className="eyebrow">Your sent documents</p>
          <div className="field">
            <label>Your email</label>
            <input className="field-input" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <button className="primary" onClick={loadSent} disabled={loadingSent}>
            {loadingSent ? "Loading…" : sentDocs ? "Refresh" : "Show my sent documents"}
          </button>
          {sentError && <p className="err">{sentError}</p>}
        </div>

        {sentDocs && sentDocs.length === 0 && (
          <div className="card center"><p className="mute">Nothing sent yet.</p></div>
        )}
        {(sentDocs ?? []).map((d, di) => {
          const signedCount = d.signers.filter((s) => s.status === "signed").length;
          return (
            <div className="card" key={d.id}>
              <p className="eyebrow">{d.filename}</p>
              <p className="mute" style={{ fontSize: 13, margin: "0 0 12px" }}>
                Sent {new Date(d.createdAt).toLocaleDateString()} · <strong style={{ color: signedCount === d.signers.length ? "var(--seal)" : "var(--ink)" }}>{signedCount} of {d.signers.length} signed</strong>
              </p>

              {d.signers.map((s, si) => {
                const done = s.status === "signed";
                const rkey = `${d.id}:${s.token}`;
                const editing = editingKey === rkey;
                return (
                  <div key={si} className="sig-track">
                    <div className="sig-track-head">
                      <span className={`sig-pill ${done ? "ok" : "wait"}`}>{done ? "Signed" : "Awaiting"}</span>
                      <div className="sig-track-who">
                        <strong>{s.name}</strong>
                        {editing ? (
                          <input
                            className="field-input"
                            style={{ marginTop: 5, fontSize: 13, padding: "8px 10px" }}
                            type="email"
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            placeholder="correct@email.com"
                            autoFocus
                          />
                        ) : (
                          <span>{done ? (s.signedAt ? `signed ${new Date(s.signedAt).toLocaleDateString()}` : "signed") : (s.email || "link only — no email")}</span>
                        )}
                      </div>
                      {!done && !editing && s.email && (
                        <button className="copybtn ghost-btn" onClick={() => remind(d, s.token)} disabled={resending === rkey}>
                          {resending === rkey ? "…" : "Remind"}
                        </button>
                      )}
                    </div>

                    {!done && editing && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="copybtn" onClick={() => remind(d, s.token, editVal.trim().toLowerCase())} disabled={resending === rkey || !editVal.trim()}>
                          {resending === rkey ? "Saving…" : "Save & resend"}
                        </button>
                        <button className="copybtn ghost-btn" onClick={() => setEditingKey(null)}>Cancel</button>
                      </div>
                    )}

                    {!done && !editing && (
                      <>
                        <button className="editlink" onClick={() => { setEditingKey(rkey); setEditVal(s.email || ""); setResendMsg(null); }}>
                          {s.email ? "Wrong email? Edit & resend" : "Add an email to send it"}
                        </button>
                        <div className="linkrow" style={{ marginTop: 6 }}>
                          <input className="field-input mono" readOnly value={s.signUrl} onFocus={(e) => e.currentTarget.select()} />
                          <button className="copybtn" onClick={() => copy(s.signUrl, di * 100 + si)}>{copied === di * 100 + si ? "Copied" : "Copy"}</button>
                        </div>
                      </>
                    )}
                    {resendMsg && resendMsg.key === rkey && <p className="mute" style={{ fontSize: 12, color: "var(--seal)", margin: "5px 0 0" }}>{resendMsg.text}</p>}
                  </div>
                );
              })}

              {d.pendingWithEmail > 0 && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                  <button className="copybtn" onClick={() => remind(d)} disabled={resending === d.id}>
                    {resending === d.id ? "Sending…" : `Remind all ${d.pendingWithEmail} pending`}
                  </button>
                  {resendMsg && resendMsg.key === d.id && <span className="mute" style={{ fontSize: 13, color: "var(--seal)" }}>{resendMsg.text}</span>}
                </div>
              )}
            </div>
          );
        })}
        <footer className="foot"><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
      </main>
    );
  }

  // ============ Compose view ============
  return (
    <main className="wrap">
      <header className="brand">Inkline</header>
      <Tabs view={view} setView={setView} />

      <div className="card">
        <p className="eyebrow">{draftId ? "Editing a draft" : "Send on the web"}</p>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Get a PDF signed</h1>
        <p className="mute" style={{ fontSize: 14 }}>Upload it, add who needs to sign, then send now or save it for later.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>Your name</label>
          <input className="field-input" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Jane Doe" />
        </div>
        <div className="field">
          <label>Your email</label>
          <input className="field-input" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@company.com" />
          <p className="field-hint">We send your signed copy here, and your drafts are saved under it.</p>
        </div>
      </div>

      <div className="card">
        <label className="file-drop">
          <input ref={fileInput} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="file-icon">📄</span>
          <span className="file-label">{file ? file.name : existingFile ? existingFile : "Choose a PDF to sign"}</span>
          <span className="file-sub">
            {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · tap to change`
              : existingFile ? "Saved with this draft · tap to replace"
              : "PDF, up to 20MB"}
          </span>
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
            {signers.length > 1 && <button className="rm" onClick={() => removeSigner(i)} aria-label="Remove signer">✕</button>}
          </div>
        ))}
        {signers.length < 10 && <button className="ghost" onClick={addSigner}>+ Add another signer</button>}
        <p className="field-hint" style={{ marginTop: 10 }}>No email? Leave it blank — you&apos;ll get a link to share with them yourself.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>Message <span className="opt">(optional)</span></label>
          <textarea className="field-input" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A quick note for the signers…" />
        </div>
        <div className="field">
          <label>Also email the signed copy to <span className="opt">(optional)</span></label>
          <textarea className="field-input" rows={2} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="colleague@company.com, archive@company.com" />
          <p className="field-hint">Extra people who should get the finished document but don&apos;t need to sign. Separate with commas.</p>
        </div>
      </div>

      {notice && <p className="mute" style={{ margin: 0, color: "var(--seal)" }}>{notice}</p>}
      {error && <p className="err" style={{ margin: 0 }}>{error}</p>}

      {file && !draftId ? (
        <>
          <button className="primary" onClick={placeThenSend} disabled={busy || savingDraft}>
            {busy ? "Opening…" : "Choose where they sign →"}
          </button>
          <p className="field-hint" style={{ textAlign: "center", margin: "0 0 2px" }}>
            Mark the exact spot each person signs — they just tap it. Recommended.
          </p>
          <button className="ghost" onClick={submit} disabled={busy || savingDraft}>
            Or just send — signer picks the spot
          </button>
        </>
      ) : (
        <button className="primary" onClick={submit} disabled={busy || savingDraft}>
          {busy ? "Sending…" : "Send for signing"}
        </button>
      )}
      <button className="ghost" onClick={() => saveDraft(false)} disabled={busy || savingDraft}>
        {savingDraft ? "Saving…" : draftId ? "Update draft" : "Save as draft"}
      </button>

      <p className="field-hint" style={{ textAlign: "center" }}>Free for 7 days · no card needed</p>
      <footer className="foot">
        Prefer Telegram? <a href="https://t.me/InklineSignbot?start=web" target="_blank" rel="noreferrer">Use the bot ↗</a><br />
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
      </footer>
    </main>
  );
}

function Tabs({ view, setView }: { view: "compose" | "drafts" | "sent"; setView: (v: "compose" | "drafts" | "sent") => void }) {
  return (
    <div className="app-tabs">
      <button className={view === "compose" ? "active" : ""} onClick={() => setView("compose")}>New</button>
      <button className={view === "sent" ? "active" : ""} onClick={() => setView("sent")}>Sent</button>
      <button className={view === "drafts" ? "active" : ""} onClick={() => setView("drafts")}>Drafts</button>
    </div>
  );
}

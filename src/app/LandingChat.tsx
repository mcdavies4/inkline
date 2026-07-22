"use client";

import { useEffect, useRef, useState } from "react";

type Bubble =
  | { who: "them"; kind: "doc"; label: string }
  | { who: "them"; kind: "text"; text: string }
  | { who: "bot"; kind: "text"; text: string }
  | { who: "bot"; kind: "doc-signed"; label: string; note: string };

const THREAD: Bubble[] = [
  { who: "them", kind: "doc", label: "tenancy-agreement.pdf" },
  { who: "bot", kind: "text", text: "Got it ✓ Who's signing?" },
  { who: "them", kind: "text", text: "James Carter, +44 7700 …" },
  { who: "bot", kind: "text", text: "Sent. James is signing now — no app, no account." },
  { who: "bot", kind: "doc-signed", label: "tenancy-agreement · signed.pdf", note: "James signed. Certificate attached." },
];

export default function LandingChat({ waLink }: { waLink: string }) {
  return (
    <div className="lp">
      <Nav waLink={waLink} />
      <Hero waLink={waLink} />
      <Marquee />
      <Steps />
      <Proof />
      <Who />
      <Pricing waLink={waLink} />
      <Foot waLink={waLink} />
    </div>
  );
}

function Nav({ waLink }: { waLink: string }) {
  return (
    <nav className="lp-nav">
      <span className="lp-logo">Inkline<span className="lp-logo-dot" /></span>
      <a className="lp-btn lp-btn-sm" href={waLink}>Open in WhatsApp</a>
    </nav>
  );
}

function Hero({ waLink }: { waLink: string }) {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (shown >= THREAD.length) return;
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      setShown((s) => s + 1);
    }, 640 + Math.random() * 360);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  return (
    <header className="lp-hero">
      <div className="lp-hero-copy">
        <p className="lp-kick">e-signatures, over WhatsApp</p>
        <h1 className="lp-h1">
          Get it <span className="lp-mark">signed</span><br />
          without leaving<br />the chat.
        </h1>
        <p className="lp-lede">
          Send a PDF to Inkline. It comes back signed &mdash; real signature, certificate and all
          &mdash; in about 20 seconds. No app. No account. No &ldquo;please find attached.&rdquo;
        </p>
        <div className="lp-cta-row">
          <a className="lp-btn lp-btn-lg" href={waLink}>Sign something now &rarr;</a>
          <span className="lp-cta-note">3 free &middot; no card</span>
        </div>
      </div>

      <div className="lp-phone" aria-hidden="true">
        <div className="lp-phone-top">
          <span className="lp-phone-dot" />
          <span className="lp-phone-name">Inkline</span>
          <span className="lp-phone-status">online</span>
        </div>
        <div className="lp-thread" ref={ref}>
          {THREAD.slice(0, shown).map((b, i) => <BubbleView key={i} b={b} />)}
          {typing && shown < THREAD.length && (
            <div className={`lp-row ${THREAD[shown].who === "bot" ? "left" : "right"}`}>
              <div className={`lp-bubble ${THREAD[shown].who} lp-typing`}><span /><span /><span /></div>
            </div>
          )}
        </div>
        <div className="lp-phone-bar"><span>Message</span></div>
      </div>
    </header>
  );
}

function BubbleView({ b }: { b: Bubble }) {
  const side = b.who === "bot" ? "left" : "right";
  return (
    <div className={`lp-row ${side}`}>
      <div className={`lp-bubble ${b.who}`}>
        {b.kind === "doc" && (
          <span className="lp-chip"><span className="lp-chip-ic">PDF</span>{b.label}</span>
        )}
        {b.kind === "text" && <span>{b.text}</span>}
        {b.kind === "doc-signed" && (
          <>
            <span className="lp-chip lp-chip-signed"><span className="lp-chip-ic">✓</span>{b.label}</span>
            <span className="lp-bubble-note">{b.note}</span>
          </>
        )}
        <span className="lp-time">now {b.who === "them" && <span className="lp-ticks">✓✓</span>}</span>
      </div>
    </div>
  );
}

function Marquee() {
  const items = ["tenancy agreements", "NDAs", "invoices", "contractor sign-offs", "consent forms", "quotes", "offer letters", "waivers"];
  return (
    <div className="lp-marquee" aria-hidden="true">
      <div className="lp-marquee-track">
        {[...items, ...items].map((x, i) => (
          <span key={i} className="lp-marquee-item">{x} <span className="lp-marquee-sep">✕—</span></span>
        ))}
      </div>
    </div>
  );
}

function Steps() {
  const steps = [
    { n: "Send", t: "Forward any PDF to Inkline and say who signs — a name and a number. That's the whole setup." },
    { n: "Sign", t: "They tap one button and sign with a finger, right on their phone. Nothing to download, no account to make." },
    { n: "Sealed", t: "Both sides get the signed PDF back in chat, with a certificate showing who signed, when, and a tamper-evident fingerprint." },
  ];
  return (
    <section className="lp-sec lp-steps">
      <h2 className="lp-h2">Three messages. Done.</h2>
      <div className="lp-steps-grid">
        {steps.map((s, i) => (
          <div className="lp-step" key={i}>
            <span className="lp-step-tag">{s.n}</span>
            <p>{s.t}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Proof() {
  return (
    <section className="lp-sec lp-proof">
      <div className="lp-proof-copy">
        <h2 className="lp-h2">Not a squiggle. Proof.</h2>
        <p>
          Every signed document carries a certificate. The signer is verified by their WhatsApp
          number &mdash; harder to fake than an email link &mdash; and the full trail is recorded:
          sent, opened, signed, delivered. Simple electronic signatures like these are recognised in
          the UK and EU under eIDAS.
        </p>
      </div>
      <div className="lp-cert">
        <div className="lp-cert-head">Certificate of signing</div>
        <dl>
          <div><dt>Signer</dt><dd>James Carter</dd></div>
          <div><dt>Verified</dt><dd>+44 7700 &bull;&bull;&bull;&bull;&bull;&bull;</dd></div>
          <div><dt>Signed</dt><dd className="mono">2026-07-19 09:41 UTC</dd></div>
          <div><dt>Fingerprint</dt><dd className="mono">9f2ab4&hellip;e07c1d</dd></div>
        </dl>
        <div className="lp-cert-trail">sent &rarr; opened &rarr; signed &rarr; returned</div>
      </div>
    </section>
  );
}

function Who() {
  return (
    <section className="lp-sec lp-who">
      <h2 className="lp-h2">If your office is a <span className="lp-mark2">chat thread</span>, this is your e-signature.</h2>
      <p>
        Landlords closing tenancies the same afternoon. Freelancers who'd rather not chase email.
        Agents whose clients live in WhatsApp. Small businesses closing deals across borders, where
        a signature used to mean print, sign, scan, resend &mdash; and now means three messages.
      </p>
    </section>
  );
}

function Pricing({ waLink }: { waLink: string }) {
  return (
    <section className="lp-sec lp-price">
      <h2 className="lp-h2">One price. Unlimited signing.</h2>
      <div className="lp-price-cards">
        <div className="lp-pc">
          <span className="lp-pc-tier">Free</span>
          <span className="lp-pc-amt">$0</span>
          <span className="lp-pc-sub">first 3 documents</span>
          <ul><li>Multiple signers</li><li>Signed copy + certificate</li><li>No card needed</li></ul>
        </div>
        <div className="lp-pc lp-pc-hot">
          <span className="lp-pc-flag">most pick this</span>
          <span className="lp-pc-tier">Monthly</span>
          <span className="lp-pc-amt">$9<i>/mo</i></span>
          <span className="lp-pc-sub">unlimited, cancel anytime</span>
          <ul><li>Unlimited documents</li><li>Signing order &amp; codes</li><li>Exact field placement</li></ul>
        </div>
        <div className="lp-pc">
          <span className="lp-pc-tier">Annual</span>
          <span className="lp-pc-amt">$90<i>/yr</i></span>
          <span className="lp-pc-sub">two months free</span>
          <ul><li>Everything monthly</li><li>One payment a year</li></ul>
        </div>
      </div>
      <a className="lp-btn lp-btn-lg" href={waLink}>Start with 3 free &rarr;</a>
      <p className="lp-price-fine">Priced in USD. Available worldwide &mdash; pay by card, anywhere.</p>
    </section>
  );
}

function Foot({ waLink }: { waLink: string }) {
  return (
    <footer className="lp-foot">
      <div className="lp-foot-cta">
        <span className="lp-logo">Inkline<span className="lp-logo-dot" /></span>
        <a className="lp-btn lp-btn-lg" href={waLink}>Sign something now &rarr;</a>
      </div>
      <div className="lp-foot-legal">
        <span>The 36th Company Ltd &middot; London</span>
        <span className="lp-foot-links"><a href="mailto:inklinesign@outlook.com">Contact</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span>
      </div>
      <p className="lp-foot-note">
        Questions? <a href="mailto:inklinesign@outlook.com">inklinesign@outlook.com</a><br />
        Electronic signatures recognised under eIDAS &amp; the Electronic Communications Act 2000.
        Not for wills, deeds, or land transfers.
      </p>
    </footer>
  );
}

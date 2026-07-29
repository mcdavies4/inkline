"use client";

import { useEffect, useState } from "react";

const BOT_URL = "https://t.me/InklineSignbot?start=hello";

// The self-typing chat script — the signature element of the page.
const SCRIPT: { who: "them" | "bot"; kind: "text" | "doc" | "doc-signed"; text?: string; label?: string; note?: string }[] = [
  { who: "them", kind: "doc", label: "tenancy-agreement.pdf" },
  { who: "bot", kind: "text", text: "Got it. Who's signing?" },
  { who: "them", kind: "text", text: "James Carter" },
  { who: "bot", kind: "text", text: "Here's the link to send James 👇" },
  { who: "bot", kind: "text", text: "t.me/InklineSignbot?start=sign_x9f2…" },
  { who: "bot", kind: "doc-signed", label: "tenancy-agreement · signed.pdf", note: "James signed. Certificate attached." },
];

export default function LandingChat() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= SCRIPT.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 1100);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <main className="lp">
      <style>{CSS}</style>

      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-logo">
          Inkline<span className="lp-dot" />
        </div>
        <a className="lp-nav-cta" href={BOT_URL} target="_blank" rel="noopener noreferrer">
          Open in Telegram
        </a>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <h1 className="lp-h1">
            Get it <span className="lp-mark">signed</span>
            <br />
            in Telegram.
          </h1>
          <p className="lp-sub">
            Send a PDF. Get it back signed. No app to learn, no account, about twenty seconds.
          </p>
          <div className="lp-cta-row">
            <a className="lp-cta" href={BOT_URL} target="_blank" rel="noopener noreferrer">
              <TelegramGlyph />
              Chat on Telegram
            </a>
            <span className="lp-cta-note">3 free documents · no card needed</span>
          </div>
        </div>

        {/* self-typing chat */}
        <div className="lp-phone" aria-hidden="true">
          <div className="lp-phone-head">
            <div className="lp-avatar">
              Inkline<span className="lp-dot lp-dot-sm" />
            </div>
            <span className="lp-online">bot</span>
          </div>
          <div className="lp-thread">
            {SCRIPT.slice(0, shown).map((m, i) => (
              <Bubble key={i} m={m} />
            ))}
            {shown < SCRIPT.length && <div className="lp-typing"><span /><span /><span /></div>}
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="lp-how">
        <div className="lp-step">
          <div className="lp-step-n">1</div>
          <h3>Send a PDF</h3>
          <p>Forward any document to the Inkline bot on Telegram.</p>
        </div>
        <div className="lp-step">
          <div className="lp-step-n">2</div>
          <h3>Share the link</h3>
          <p>Inkline gives you a link. Send it to whoever needs to sign.</p>
        </div>
        <div className="lp-step">
          <div className="lp-step-n">3</div>
          <h3>Signed &amp; certified</h3>
          <p>They sign on their phone. You both get the certified copy back.</p>
        </div>
      </section>

      {/* WHO */}
      <section className="lp-who">
        <h2 className="lp-h2">For people whose office is a chat thread.</h2>
        <p>
          Landlords, freelancers, small agencies — anyone closing deals across borders, where a
          signature used to mean print, sign, scan, resend, and now means a few messages.
        </p>
      </section>

      {/* PRICING */}
      <section className="lp-price">
        <h2 className="lp-h2">Simple pricing.</h2>
        <div className="lp-price-grid">
          <div className="lp-price-card">
            <div className="lp-price-k">Free</div>
            <div className="lp-price-v">3 documents</div>
            <p>Everything included. No card needed.</p>
          </div>
          <div className="lp-price-card lp-price-card--pro">
            <div className="lp-price-k">Unlimited</div>
            <div className="lp-price-v">$9<span>/mo</span></div>
            <p>Or $90/year. Unlimited documents and signers.</p>
          </div>
        </div>
        <div className="lp-cta-row lp-cta-center">
          <a className="lp-cta" href={BOT_URL} target="_blank" rel="noopener noreferrer">
            <TelegramGlyph />
            Start free on Telegram
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-foot">
        <div className="lp-logo">
          Inkline<span className="lp-dot" />
        </div>
        <div className="lp-foot-links">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="mailto:inklinesign@outlook.com">inklinesign@outlook.com</a>
        </div>
        <p className="lp-foot-fine">© {new Date().getFullYear()} The 36th Company Ltd. e-signatures over Telegram.</p>
      </footer>
    </main>
  );
}

function Bubble({ m }: { m: (typeof SCRIPT)[number] }) {
  const side = m.who === "them" ? "them" : "bot";
  if (m.kind === "doc") {
    return (
      <div className={`lp-b lp-b-${side}`}>
        <div className="lp-file">
          <span className="lp-file-ic">PDF</span>
          <span>{m.label}</span>
        </div>
      </div>
    );
  }
  if (m.kind === "doc-signed") {
    return (
      <div className={`lp-b lp-b-${side}`}>
        <div className="lp-file lp-file-signed">
          <span className="lp-file-ic lp-file-ic-ok">✓</span>
          <span>
            {m.label}
            <em>{m.note}</em>
          </span>
        </div>
      </div>
    );
  }
  return <div className={`lp-b lp-b-${side} lp-b-text`}>{m.text}</div>;
}

function TelegramGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9L17 5.7c.4-.3-.1-.5-.6-.2L6.5 12 1.8 10.5c-1-.3-1-1 .2-1.5l18.6-7.2c.9-.3 1.6.2 1.3 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

const CSS = `
.lp{--ink:#0B1F17;--green:#12E27A;--deep:#075E45;--paper:#F4FFF9;--bubble:#DCF8C6;--flare:#E8FF3A;--tg:#229ED9;
  background:var(--paper);color:var(--ink);font-family:Archivo,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
  overflow-x:hidden;-webkit-font-smoothing:antialiased;}
.lp *{box-sizing:border-box;}
.lp-nav{display:flex;align-items:center;justify-content:space-between;padding:22px 28px;max-width:1120px;margin:0 auto;}
.lp-logo{font-weight:900;font-size:26px;letter-spacing:-1.5px;display:flex;align-items:center;gap:6px;}
.lp-dot{width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block;}
.lp-dot-sm{width:7px;height:7px;}
.lp-nav-cta{background:var(--ink);color:var(--green);text-decoration:none;font-weight:800;font-size:15px;padding:10px 18px;border-radius:40px;}
.lp-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;align-items:center;max-width:1120px;margin:0 auto;padding:40px 28px 60px;}
.lp-h1{font-size:clamp(48px,7vw,96px);font-weight:900;letter-spacing:-4px;line-height:.95;margin:0 0 24px;}
.lp-mark{color:var(--green);position:relative;}
.lp-mark::after{content:"";position:absolute;left:0;right:-4px;bottom:6px;height:10px;background:var(--green);opacity:.25;border-radius:6px;z-index:-1;}
.lp-sub{font-size:clamp(18px,2.2vw,24px);font-weight:500;color:var(--deep);max-width:30ch;margin:0 0 32px;line-height:1.35;}
.lp-cta-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.lp-cta-center{justify-content:center;margin-top:28px;}
.lp-cta{display:inline-flex;align-items:center;gap:10px;background:var(--tg);color:#fff;text-decoration:none;font-weight:800;font-size:19px;padding:16px 28px;border-radius:50px;box-shadow:0 8px 24px rgba(34,158,217,.3);transition:transform .15s;}
.lp-cta:hover{transform:translateY(-2px);}
.lp-cta-note{font-size:14px;color:var(--deep);opacity:.8;font-weight:600;}
.lp-phone{background:var(--ink);border-radius:32px;padding:18px;box-shadow:0 30px 60px rgba(11,31,23,.25);}
.lp-phone-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px 16px;border-bottom:1px solid rgba(255,255,255,.08);}
.lp-avatar{color:var(--paper);font-weight:800;font-size:18px;display:flex;align-items:center;gap:5px;}
.lp-online{color:var(--green);font-size:13px;font-weight:600;}
.lp-thread{display:flex;flex-direction:column;gap:10px;padding:16px 6px 8px;min-height:360px;}
.lp-b{max-width:82%;padding:12px 15px;border-radius:18px;font-size:15px;font-weight:500;line-height:1.35;animation:pop .25s ease;}
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.98);}to{opacity:1;transform:none;}}
.lp-b-them{align-self:flex-end;background:var(--bubble);color:var(--ink);border-bottom-right-radius:6px;}
.lp-b-bot{align-self:flex-start;background:#fff;color:var(--ink);border-bottom-left-radius:6px;}
.lp-b-text{}
.lp-file{display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;}
.lp-file-ic{background:var(--ink);color:#fff;font-size:11px;font-weight:900;padding:6px 8px;border-radius:6px;}
.lp-file-signed{color:var(--ink);}
.lp-file-ic-ok{background:var(--green);color:var(--ink);}
.lp-file-signed em{display:block;font-style:normal;font-weight:500;font-size:12px;color:var(--deep);margin-top:2px;}
.lp-b-bot .lp-file-signed{}
.lp-b .lp-file-signed{}
.lp-b-bot:has(.lp-file-signed){background:var(--green);}
.lp-typing{align-self:flex-start;background:#fff;border-radius:18px;border-bottom-left-radius:6px;padding:14px 16px;display:flex;gap:4px;}
.lp-typing span{width:7px;height:7px;border-radius:50%;background:#bbb;animation:blink 1.2s infinite;}
.lp-typing span:nth-child(2){animation-delay:.2s;}
.lp-typing span:nth-child(3){animation-delay:.4s;}
@keyframes blink{0%,60%,100%{opacity:.3;}30%{opacity:1;}}
.lp-how{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1120px;margin:0 auto;padding:60px 28px;}
.lp-step-n{width:44px;height:44px;border-radius:50%;background:var(--green);color:var(--ink);font-weight:900;font-size:20px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
.lp-step h3{font-size:22px;font-weight:800;margin:0 0 8px;letter-spacing:-.5px;}
.lp-step p{color:var(--deep);font-size:16px;line-height:1.45;margin:0;}
.lp-who{background:var(--ink);color:var(--paper);padding:80px 28px;text-align:center;}
.lp-h2{font-size:clamp(30px,4vw,52px);font-weight:900;letter-spacing:-2px;margin:0 auto 20px;max-width:16ch;}
.lp-who p{max-width:52ch;margin:0 auto;font-size:19px;line-height:1.5;opacity:.8;}
.lp-price{max-width:1120px;margin:0 auto;padding:80px 28px;text-align:center;}
.lp-price-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:640px;margin:36px auto 0;}
.lp-price-card{border:2px solid rgba(11,31,23,.12);border-radius:24px;padding:32px 24px;text-align:left;}
.lp-price-card--pro{border-color:var(--green);background:linear-gradient(180deg,rgba(18,226,122,.06),transparent);}
.lp-price-k{font-weight:700;color:var(--deep);font-size:15px;text-transform:uppercase;letter-spacing:1px;}
.lp-price-v{font-size:42px;font-weight:900;letter-spacing:-2px;margin:6px 0 12px;}
.lp-price-v span{font-size:18px;font-weight:600;color:var(--deep);}
.lp-price-card p{color:var(--deep);font-size:15px;margin:0;line-height:1.4;}
.lp-foot{border-top:1px solid rgba(11,31,23,.1);max-width:1120px;margin:0 auto;padding:40px 28px;display:flex;flex-direction:column;gap:16px;align-items:center;text-align:center;}
.lp-foot-links{display:flex;gap:22px;flex-wrap:wrap;justify-content:center;}
.lp-foot-links a{color:var(--deep);text-decoration:none;font-weight:600;font-size:15px;}
.lp-foot-fine{color:var(--deep);opacity:.6;font-size:13px;margin:0;}
@media(max-width:820px){
  .lp-hero{grid-template-columns:1fr;gap:32px;padding-top:20px;}
  .lp-phone{max-width:420px;margin:0 auto;width:100%;}
  .lp-how{grid-template-columns:1fr;gap:32px;}
  .lp-price-grid{grid-template-columns:1fr;}
}
`;

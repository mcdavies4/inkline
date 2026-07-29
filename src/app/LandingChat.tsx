"use client";

import { useEffect, useState } from "react";

const BOT_URL = "https://t.me/InklineSignbot?start=hello";

const SCRIPT: { who: "them" | "bot"; kind: "text" | "doc" | "signed"; text?: string; label?: string; note?: string }[] = [
  { who: "them", kind: "doc", label: "tenancy-agreement.pdf" },
  { who: "bot", kind: "text", text: "Got it. Who's signing?" },
  { who: "them", kind: "text", text: "James Carter" },
  { who: "bot", kind: "text", text: "Here's the link to send James 👇" },
  { who: "bot", kind: "signed", label: "tenancy-agreement · signed.pdf", note: "Signed. Certificate attached." },
];

export default function LandingChat() {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= SCRIPT.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : 1150);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <main className="lp">
      <style>{CSS}</style>

      <nav className="nav">
        <div className="logo">Inkline<i /></div>
        <a className="nav-cta" href={BOT_URL} target="_blank" rel="noopener noreferrer">Open bot</a>
      </nav>

      <section className="hero">
        <div className="hero-l">
          <div className="kicker"><span className="pulse" />Live on Telegram</div>
          <h1 className="h1">
            Get it<br />
            <em>signed</em><br />
            in the chat.
          </h1>
          <p className="lede">
            Send a PDF. Get it back signed and certified. No app to learn, no account,
            about twenty seconds.
          </p>
          <div className="cta-row">
            <a className="cta" href={BOT_URL} target="_blank" rel="noopener noreferrer">
              <Plane /> Start on Telegram
            </a>
            <span className="cta-note">3 free documents<br />no card needed</span>
          </div>
        </div>

        <div className="hero-r">
          <div className="phone">
            <div className="phone-top">
              <div className="pa">I</div>
              <div>
                <div className="pn">Inkline</div>
                <div className="ps">bot</div>
              </div>
            </div>
            <div className="thread">
              {SCRIPT.slice(0, shown).map((m, i) => <Bubble key={i} m={m} />)}
              {shown < SCRIPT.length && <div className="typing"><span /><span /><span /></div>}
            </div>
          </div>
        </div>
      </section>

      <div className="strip">
        <div className="strip-in">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>
              tenancy agreements <i /> freelance contracts <i /> NDAs <i /> invoices <i />
              consent forms <i /> quotes <i /> service agreements <i />
            </span>
          ))}
        </div>
      </div>

      <section className="how">
        <h2 className="h2">Three messages.<br /><span className="dim">That&apos;s the whole product.</span></h2>
        <ol className="steps">
          <li>
            <b>01</b>
            <h3>Send a PDF</h3>
            <p>Forward any document to the bot. It asks who&apos;s signing.</p>
          </li>
          <li>
            <b>02</b>
            <h3>Share the link</h3>
            <p>You get a link. Send it to your signer however you already talk to them.</p>
          </li>
          <li>
            <b>03</b>
            <h3>Signed &amp; sealed</h3>
            <p>They sign with a finger. You both get the certified copy back in chat.</p>
          </li>
        </ol>
      </section>

      <section className="proof">
        <div className="proof-l">
          <h2 className="h2 light">Not a squiggle.<br /><em>Proof.</em></h2>
          <p className="proof-p">
            Every signature is timestamped, fingerprinted and bound to an audit trail —
            sent, opened, signed, returned. The certificate travels with the document.
          </p>
          <ul className="ticks">
            <li>Tamper-evident SHA-256 fingerprint</li>
            <li>Full audit trail on every document</li>
            <li>Certificate page appended automatically</li>
            <li>eIDAS-recognised electronic signature</li>
          </ul>
        </div>
        <div className="cert">
          <div className="cert-h">Certificate of signing</div>
          <dl>
            <div><dt>Signer</dt><dd>James Carter</dd></div>
            <div><dt>Signed</dt><dd className="mono">2026-07-29 09:41</dd></div>
            <div><dt>Document</dt><dd>tenancy-agreement.pdf</dd></div>
            <div><dt>Fingerprint</dt><dd className="mono">9f2ab4…e07c1d</dd></div>
          </dl>
          <div className="trail">sent → opened → signed → returned</div>
        </div>
      </section>

      <section className="price">
        <h2 className="h2">Priced like a tool,<br /><span className="dim">not a subscription trap.</span></h2>
        <div className="cards">
          <div className="card">
            <div className="c-k">Free</div>
            <div className="c-v">3 <span>documents</span></div>
            <p>Everything included. No card, no trial timer.</p>
          </div>
          <div className="card pro">
            <div className="c-k">Unlimited</div>
            <div className="c-v">$9<span>/month</span></div>
            <p>Or $90 a year. Unlimited documents and signers. Cancel anytime.</p>
          </div>
        </div>
        <a className="cta big" href={BOT_URL} target="_blank" rel="noopener noreferrer">
          <Plane /> Start free on Telegram
        </a>
      </section>

      <footer className="foot">
        <div className="logo">Inkline<i /></div>
        <nav>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="mailto:inklinesign@outlook.com">Contact</a>
        </nav>
        <p>© {new Date().getFullYear()} The 36th Company Ltd · e-signatures over Telegram</p>
      </footer>
    </main>
  );
}

function Bubble({ m }: { m: (typeof SCRIPT)[number] }) {
  const side = m.who === "them" ? "them" : "bot";
  if (m.kind === "doc")
    return (
      <div className={`b b-${side}`}>
        <div className="file"><span className="fi">PDF</span>{m.label}</div>
      </div>
    );
  if (m.kind === "signed")
    return (
      <div className={`b b-${side} b-signed`}>
        <div className="file"><span className="fi ok">✓</span><span>{m.label}<em>{m.note}</em></span></div>
      </div>
    );
  return <div className={`b b-${side}`}>{m.text}</div>;
}

function Plane() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9L17 5.7c.4-.3-.1-.5-.6-.2L6.5 12 1.8 10.5c-1-.3-1-1 .2-1.5l18.6-7.2c.9-.3 1.6.2 1.3 1.5Z" fill="currentColor" />
    </svg>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap');

.lp{--ink:#0A1A14;--green:#12E27A;--deep:#0B6B4F;--paper:#F6FFFA;--bubble:#DCF8C6;--tg:#229ED9;--line:rgba(10,26,20,.1);
  background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased;}
.lp *{box-sizing:border-box;}
.lp h1,.lp h2,.lp h3,.logo{font-family:'Bricolage Grotesque',Inter,sans-serif;}
.mono{font-family:'IBM Plex Mono',monospace;}

.nav{display:flex;align-items:center;justify-content:space-between;max-width:1140px;margin:0 auto;padding:24px 28px;}
.logo{font-weight:800;font-size:25px;letter-spacing:-1px;display:inline-flex;align-items:center;gap:7px;}
.logo i{width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;}
.nav-cta{background:var(--ink);color:var(--green);text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:100px;}

.hero{max-width:1140px;margin:0 auto;padding:36px 28px 72px;display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;}
.kicker{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.6px;
  text-transform:uppercase;color:var(--deep);margin-bottom:22px;}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(18,226,122,.6);animation:pulse 2s infinite;}
@keyframes pulse{70%{box-shadow:0 0 0 10px rgba(18,226,122,0);}100%{box-shadow:0 0 0 0 rgba(18,226,122,0);}}
.h1{font-size:clamp(52px,8vw,104px);font-weight:800;line-height:.9;letter-spacing:-4.5px;margin:0 0 26px;}
.h1 em{font-style:normal;color:var(--green);position:relative;}
.h1 em::after{content:"";position:absolute;left:2%;right:-2%;bottom:.12em;height:.1em;background:var(--green);opacity:.22;border-radius:4px;}
.lede{font-size:19px;line-height:1.5;color:var(--deep);max-width:34ch;margin:0 0 34px;}
.cta-row{display:flex;align-items:center;gap:20px;flex-wrap:wrap;}
.cta{display:inline-flex;align-items:center;gap:10px;background:var(--tg);color:#fff;text-decoration:none;
  font-weight:700;font-size:17px;padding:16px 26px;border-radius:100px;box-shadow:0 10px 28px rgba(34,158,217,.28);
  transition:transform .16s ease,box-shadow .16s ease;}
.cta:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(34,158,217,.34);}
.cta.big{font-size:18px;padding:18px 32px;margin-top:36px;}
.cta-note{font-size:13.5px;color:var(--deep);font-weight:600;line-height:1.35;opacity:.85;}

.phone{background:var(--ink);border-radius:30px;padding:16px;box-shadow:0 36px 70px -20px rgba(10,26,20,.45);}
.phone-top{display:flex;align-items:center;gap:11px;padding:8px 10px 15px;border-bottom:1px solid rgba(255,255,255,.08);}
.pa{width:38px;height:38px;border-radius:50%;background:var(--tg);color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px;}
.pn{color:var(--paper);font-weight:700;font-size:16px;line-height:1.2;}
.ps{color:var(--green);font-size:12px;font-weight:600;}
.thread{display:flex;flex-direction:column;gap:9px;padding:16px 4px 6px;min-height:342px;}
.b{max-width:84%;padding:11px 14px;border-radius:17px;font-size:14.5px;font-weight:500;line-height:1.4;animation:in .28s ease both;}
@keyframes in{from{opacity:0;transform:translateY(7px) scale(.97);}}
.b-them{align-self:flex-end;background:var(--bubble);color:var(--ink);border-bottom-right-radius:5px;}
.b-bot{align-self:flex-start;background:#fff;color:var(--ink);border-bottom-left-radius:5px;}
.b-signed{background:var(--green);}
.file{display:flex;align-items:center;gap:9px;font-weight:700;font-size:13.5px;}
.fi{background:var(--ink);color:#fff;font-size:10px;font-weight:800;padding:5px 7px;border-radius:5px;letter-spacing:.3px;}
.fi.ok{background:var(--deep);}
.file em{display:block;font-style:normal;font-weight:500;font-size:11.5px;color:var(--deep);margin-top:2px;}
.typing{align-self:flex-start;background:#fff;border-radius:17px;border-bottom-left-radius:5px;padding:13px 15px;display:flex;gap:4px;}
.typing span{width:6px;height:6px;border-radius:50%;background:#c3c8c5;animation:blink 1.2s infinite;}
.typing span:nth-child(2){animation-delay:.18s;}.typing span:nth-child(3){animation-delay:.36s;}
@keyframes blink{0%,60%,100%{opacity:.3;}30%{opacity:1;}}

.strip{background:var(--ink);color:var(--paper);overflow:hidden;padding:15px 0;}
.strip-in{display:flex;white-space:nowrap;animation:scroll 34s linear infinite;font-weight:600;font-size:14px;}
.strip-in span{padding-right:24px;opacity:.72;}
.strip-in i{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green);margin:0 16px;vertical-align:middle;}
@keyframes scroll{to{transform:translateX(-50%);}}

.h2{font-size:clamp(30px,4.4vw,50px);font-weight:800;letter-spacing:-2px;line-height:1.03;margin:0 0 44px;}
.h2 .dim{color:var(--deep);opacity:.55;}
.h2.light{color:var(--paper);}
.h2.light em{font-style:normal;color:var(--green);}

.how{max-width:1140px;margin:0 auto;padding:86px 28px;}
.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:34px;}
.steps li{border-top:2px solid var(--ink);padding-top:20px;}
.steps b{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--green);background:var(--ink);
  padding:4px 9px;border-radius:5px;display:inline-block;margin-bottom:14px;}
.steps h3{font-size:21px;font-weight:700;margin:0 0 8px;letter-spacing:-.5px;}
.steps p{margin:0;color:var(--deep);font-size:15.5px;line-height:1.5;}

.proof{background:var(--ink);padding:86px 28px;display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;}
.proof-p{color:rgba(246,255,250,.72);font-size:17px;line-height:1.55;max-width:44ch;margin:0 0 26px;}
.ticks{list-style:none;margin:0;padding:0;display:grid;gap:11px;}
.ticks li{color:var(--paper);font-size:15px;font-weight:500;padding-left:26px;position:relative;opacity:.9;}
.ticks li::before{content:"✓";position:absolute;left:0;color:var(--green);font-weight:800;}
.cert{background:var(--paper);border-radius:20px;padding:28px;box-shadow:0 24px 50px -18px rgba(0,0,0,.5);}
.cert-h{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:19px;letter-spacing:-.5px;
  padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:6px;}
.cert dl{margin:0;}
.cert dl>div{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);}
.cert dt{color:var(--deep);font-size:13.5px;font-weight:500;}
.cert dd{margin:0;font-weight:700;font-size:14px;text-align:right;}
.cert dd.mono{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:12.5px;}
.trail{margin-top:16px;font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--deep);}

.price{max-width:1140px;margin:0 auto;padding:86px 28px;text-align:center;}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:660px;margin:0 auto;}
.card{border:2px solid var(--line);border-radius:22px;padding:30px 26px;text-align:left;background:#fff;}
.card.pro{border-color:var(--ink);position:relative;}
.card.pro::after{content:"popular";position:absolute;top:-11px;right:20px;background:var(--green);color:var(--ink);
  font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:4px 11px;border-radius:100px;}
.c-k{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--deep);}
.c-v{font-family:'Bricolage Grotesque',sans-serif;font-size:40px;font-weight:800;letter-spacing:-2px;margin:8px 0 12px;}
.c-v span{font-family:Inter,sans-serif;font-size:15px;font-weight:600;color:var(--deep);letter-spacing:0;}
.card p{margin:0;color:var(--deep);font-size:14.5px;line-height:1.5;}

.foot{border-top:1px solid var(--line);max-width:1140px;margin:0 auto;padding:44px 28px;
  display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;}
.foot nav{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;}
.foot a{color:var(--deep);text-decoration:none;font-weight:600;font-size:14.5px;}
.foot p{color:var(--deep);opacity:.6;font-size:12.5px;margin:0;}

@media(max-width:880px){
  .hero{grid-template-columns:1fr;gap:44px;padding-top:14px;}
  .phone{max-width:400px;margin:0 auto;}
  .steps{grid-template-columns:1fr;gap:26px;}
  .proof{grid-template-columns:1fr;gap:38px;}
  .cards{grid-template-columns:1fr;}
  .h1{letter-spacing:-2.5px;}
}
`;

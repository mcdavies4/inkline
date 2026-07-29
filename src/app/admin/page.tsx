"use client";

import { useState } from "react";

type Stats = {
  generatedAt: string;
  totals: {
    senders: number; subscribers: number; pastDue: number; cancelled: number;
    documents: number; signed: number; pending: number; completionRate: number;
    signers: number; signersSigned: number; storageMb: number; withPlacement: number;
  };
  recent: { docs24h: number; docs7d: number; docs30d: number; senders7d: number };
  daily: { day: string; docs: number }[];
  senders: { key: string; name: string; docs: number; signed: number; last: string }[];
  latest: { id: string; sender: string; filename: string; status: string; created_at: string }[];
};

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (k: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      if (!r.ok) throw new Error(r.status === 401 ? "Wrong key." : "Couldn't load stats.");
      setStats(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!stats) {
    return (
      <main className="ad">
        <style>{CSS}</style>
        <div className="gate">
          <div className="logo">Inkline<i /></div>
          <p className="gate-p">Admin dashboard</p>
          <input
            type="password"
            className="gate-in"
            placeholder="Dashboard key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key && load(key)}
          />
          {error && <p className="err">{error}</p>}
          <button className="btn" disabled={!key || busy} onClick={() => load(key)}>
            {busy ? "Checking…" : "Open dashboard"}
          </button>
        </div>
      </main>
    );
  }

  const t = stats.totals;
  const peak = Math.max(...stats.daily.map((d) => d.docs), 1);

  return (
    <main className="ad">
      <style>{CSS}</style>

      <header className="top">
        <div className="logo">Inkline<i /></div>
        <div className="top-r">
          <span className="stamp">updated {new Date(stats.generatedAt).toLocaleTimeString()}</span>
          <button className="btn sm" onClick={() => load(key)} disabled={busy}>
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="kpis">
        <Kpi label="Senders" value={t.senders} sub={`+${stats.recent.senders7d} this week`} />
        <Kpi label="Subscribers" value={t.subscribers} sub={`${t.pastDue} past due · ${t.cancelled} cancelled`} accent />
        <Kpi label="Documents" value={t.documents} sub={`${stats.recent.docs24h} today · ${stats.recent.docs7d} this week`} />
        <Kpi label="Completion" value={`${t.completionRate}%`} sub={`${t.signed} signed · ${t.pending} pending`} />
      </section>

      <section className="grid2">
        <div className="panel">
          <h2>Last 14 days</h2>
          <div className="spark">
            {stats.daily.map((d, i) => (
              <div key={i} className="bar-wrap" title={`${d.day}: ${d.docs}`}>
                <div className="bar" style={{ height: `${(d.docs / peak) * 100}%` }} />
                <span>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Health</h2>
          <ul className="rows">
            <li><span>Signers</span><b>{t.signersSigned}/{t.signers} signed</b></li>
            <li><span>Used field placement</span><b>{t.withPlacement}</b></li>
            <li><span>Docs in last 30 days</span><b>{stats.recent.docs30d}</b></li>
            <li><span>Storage used</span><b>{t.storageMb} MB</b></li>
            <li><span>Free → paid conversion</span><b>{t.senders ? Math.round((t.subscribers / t.senders) * 100) : 0}%</b></li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h2>Senders</h2>
        <div className="tbl">
          <div className="tr th"><span>Name</span><span>Docs</span><span>Signed</span><span>Last active</span></div>
          {stats.senders.map((s) => (
            <div className="tr" key={s.key}>
              <span className="strong">{s.name}</span>
              <span>{s.docs}</span>
              <span>{s.signed}</span>
              <span className="mut">{s.last.slice(0, 10)}</span>
            </div>
          ))}
          {stats.senders.length === 0 && <p className="mut pad">No senders yet.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Latest documents</h2>
        <div className="tbl">
          <div className="tr th four"><span>Ref</span><span>File</span><span>Sender</span><span>Status</span></div>
          {stats.latest.map((d) => (
            <div className="tr four" key={d.id}>
              <span className="mono">{d.id}</span>
              <span className="strong ell">{d.filename}</span>
              <span className="ell">{d.sender}</span>
              <span><em className={`pill ${d.status}`}>{d.status}</em></span>
            </div>
          ))}
          {stats.latest.length === 0 && <p className="mut pad">Nothing yet.</p>}
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className={`kpi${accent ? " kpi-a" : ""}`}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

const CSS = `
.ad{--ink:#0A1A14;--green:#12E27A;--deep:#0B6B4F;--paper:#F6FFFA;--line:rgba(246,255,250,.12);
  min-height:100vh;background:var(--ink);color:var(--paper);
  font-family:Inter,system-ui,-apple-system,sans-serif;padding:0 0 60px;-webkit-font-smoothing:antialiased;}
.ad *{box-sizing:border-box;}
.mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px;}
.logo{font-weight:800;font-size:22px;letter-spacing:-1px;display:inline-flex;align-items:center;gap:6px;}
.logo i{width:7px;height:7px;border-radius:50%;background:var(--green);}

.gate{max-width:340px;margin:0 auto;padding:18vh 24px;display:flex;flex-direction:column;gap:14px;text-align:center;align-items:center;}
.gate-p{color:rgba(246,255,250,.6);margin:0;font-size:14px;}
.gate-in{width:100%;background:rgba(255,255,255,.06);border:1px solid var(--line);color:var(--paper);
  padding:13px 16px;border-radius:12px;font-size:15px;outline:none;}
.gate-in:focus{border-color:var(--green);}
.btn{background:var(--green);color:var(--ink);border:0;font-weight:700;font-size:15px;
  padding:12px 22px;border-radius:100px;cursor:pointer;}
.btn:disabled{opacity:.45;cursor:default;}
.btn.sm{font-size:13px;padding:8px 16px;}
.err{color:#ff8080;font-size:13.5px;margin:0;}

.top{max-width:1080px;margin:0 auto;padding:26px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.top-r{display:flex;align-items:center;gap:12px;}
.stamp{color:rgba(246,255,250,.45);font-size:12.5px;}

.kpis{max-width:1080px;margin:0 auto 20px;padding:0 24px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.kpi{background:rgba(255,255,255,.045);border:1px solid var(--line);border-radius:16px;padding:18px;}
.kpi-a{border-color:rgba(18,226,122,.4);background:rgba(18,226,122,.07);}
.kpi-l{font-size:12px;text-transform:uppercase;letter-spacing:.9px;color:rgba(246,255,250,.55);font-weight:600;}
.kpi-v{font-size:34px;font-weight:800;letter-spacing:-1.5px;margin:6px 0 4px;}
.kpi-s{font-size:12.5px;color:var(--green);opacity:.85;}

.grid2{max-width:1080px;margin:0 auto 20px;padding:0 24px;display:grid;grid-template-columns:1.4fr 1fr;gap:14px;}
.panel{max-width:1080px;margin:0 auto 20px;padding:20px;background:rgba(255,255,255,.045);
  border:1px solid var(--line);border-radius:16px;width:calc(100% - 48px);}
.grid2 .panel{width:auto;margin:0;}
.panel h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;
  color:rgba(246,255,250,.6);margin:0 0 16px;}

.spark{display:flex;align-items:flex-end;gap:5px;height:130px;}
.bar-wrap{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:6px;}
.bar{width:100%;background:var(--green);border-radius:4px 4px 0 0;min-height:3px;opacity:.85;}
.bar-wrap span{font-size:10px;color:rgba(246,255,250,.4);}

.rows{list-style:none;margin:0;padding:0;}
.rows li{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:14px;}
.rows li:last-child{border-bottom:0;}
.rows span{color:rgba(246,255,250,.65);}
.rows b{font-weight:700;}

.tbl{display:flex;flex-direction:column;}
.tr{display:grid;grid-template-columns:2fr 1fr 1fr 1.2fr;gap:12px;padding:11px 0;
  border-bottom:1px solid var(--line);font-size:13.5px;align-items:center;}
.tr.four{grid-template-columns:.8fr 2fr 1.4fr 1fr;}
.th{color:rgba(246,255,250,.45);font-size:11.5px;text-transform:uppercase;letter-spacing:.8px;font-weight:600;}
.tr:last-child{border-bottom:0;}
.strong{font-weight:600;}
.mut{color:rgba(246,255,250,.45);}
.ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pad{padding:14px 0;}
.pill{font-style:normal;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:100px;
  background:rgba(255,255,255,.1);text-transform:capitalize;}
.pill.signed{background:rgba(18,226,122,.2);color:var(--green);}
.pill.pending{background:rgba(255,200,80,.16);color:#ffc850;}

@media(max-width:860px){
  .kpis{grid-template-columns:1fr 1fr;}
  .grid2{grid-template-columns:1fr;}
  .tr,.tr.four{grid-template-columns:1.6fr .8fr .8fr;font-size:12.5px;}
  .tr span:nth-child(4){display:none;}
  .th span:nth-child(4){display:none;}
}
`;

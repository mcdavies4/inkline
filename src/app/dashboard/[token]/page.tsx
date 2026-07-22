"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Req = {
  id: string;
  filename: string;
  status: string;
  flow: string;
  createdAt: string;
  signers: { name: string; status: string }[];
  downloadUrl: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  in_progress: "In progress",
  signed: "Complete",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function Dashboard() {
  const { token } = useParams<{ token: string }>();
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Couldn't load your dashboard.");
        setReqs(j.requests);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (error)
    return (
      <main className="wrap">
        <div className="card center"><p className="err">{error}</p></div>
      </main>
    );
  if (!reqs)
    return (
      <main className="wrap">
        <div className="card center"><p className="mute">Loading your documents…</p></div>
      </main>
    );

  return (
    <main className="dash">
      <header className="dash-head">
        <span className="l-brand">Inkline</span>
        <span className="mute">Your documents</span>
      </header>

      {reqs.length === 0 && (
        <div className="card center">
          <p className="mute">No documents yet. Send a PDF to the Inkline bot to start one.</p>
        </div>
      )}

      <div className="dash-list">
        {reqs.map((r) => {
          const signed = r.signers.filter((s) => s.status === "signed").length;
          return (
            <div className="dash-row" key={r.id}>
              <div className="dash-main">
                <span className="dash-file">{r.filename}</span>
                <span className="dash-meta">
                  {r.signers.length > 1 ? `${signed}/${r.signers.length} signed · ` : ""}
                  {new Date(r.createdAt).toLocaleDateString()} · ref {r.id.slice(0, 8)}
                </span>
                <span className="dash-signers">
                  {r.signers.map((s) => `${s.name}${s.status === "signed" ? " ✓" : ""}`).join(", ")}
                </span>
              </div>
              <div className="dash-side">
                <span className={`pill pill-${r.status}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                {r.downloadUrl && (
                  <a className="dash-dl" href={r.downloadUrl} target="_blank" rel="noreferrer">
                    Download ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

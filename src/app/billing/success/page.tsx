export const metadata = { title: "Subscribed — Inkline", robots: { index: false } };

export default function Success() {
  return (
    <main className="wrap">
      <div className="card center">
        <div className="tick">✓</div>
        <h1>You're subscribed</h1>
        <p className="mute">
          Inkline is now unlimited. Head back to WhatsApp and send your next document — no more
          limits.
        </p>
      </div>
    </main>
  );
}

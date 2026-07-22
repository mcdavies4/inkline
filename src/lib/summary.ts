// Generates a short, plain-language summary of a document for the signer.
// Uses Claude Haiku for speed/cost. Best-effort: never blocks signing if it fails.

export async function summariseDocument(text: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !text.trim()) return null;

  // Keep token cost bounded — first ~6k chars is plenty for a summary.
  const excerpt = text.slice(0, 6000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system:
          "You explain documents to ordinary people in plain English before they sign. " +
          "Give 3-5 short bullet points covering: what kind of document this is, the key obligations " +
          "or amounts, the duration or deadlines, and anything a signer should be careful about. " +
          "Be neutral and factual. Do NOT give legal advice or opinions on whether to sign. " +
          "If the text is unclear or truncated, say what you can. Output only the bullets, each starting with '• '.",
        messages: [
          { role: "user", content: `Summarise this document for the person about to sign it:\n\n${excerpt}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error("summariseDocument: Anthropic API error", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const out = (data?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();
    if (!out) console.error("summariseDocument: empty response");
    return out || null;
  } catch (e) {
    console.error("summariseDocument failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

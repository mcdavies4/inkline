// Inkline blog content. Articles are authored here as trusted HTML (rendered
// with dangerouslySetInnerHTML on the article page). Add a new object to POSTS
// to publish; the index, sitemap and static params pick it up automatically.

export interface FaqItem {
  q: string;
  a: string;
}

export interface Post {
  slug: string;
  title: string; // used for <title> and the H1
  description: string; // meta description
  keyword: string; // primary target keyword
  date: string; // ISO (published)
  updated?: string; // ISO (last updated)
  readingMins: number;
  excerpt: string; // shown on the blog index
  bodyHtml: string;
  faq?: FaqItem[];
  related?: string[]; // slugs
}

const AUTHOR = "Emeka Azubuike";

export const POSTS: Post[] = [
  // ------------------------------------------------------------------ 1
  {
    slug: "is-electronic-signature-legal-in-nigeria",
    title: "Is an Electronic Signature Legal in Nigeria? (2026 Guide)",
    description:
      "Yes — electronic signatures are legally recognised in Nigeria under the Evidence Act 2011 and CAMA 2020. Here's what's valid, what isn't, and how to make an e-signature that holds up.",
    keyword: "is electronic signature legal in nigeria",
    date: "2026-11-17",
    readingMins: 6,
    excerpt:
      "Electronic signatures are recognised in Nigeria under the Evidence Act 2011 and CAMA 2020 — but a few documents still need wet ink. Here's the plain-English version.",
    bodyHtml: `
<p><strong>Short answer: yes.</strong> Electronic signatures are legally recognised in Nigeria, and have been for over a decade. The main law is the <strong>Evidence Act 2011</strong>, backed up by the <strong>Companies and Allied Matters Act (CAMA) 2020</strong> and the <strong>Cybercrimes Act 2015</strong>. For the vast majority of everyday business documents — contracts, agreements, invoices, NDAs, offer letters, tenancy agreements — an electronic signature is valid and enforceable.</p>
<p>But "legal" has nuance. Below is what the law actually says, the handful of documents you still can't sign electronically, and what makes an e-signature likely to hold up if it's ever challenged.</p>

<h2>The laws that make e-signatures valid in Nigeria</h2>
<p>Nigeria doesn't yet have a single, dedicated electronic-transactions statute. Instead, validity rests on a few laws working together:</p>
<ul>
<li><strong>Evidence Act 2011, section 93(2)</strong> — where a signature is required, that requirement can be satisfied by an electronic signature. This is the core provision: it puts electronic signatures on the same footing as handwritten ones for most purposes.</li>
<li><strong>Evidence Act 2011, section 84</strong> — governs the admissibility of electronically generated evidence in court. In practice this means a signed electronic document can be used as evidence, often supported by a certificate describing how the record was produced.</li>
<li><strong>CAMA 2020</strong> — expressly allows electronic signatures and electronic filing for company documents, including filings with the Corporate Affairs Commission (CAC).</li>
<li><strong>Cybercrimes (Prohibition, Prevention, etc.) Act 2015</strong> — recognises electronic signatures in the context of electronic transactions and gives them evidential weight.</li>
</ul>
<p>Taken together, these mean that in Nigeria an electronic signature is not a second-class signature. A contract signed electronically is as binding as one signed with a pen, provided the ordinary rules of contract are met (offer, acceptance, consideration, intention to be bound).</p>

<h2>What makes an electronic signature valid</h2>
<p>Whatever tool you use, a defensible e-signature generally shows three things:</p>
<ul>
<li><strong>Intent</strong> — the signer meant to sign (they clicked, drew, or typed their signature deliberately).</li>
<li><strong>Attribution</strong> — the signature can be linked to the person who made it (an email, a phone number, a device, a timestamp).</li>
<li><strong>Integrity</strong> — there's a record showing the document wasn't altered after signing, and a trail of who signed what and when.</li>
</ul>
<p>This is why the <em>audit trail</em> matters more than the picture of the signature itself. If a signature is ever disputed, the record of how and when it was made is what carries the weight.</p>

<h2>What you (usually) can't sign electronically</h2>
<p>A small set of documents are typically excluded or still expected in wet ink. Treat these as needing a lawyer's eye rather than an app:</p>
<ul>
<li><strong>Wills and codicils</strong> (testamentary documents).</li>
<li><strong>Affidavits and other sworn declarations</strong> that must be made before a commissioner for oaths.</li>
<li><strong>Documents that must be notarised or stamped</strong>, and some court processes.</li>
<li><strong>Negotiable instruments</strong> such as bills of exchange and promissory notes.</li>
<li><strong>Certain property and land instruments</strong> (for example a registrable deed or a power of attorney over land), which may require physical execution and registration.</li>
</ul>
<p>If a document falls into one of these buckets, don't assume an e-signature is enough — check the specific requirement first.</p>

<h2>Will it hold up in court?</h2>
<p>Yes, when it's done properly. Under the Evidence Act, an electronically signed document is admissible, and courts have accepted electronic evidence. The practical tip is simple: <strong>keep the audit trail</strong>. A signed PDF on its own is weaker than a signed PDF plus a record of the signer's identity, the time, and the fact that the file wasn't changed afterward. Any serious e-signature tool keeps this for you.</p>

<h2>The practical takeaway</h2>
<p>For normal business — a tenancy agreement, a freelance contract, an NDA, a service agreement — you can sign electronically in Nigeria today, and it's legally sound. Use a tool that records who signed, when, and keeps the document intact. <a href="/app">Inkline</a> does exactly that: you send a PDF, the other person signs from their phone, and everyone gets the signed copy with the signing details recorded — no app or account needed.</p>

<p style="font-size:14px;color:#6b7768"><em>This article is general information, not legal advice. For a specific document — especially anything high-value or in the excluded categories above — speak to a qualified Nigerian lawyer.</em></p>
`,
    faq: [
      {
        q: "Are electronic signatures legal in Nigeria?",
        a: "Yes. Electronic signatures are recognised under the Evidence Act 2011 (section 93(2)), CAMA 2020, and the Cybercrimes Act 2015. For most business documents they are as binding as a handwritten signature.",
      },
      {
        q: "Which law covers electronic signatures in Nigeria?",
        a: "Primarily the Evidence Act 2011, which allows an electronic signature to satisfy a signature requirement and makes electronic documents admissible in court. CAMA 2020 adds recognition for company filings.",
      },
      {
        q: "Can I sign a contract electronically in Nigeria?",
        a: "Yes. Ordinary contracts — NDAs, tenancy agreements, service and freelance agreements — can be signed electronically and are enforceable, provided the normal rules of contract are met.",
      },
      {
        q: "What documents can't be signed electronically in Nigeria?",
        a: "Wills and codicils, sworn affidavits, negotiable instruments, and certain property or land instruments typically still require wet-ink signatures or special execution. Check the specific requirement before signing these electronically.",
      },
      {
        q: "Will an electronic signature hold up in court in Nigeria?",
        a: "Yes, when supported by a proper record. Keep the audit trail — who signed, when, and proof the document wasn't altered — and the signed document is admissible under the Evidence Act 2011.",
      },
    ],
    related: ["what-is-an-electronic-signature", "how-to-sign-a-pdf-online-free"],
  },

  // ------------------------------------------------------------------ 2
  {
    slug: "what-is-an-electronic-signature",
    title: "What Is an Electronic Signature? A Simple Guide",
    description:
      "An electronic signature is any digital mark that shows you agreed to a document. Here's what counts, how it differs from a digital signature, and whether it's legally binding.",
    keyword: "what is electronic signature",
    date: "2026-11-17",
    readingMins: 5,
    excerpt:
      "An electronic signature is any digital way of showing you agreed to a document. Here's what counts, the difference from a 'digital signature', and whether it's binding.",
    bodyHtml: `
<p>An <strong>electronic signature</strong> (or e-signature) is any electronic way of showing that a person agreed to the contents of a document. It can be a signature you draw with your finger, your typed name, a tick box you click, or an image of your signature added to a PDF. If it captures your intent to sign, it's an electronic signature.</p>
<p>That's the whole idea — but a few things trip people up, so let's clear them up.</p>

<h2>Electronic signature vs digital signature</h2>
<p>These sound the same and are often used interchangeably, but they're not quite the same thing:</p>
<ul>
<li>An <strong>electronic signature</strong> is the broad, legal concept: any electronic mark that shows agreement.</li>
<li>A <strong>digital signature</strong> is one specific technology used to secure signatures, based on cryptographic certificates (PKI). It's a way of implementing an electronic signature with strong tamper-evidence.</li>
</ul>
<p>So every digital signature is an electronic signature, but not every electronic signature is a "digital signature" in the technical sense. For everyday agreements, what you need is a legally valid electronic signature with a clear record — not necessarily the heavyweight cryptographic kind.</p>

<h2>The common types of electronic signature</h2>
<ul>
<li><strong>Drawn</strong> — you sign with your finger or a stylus on a screen.</li>
<li><strong>Typed</strong> — you type your name and it's rendered in a signature font.</li>
<li><strong>Uploaded</strong> — you add an image of your handwritten signature.</li>
<li><strong>Click-to-sign</strong> — you click a button to confirm agreement, with your identity and time recorded.</li>
</ul>

<h2>What makes an electronic signature valid</h2>
<p>A good e-signature captures three things:</p>
<ul>
<li><strong>Intent</strong> — you deliberately signed.</li>
<li><strong>Attribution</strong> — it can be tied back to you (via email, phone, device, timestamp).</li>
<li><strong>Integrity</strong> — there's a record that the document wasn't changed after signing.</li>
</ul>
<p>The signature image is the visible part; the <em>record behind it</em> is what gives it weight if it's ever questioned.</p>

<h2>Are electronic signatures legally binding?</h2>
<p>In most of the world — yes, including Nigeria, the UK, the EU, and the US. For the Nigeria-specific rules (which laws apply, and the few documents that still need wet ink), see our guide: <a href="/blog/is-electronic-signature-legal-in-nigeria">Is an electronic signature legal in Nigeria?</a></p>

<h2>When would you use one?</h2>
<p>Any time you'd otherwise print, sign, scan, and email a document back: contracts, NDAs, tenancy agreements, offer letters, consent forms, invoices that need sign-off. An e-signature turns a 20-minute chore into about 20 seconds.</p>

<h2>How to create an electronic signature</h2>
<p>You don't need special software. The simplest route is a signing tool that lets the other person sign from their phone without installing anything. See <a href="/blog/how-to-sign-a-pdf-online-free">how to sign a PDF online for free</a>, or just <a href="/app">send a document with Inkline</a> and let the signer draw their signature in the browser.</p>
`,
    related: ["is-electronic-signature-legal-in-nigeria", "how-to-sign-a-pdf-online-free"],
  },

  // ------------------------------------------------------------------ 3
  {
    slug: "how-to-sign-a-pdf-online-free",
    title: "How to Sign a PDF Online for Free (No App, No Account)",
    description:
      "Need to sign a PDF or get someone else to? Here's how to do it online for free from your phone or laptop — no app to install and no account to create.",
    keyword: "sign a pdf online free",
    date: "2026-11-17",
    readingMins: 5,
    excerpt:
      "Skip the print-sign-scan dance. Here's how to sign a PDF — or get someone else to — online and free, from any phone, with no app and no account.",
    bodyHtml: `
<p>Printing a document, signing it, scanning it, and emailing it back is one of the most annoying small tasks in work. The good news: you don't have to. You can sign a PDF — or send one for someone else to sign — entirely online, for free, from a phone or laptop, without installing anything.</p>
<p>Here's how.</p>

<h2>What you'll need</h2>
<ul>
<li>The PDF you want signed.</li>
<li>The name (and optionally email or phone) of whoever needs to sign.</li>
<li>A browser. That's it — no app, no account.</li>
</ul>

<h2>Option 1: Send a PDF for someone else to sign</h2>
<p>This is the common case — you have a contract and you need a client, tenant, or colleague to sign it.</p>
<ol>
<li>Go to <a href="/app">inklinesign.com/app</a>.</li>
<li>Enter your name and email, and upload the PDF.</li>
<li>Add the signer's name (and their email, if you have it).</li>
<li>Send. The signer gets a link — by email, or one you can share on WhatsApp or anywhere else.</li>
<li>They open the link, tap exactly where their signature should go on the page, draw it with a finger, and that's it.</li>
<li>Everyone gets the signed copy back automatically.</li>
</ol>
<p>No account is created for the signer, and they don't install anything. On a phone it takes about 20 seconds.</p>

<h2>Option 2: Sign a document on Telegram</h2>
<p>If you live in Telegram, Inkline also works as a bot. Send the PDF to <a href="https://t.me/InklineSignbot?start=web" target="_blank" rel="noreferrer">@InklineSignbot</a>, add who should sign, and the signing link goes straight to their chat. Same result, inside the app you already use.</p>

<h2>Make the signature land in the right place</h2>
<p>A common frustration with free tools is the signature covering text or landing in the wrong spot. When you sign with Inkline, you tap the exact point on the page where the signature belongs and can drag to move it or resize it before confirming — so it sits neatly on the signature line and nothing else on the document is touched. The finished file is your original PDF with just the signature added.</p>

<h2>Is signing a PDF online legally valid?</h2>
<p>For most documents, yes. Electronic signatures are legally recognised in Nigeria and most countries. The key is using a tool that records who signed and when. We cover the Nigerian rules in detail here: <a href="/blog/is-electronic-signature-legal-in-nigeria">Is an electronic signature legal in Nigeria?</a></p>

<h2>Free to start</h2>
<p>Inkline is free for 14 days with no card required, so you can send your first documents straight away. <a href="/app">Send a PDF for signing →</a></p>
`,
    related: ["is-electronic-signature-legal-in-nigeria", "what-is-an-electronic-signature"],
  },
];

export function allPosts(): Post[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export { AUTHOR };

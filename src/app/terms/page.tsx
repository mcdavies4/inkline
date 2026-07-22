export const metadata = {
  title: "Terms of Service — Inkline",
  description: "The terms that govern your use of Inkline.",
};

const UPDATED = "17 July 2026";

export default function Terms() {
  return (
    <main className="legal">
      <header className="legal-head">
        <a className="l-brand" href="/">Inkline</a>
        <span className="mute">Terms of Service</span>
      </header>

      <article className="legal-body">
        <h1>Terms of Service</h1>
        <p className="legal-date">Last updated: {UPDATED}</p>

        <p>
          These terms govern your use of Inkline, an electronic signature service operated by
          The 36th Company Ltd ("we", "us"), a company registered in England and Wales. By sending
          a document, signing a document, or otherwise using Inkline, you agree to these terms. If
          you do not agree, do not use the service.
        </p>

        <h2>What Inkline does</h2>
        <p>
          Inkline lets you send documents for signature over WhatsApp and the web. A sender uploads
          a document and nominates signers; each signer reviews the document and applies an
          electronic signature; a completed copy with a certificate of completion is returned to
          the parties. Inkline records a trail of the key events for each document.
        </p>

        <h2>Electronic signatures and legal effect</h2>
        <p>
          Signatures made through Inkline are simple electronic signatures. In the UK and EU,
          electronic signatures are generally admissible and can be legally binding under the
          Electronic Communications Act 2000 and the eIDAS Regulation. However, some documents have
          specific legal requirements and are not suitable for a simple electronic signature.
          Inkline must not be used to sign wills, deeds, documents requiring a witness or notary,
          transfers of land or property, or any document that law or regulation requires to be
          executed in a particular form. You are responsible for confirming that a simple
          electronic signature is appropriate for your document. We do not provide legal advice,
          and nothing in the service is legal advice.
        </p>

        <h2>Your responsibilities</h2>
        <p>
          You are responsible for the documents you send, the accuracy of the signer details you
          provide, and having the right to send a document to the people you nominate. You must not
          use Inkline to send unlawful, fraudulent, harassing, or infringing content, to
          impersonate another person, or to obtain a signature by deception. You must have the
          authority of each person whose phone number you enter. You are responsible for keeping
          any links we send to you and your signers appropriately private.
        </p>

        <h2>Signer verification</h2>
        <p>
          Inkline verifies a signer's identity by their possession of the WhatsApp number to which
          the signing request is sent, and optionally by a one-time code. This is a reasonable but
          not infallible method of identification. We do not guarantee that a signer is who they
          claim to be, and we are not responsible for determining the legal capacity or authority
          of any signer.
        </p>

        <h2>Availability</h2>
        <p>
          We aim to keep Inkline available but do not guarantee uninterrupted or error-free
          service. Inkline depends on third parties including WhatsApp (Meta), our hosting and
          database providers, and others; interruptions to those services may affect Inkline. We
          may change, suspend, or discontinue features at any time.
        </p>

        <h2>Fees</h2>
        <p>
          Inkline includes a number of free documents for each sender. After the free allowance is
          used, continued sending requires a paid subscription, which unlocks unlimited documents
          for the subscription period. Prices are shown to you before you subscribe. Subscriptions
          renew automatically until cancelled; you can cancel at any time and will retain access
          until the end of the paid period. We may change pricing on reasonable notice. Payments
          are handled by our payment providers (Stripe and, in some regions, Flutterwave); fees
          already paid are non-refundable except where required by law.
        </p>

        <h2>Liability</h2>
        <p>
          Inkline is provided "as is". To the fullest extent permitted by law, we exclude all
          implied warranties and are not liable for indirect or consequential loss, loss of
          profits, or loss of data. Nothing in these terms excludes liability that cannot be
          excluded by law, including for death or personal injury caused by negligence or for
          fraud. Subject to that, our total liability arising from your use of Inkline is limited
          to the greater of the fees you paid us in the twelve months before the claim, or £100.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using Inkline at any time. We may suspend or end your access if you breach
          these terms or use the service unlawfully. Completed documents and their audit records
          may be retained as described in our Privacy Policy.
        </p>

        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of England and Wales, and the courts of England and
          Wales have exclusive jurisdiction.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to us at the contact address published on our
          website. The 36th Company Ltd, London, United Kingdom.
        </p>

        <p className="legal-fine">
          This document is a general template and not legal advice. You should obtain your own
          legal advice on your specific circumstances before relying on Inkline for important
          agreements.
        </p>

        <nav className="legal-nav">
          <a href="/privacy">Privacy Policy</a>
          <a href="/">Back to home</a>
        </nav>
      </article>
    </main>
  );
}

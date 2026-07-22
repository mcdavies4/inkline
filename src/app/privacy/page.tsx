export const metadata = {
  title: "Privacy Policy — Inkline",
  description: "How Inkline collects, uses, and protects your data.",
};

const UPDATED = "17 July 2026";

export default function Privacy() {
  return (
    <main className="legal">
      <header className="legal-head">
        <a className="l-brand" href="/">Inkline</a>
        <span className="mute">Privacy Policy</span>
      </header>

      <article className="legal-body">
        <h1>Privacy Policy</h1>
        <p className="legal-date">Last updated: {UPDATED}</p>

        <p>
          This policy explains how The 36th Company Ltd ("we", "us") handles personal data when you
          use Inkline. We are the data controller for the personal data described here. We process
          personal data in line with the UK General Data Protection Regulation (UK GDPR) and the
          Data Protection Act 2018.
        </p>

        <h2>What we collect</h2>
        <p>
          When you use Inkline as a sender, we process your WhatsApp number, the name shown on your
          WhatsApp profile, and the documents and signer details you provide. When you sign a
          document, we process your name, your WhatsApp number, your electronic signature image,
          the document you sign, and technical information collected at the point of signing —
          including the time, your IP address, and your browser's user-agent string. Where you use
          one-time codes, we process a temporary verification code.
        </p>

        <h2>Why we process it, and our legal basis</h2>
        <p>
          We process this data to provide the signing service you have asked for — delivering
          documents, capturing signatures, producing the completed document and its certificate,
          and notifying the parties. Our legal basis is the performance of a contract with you and
          our legitimate interest in operating the service. We process signing metadata (time, IP,
          user-agent, verification) to create a reliable record of the transaction, which is a
          legitimate interest of the parties relying on the signature and, where applicable,
          necessary to establish the legal effect of the signature.
        </p>

        <h2>The document content</h2>
        <p>
          We store the documents you send so that signers can review them and so a completed copy
          can be produced and delivered. We do not sell your documents or use their content for
          advertising. Where our service generates an optional plain-language summary of a
          document, the document text is sent to our AI provider solely to produce that summary and
          is not used to train their models under the terms we operate on. You can send documents
          without relying on the summary feature.
        </p>

        <h2>Who we share it with</h2>
        <p>
          We share personal data with the providers that make Inkline work, acting as our
          processors: Meta (WhatsApp) to send and receive messages; our hosting and serverless
          provider; our database and file storage provider; and, where the summary feature is used,
          our AI provider. We share the completed document and certificate with the other parties
          to that document, which is the purpose of the service. We may disclose data if required
          by law or to protect our legal rights.
        </p>

        <h2>International transfers</h2>
        <p>
          Some of our providers are located outside the UK. Where personal data is transferred
          outside the UK, we rely on appropriate safeguards such as the UK's international data
          transfer agreement or an adequacy decision.
        </p>

        <h2>How long we keep it</h2>
        <p>
          We keep completed documents and their audit records for as long as needed to provide the
          service and to preserve the integrity of the signature record, and as required to meet
          legal or regulatory obligations. Incomplete or cancelled requests, one-time codes, and
          short-lived session data are removed on a shorter cycle. You can ask us to delete data as
          described below, subject to our need to retain records of completed transactions.
        </p>

        <h2>Your rights</h2>
        <p>
          Under UK GDPR you have the right to access the personal data we hold about you, to have
          inaccurate data corrected, to have data erased in certain circumstances, to restrict or
          object to processing, and to data portability. To exercise these rights, contact us using
          the details below. You also have the right to complain to the Information Commissioner's
          Office (ICO), the UK's data protection regulator, at ico.org.uk.
        </p>

        <h2>Security</h2>
        <p>
          We use access controls, encrypted connections, and private storage to protect personal
          data, and we limit access to what is needed to run the service. No system is completely
          secure, but we take reasonable steps to protect your information.
        </p>

        <h2>Children</h2>
        <p>
          Inkline is not intended for use by anyone under 18, and we do not knowingly collect data
          from children.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy. Where changes are significant we will take reasonable steps to
          make you aware. The date at the top shows when it was last revised.
        </p>

        <h2>Contact</h2>
        <p>
          For any privacy question or to exercise your rights, contact The 36th Company Ltd,
          London, United Kingdom, at the contact address published on our website.
        </p>

        <p className="legal-fine">
          This document is a general template and not legal advice. For a service that processes
          personal data and legal documents, you should have your policies reviewed by a qualified
          adviser.
        </p>

        <nav className="legal-nav">
          <a href="/terms">Terms of Service</a>
          <a href="/">Back to home</a>
        </nav>
      </article>
    </main>
  );
}

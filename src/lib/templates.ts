// Built-in document templates. Lets a user CREATE a contract they don't have,
// then route it for signing through the normal flow. Jurisdiction-neutral, plain
// language — good enough for everyday agreements, not a substitute for a lawyer.

export interface TemplateField {
  key: string;
  label: string; // the question the bot asks
}

export interface DocTemplate {
  keyword: string; // what the user types, e.g. TENANCY
  title: string;
  description: string;
  fields: TemplateField[];
  render: (v: Record<string, string>) => string;
}

const SIGN_BLOCK = `
IN WITNESS WHEREOF, the parties have signed this agreement on the date stated above.


Signed: _______________________________`;

export const TEMPLATES: DocTemplate[] = [
  {
    keyword: "TENANCY",
    title: "Tenancy Agreement",
    description: "A simple residential tenancy agreement between a landlord and a tenant.",
    fields: [
      { key: "landlord", label: "Landlord's full name" },
      { key: "tenant", label: "Tenant's full name" },
      { key: "address", label: "Full address of the property" },
      { key: "rent", label: "Rent amount and how often (e.g. ₦250,000 monthly, or £1,200 per month)" },
      { key: "deposit", label: "Deposit amount" },
      { key: "start", label: "Start date (e.g. 1 December 2026)" },
      { key: "term", label: "Length of the tenancy (e.g. 12 months)" },
    ],
    render: (v) => `TENANCY AGREEMENT

This Tenancy Agreement is made between ${v.landlord} ("the Landlord") and ${v.tenant} ("the Tenant").

1. PROPERTY
The Landlord agrees to let to the Tenant the property at ${v.address} ("the Property").

2. TERM
The tenancy begins on ${v.start} and continues for ${v.term}.

3. RENT
The Tenant shall pay rent of ${v.rent}, payable in advance. Rent is due on the same day of each period throughout the term.

4. DEPOSIT
The Tenant shall pay a deposit of ${v.deposit}, to be returned at the end of the tenancy less any deductions for damage, unpaid rent, or breach of this agreement.

5. TENANT OBLIGATIONS
The Tenant shall keep the Property in good condition, pay rent on time, not sublet without written consent, and allow the Landlord reasonable access with prior notice.

6. LANDLORD OBLIGATIONS
The Landlord shall keep the structure and essential services of the Property in good repair and allow the Tenant quiet enjoyment of the Property.

7. ENDING THE TENANCY
Either party may end this agreement by giving reasonable written notice in line with local law, or as otherwise agreed in writing.
${SIGN_BLOCK}`,
  },
  {
    keyword: "NDA",
    title: "Non-Disclosure Agreement",
    description: "A mutual confidentiality agreement for sharing private information.",
    fields: [
      { key: "disclosing", label: "Name of the party sharing the information" },
      { key: "receiving", label: "Name of the party receiving the information" },
      { key: "purpose", label: "Purpose — why is the information being shared?" },
      { key: "date", label: "Effective date (e.g. 11 November 2026)" },
      { key: "duration", label: "How long must it stay confidential? (e.g. 2 years)" },
    ],
    render: (v) => `NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement is made on ${v.date} between ${v.disclosing} ("the Disclosing Party") and ${v.receiving} ("the Receiving Party").

1. PURPOSE
The parties wish to share confidential information for the purpose of: ${v.purpose}.

2. CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by one party to the other, whether written or spoken, including business, technical, financial, and commercial information.

3. OBLIGATIONS
The Receiving Party shall keep the Confidential Information secret, use it only for the Purpose above, and not disclose it to any third party without written consent.

4. EXCLUSIONS
This agreement does not apply to information that is already public, independently developed, or lawfully received from another source.

5. DURATION
The obligations in this agreement shall remain in force for ${v.duration} from the date above.

6. RETURN OF INFORMATION
On request, the Receiving Party shall return or destroy all Confidential Information in its possession.
${SIGN_BLOCK}`,
  },
  {
    keyword: "FREELANCE",
    title: "Freelance Service Agreement",
    description: "An agreement between a client and a freelancer for a piece of work.",
    fields: [
      { key: "client", label: "Client's full name or business" },
      { key: "freelancer", label: "Freelancer's full name or business" },
      { key: "service", label: "Describe the work or service to be done" },
      { key: "fee", label: "Fee (with currency, e.g. ₦150,000 or £800)" },
      { key: "terms", label: "Payment terms (e.g. 50% upfront, 50% on delivery)" },
      { key: "start", label: "Start date" },
      { key: "deadline", label: "Delivery deadline" },
    ],
    render: (v) => `FREELANCE SERVICE AGREEMENT

This agreement is made between ${v.client} ("the Client") and ${v.freelancer} ("the Freelancer").

1. SERVICES
The Freelancer agrees to provide the following: ${v.service}.

2. TIMELINE
Work begins on ${v.start} and shall be delivered by ${v.deadline}.

3. FEE
The Client shall pay the Freelancer ${v.fee} for the services.

4. PAYMENT TERMS
Payment shall be made as follows: ${v.terms}.

5. OWNERSHIP
On receipt of full payment, ownership of the completed work transfers to the Client. The Freelancer may show the work in a portfolio unless the Client objects in writing.

6. INDEPENDENT CONTRACTOR
The Freelancer is an independent contractor, responsible for their own taxes, and is not an employee of the Client.

7. REVISIONS AND CANCELLATION
Reasonable revisions are included. If the Client cancels, the Freelancer is paid for work completed up to that point.
${SIGN_BLOCK}`,
  },
  {
    keyword: "INVOICE",
    title: "Invoice",
    description: "A simple invoice for goods or services.",
    fields: [
      { key: "from", label: "Your name or business (who is billing)" },
      { key: "to", label: "Bill to (client's name)" },
      { key: "number", label: "Invoice number (e.g. INV-001)" },
      { key: "description", label: "Description of goods or services" },
      { key: "amount", label: "Amount due (with currency)" },
      { key: "due", label: "Payment due date" },
    ],
    render: (v) => `INVOICE  ${v.number}

FROM: ${v.from}
TO:   ${v.to}

DESCRIPTION
${v.description}

AMOUNT DUE: ${v.amount}
DUE DATE:   ${v.due}

Please make payment by the due date above. Thank you for your business.

Acknowledged and accepted:`,
  },
  {
    keyword: "RECEIPT",
    title: "Payment Receipt",
    description: "A receipt confirming a payment was received.",
    fields: [
      { key: "from", label: "Received from (payer's name)" },
      { key: "amount", label: "Amount received (with currency)" },
      { key: "reason", label: "What was the payment for?" },
      { key: "date", label: "Date received" },
      { key: "by", label: "Received by (your name)" },
    ],
    render: (v) => `PAYMENT RECEIPT

RECEIVED FROM: ${v.from}
AMOUNT:        ${v.amount}
FOR:           ${v.reason}
DATE:          ${v.date}
RECEIVED BY:   ${v.by}

This confirms that the amount above has been received in full.

Signed:`,
  },
];

export function findTemplate(keyword: string): DocTemplate | undefined {
  const k = keyword.trim().toUpperCase();
  return TEMPLATES.find((t) => t.keyword === k);
}

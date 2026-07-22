# Inkline — WhatsApp-first e-signatures

Send a PDF into someone's WhatsApp. They tap **Review & sign**, draw their signature on a
20-second mobile page, and the signed PDF (with an audit certificate page) lands back in the
chat. Identity = possession of the WhatsApp number. No app, no account, no email.

Working name is **Inkline** — rename freely.

## Stack
Next.js 14 (App Router) · Supabase (Postgres + Storage) · Meta Cloud API · pdf-lib.
Same architecture family as Nolgic/Relink/Nowrumble, so all your existing plumbing applies.

## Setup

1. **Supabase**
   - Run `supabase/migrations/0001_inkline.sql` in the SQL editor.
   - Create a **private** Storage bucket named `inkline`.

2. **Env** — copy `.env.example` to `.env.local` and fill in. Reuse your existing Meta app's
   token/phone-number ID or create a fresh WhatsApp Business app for this product.

3. **Meta webhook** — point the app's webhook to
   `https://YOUR_DOMAIN/api/whatsapp/webhook` with your `WHATSAPP_VERIFY_TOKEN`,
   subscribed to `messages`. (Only needed for quick-approval mode; full signature mode
   works without the webhook.)

4. **Deploy** — push to GitHub → Vercel as usual. Set the env vars in Vercel.

## Create a signing request — WhatsApp bot (primary flow)

Message the business number:
1. **Send a PDF** → bot confirms and asks for the signer's name
2. **Send the name** → bot asks for their WhatsApp number (international format)
3. **Send the number** → bot shows a summary, reply **SEND**
4. Signer gets the doc + *Review & sign* button; when they sign, **both parties**
   receive the completed PDF with its certificate page

Reply **CANCEL** at any step to reset. Runs on migration `0002_sender_bot.sql`
(`bot_sessions` state machine + `sender_phone` on requests) — run it after 0001.

## Create a signing request — API

```bash
curl -X POST https://YOUR_DOMAIN/api/requests \
  -H "x-api-key: $INKLINE_API_KEY" \
  -F "file=@contract.pdf" \
  -F "signer_phone=447700900123" \
  -F "signer_name=Ada Obi" \
  -F "sender_name=The 36th Company" \
  -F "message=Please sign by Friday" \
  -F "mode=signature"
```

The signer receives (1) the PDF in chat, (2) a **Review & sign** button. After signing they
receive the stamped PDF with the certificate page. `mode=quick_approval` instead lets them
reply **YES** to approve (recorded in the audit trail, no drawn signature).

## What's in the signed PDF
- Drawn signature stamped on the last page with name, timestamp, and reference
- Appended **Signature certificate** page: signer, verified WhatsApp number, SHA-256 of the
  original, and the full event trail (created → delivered → opened → signed → returned)

## Legal footing (UK)
Simple electronic signatures are valid for most UK contracts under eIDAS/ECA 2000 — intent +
audit trail is what matters. Not suitable for deeds, wills, or land transfers. Add your own
terms before charging customers; this is not legal advice.

## v1 limits / obvious next steps
- One signer per request (schema already supports multiple)
- No sender dashboard yet — the WhatsApp bot is the primary interface; a web dashboard for request history is a v2 build
- Sender notification on completion: DONE (signed PDF goes to both parties)
  the signed doc to both parties)
- Signature placement is fixed (bottom-left of last page); drag-to-place is a v2 feature
- Webhook signature verification: DONE (set META_APP_SECRET to enforce)

## Production templates (submit in Meta → WhatsApp Manager → Message templates)

Cold signers (people who never messaged you) can only be reached via approved templates.
Create these two as **Utility** templates, language English:

**`signature_request`** — body:
> {{1}} has sent you a document to sign: {{2}}. Tap below to review and sign — it takes about 20 seconds, no app or account needed.

Button: *Visit website* → Dynamic URL → `https://YOUR_DOMAIN/sign/{{1}}`

**`signed_copy_ready`** — body:
> Your signed copy of {{1}} is ready to download, certificate included.

Button: *Visit website* → Dynamic URL → `https://YOUR_DOMAIN/sign/{{1}}`

Set the approved names in `WHATSAPP_TEMPLATE_SIGNATURE_REQUEST` / `WHATSAPP_TEMPLATE_SIGNED_COPY`.
Delivery logic: free-form is tried first (works in the 24h window and on test numbers);
on failure the template is sent automatically. No code changes needed when you go live.

## Landing page

`/` is a full landing page. Set `NEXT_PUBLIC_WHATSAPP_NUMBER` (digits only) so the
"Try it on WhatsApp" buttons deep-link into a chat with your bot.

## v3 features

**Multiple signers.** Send a PDF, add signer 1, then reply with more names/numbers or DONE.
With 2+ signers the bot asks ORDER (sequential — each notified in turn) or TOGETHER (parallel).
The final certificate lists every signer; the signed PDF carries all signatures.

**OTP verification.** During setup the bot offers a one-time-code check. If on, each signer
gets a 6-digit code on WhatsApp and must enter it before the signing canvas unlocks.

**AI document summary.** If `ANTHROPIC_API_KEY` is set, signers see a plain-English summary
(via Claude Haiku) above the document. Best-effort — signing works fine without it. Clearly
labelled "not legal advice".

**Document templates.** Reply a keyword (seed template: TENANCY) and the bot collects the
fields, generates a PDF, and drops straight into the signing flow. Add more templates as rows
in `doc_templates` (owner_phone null = available to everyone).

**Bot commands.** HELP, STATUS (pending docs with signed counts), DASHBOARD (magic link),
CANCEL. Global commands work only when not mid-flow.

**Sender dashboard.** DASHBOARD returns a 30-minute magic link to `/dashboard/{token}` listing
all the sender's documents with status pills and download links for completed ones.

**Reminders.** `vercel.json` runs `/api/cron/reminders` daily at 10:00 UTC. It nudges signers
on pending/in-progress requests untouched for >24h, max 2 reminders each. Protected by
`CRON_SECRET` (Vercel Cron sends it automatically).

**i18n.** All bot + page copy lives in `src/lib/i18n.ts`. English only today; add a language by
adding a key to `strings` — no code changes needed elsewhere.

Run migration `0003_features.sql` after 0001 and 0002.

## Migrations order
1. `0001_inkline.sql`
2. `0002_sender_bot.sql`
3. `0003_features.sql`

## v4: Free credits + Stripe subscription

**Model:** each sender gets 3 free documents (tracked by WhatsApp number). After that, the bot
sends a subscribe link. A Stripe subscription unlocks unlimited. UK/other senders → Stripe;
Nigeria (+234) → Flutterwave placeholder message (Flutterwave wired in a later pass).

**Setup:**
1. Run migration `0004_billing.sql`.
2. In Stripe: create a recurring Price (e.g. £X/month). Copy its `price_...` id.
3. Vercel env: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.
4. Add a Stripe webhook endpoint → `https://YOUR_DOMAIN/api/stripe/webhook`, listening for:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.deleted`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

**Flow:** 3 free docs → 4th triggers paywall with Stripe Checkout link → they subscribe →
`checkout.session.completed` webhook flips the account to `active` → bot confirms → unlimited.
Renewals (`invoice.paid`) keep it active; failed payments set `past_due`; cancellation sets
`cancelled` (they drop back to the free gate).

**Bot commands added:** BILLING / SUBSCRIBE — get a subscribe/manage link.

**Testing:** use Stripe test mode keys + test card 4242 4242 4242 4242. Use the Stripe CLI
(`stripe listen --forward-to`) to replay webhooks locally, or test on the deployed URL.

**Not yet built (next pass):** Flutterwave recurring billing for Nigerian senders, a customer
portal link for self-serve cancellation, proration/plan tiers.

Run migrations in order: 0001 → 0002 → 0003 → 0004.

## v5 (part 1): visual field placement — editor

After confirming signers, the bot offers PLACE or SKIP.
- SKIP → signature goes bottom of last page (unchanged behaviour).
- PLACE → sender opens /place/[token], a drag-and-drop editor: pick a field type
  (signature / date / initials / text), tap the document to drop it, drag to position,
  assign to a signer (multi-signer only), toggle date auto/signer. Coordinates are stored as
  page-relative fractions in doc_fields. Saving delivers the document to signers.

Run migration 0005_fields.sql (after 0004).

NOTE: This is part 1 of 2. The SIGNING and STAMPING halves (signers filling their specific
fields, and burning them into the PDF at exact coordinates) are the next pass. Until then,
placed fields are stored but the signer still signs with the single bottom signature and the
stamp still uses bottom placement. Test the EDITOR first: does dragging work, do fields save,
do coordinates look right when you re-open?

## v5 (part 2): field filling + coordinate stamping — COMPLETE

The loop is now closed:
- Signer opens their link → if placement was used, sees the document with THEIR fields
  highlighted at exact positions → taps each to fill (draw signature/initials, type date/text,
  auto-dates fill themselves) → completes.
- Each signer only sees fields assigned to them (or unassigned "any" fields).
- When all signers finish, the PDF is stamped with every field burned in at its exact
  coordinates (page-relative fractions → PDF points), plus the certificate page.
- SKIP path unchanged: single bottom signature, legacy stamp.

No new migration beyond 0005. Test end to end: place fields → signer fills them → check the
final PDF has each mark in the right spot.

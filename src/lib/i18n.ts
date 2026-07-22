// Central copy for bot + signing page. Add a language by adding a key to `strings`
// and setting DEFAULT_LANG or per-signer language later. Keep keys stable.

type Lang = "en";
export const DEFAULT_LANG: Lang = "en";

type Vars = Record<string, string | number>;
function fill(t: string, vars?: Vars): string {
  if (!vars) return t;
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const strings: Record<Lang, Record<string, string>> = {
  en: {
    // Bot — sender flow
    bot_intro:
      "Hi! I'm Inkline — I get documents signed over WhatsApp.\n\nSend me a PDF and I'll walk you through it: you give me the signer's name and number, they sign on their phone in ~20 seconds, and you both get the signed copy back here.\n\nType HELP to see what I can do.",
    bot_help:
      "Here's what I can do:\n\n📄 *Send me a PDF* — to get it signed\n📝 *Type a template keyword* (e.g. TENANCY) — to create a document from scratch\n📋 *STATUS* — see your pending documents\n📊 *DASHBOARD* — see all your documents\n💳 *BILLING* — manage your subscription\n❌ *CANCEL* — stop what we're doing\n\nJust send a PDF to begin.",
    bot_got_doc: "Got *{filename}* ✓\n\nWho's signing it? Send me their full name.\n\n(Reply CANCEL any time to start over.)",
    bot_not_pdf: "I can only handle PDFs for now — could you resend it as a PDF?",
    bot_too_big: "That file is over 15 MB — could you send a smaller version?",
    bot_bad_name: "That doesn't look like a name — send the signer's full name, e.g. *Ada Obi*.",
    bot_ask_phone:
      "Great. What's {first}'s WhatsApp number?\n\nUse international format, e.g. *+447700900123* or *+12025550123*.",
    bot_bad_phone:
      "I need the number in international format with the country code, e.g. *+447700900123*. Try again?",
    bot_ask_more_signers:
      "Added {name} ✓\n\nAdd another signer? Send their full name, or reply *DONE* if that's everyone.",
    bot_ask_flow:
      "You've got {count} signers. Should they sign *IN ORDER* (one after another) or *TOGETHER* (all at once)?\n\nReply ORDER or TOGETHER.",
    bot_ask_otp:
      "Add an extra security check? Each signer would enter a one-time code sent to their WhatsApp before signing.\n\nReply OTP to enable, or SKIP.",
    bot_confirm_single:
      "Ready to go:\n\n📄 *{filename}*\n✍️ {signer}\n📱 +{phone}\n\nReply *SEND* to deliver it, or CANCEL.",
    bot_confirm_multi:
      "Ready to go:\n\n📄 *{filename}*\n{signerList}\n🔐 {flow}{otp}\n\nReply *SEND* to deliver it, or CANCEL.",
    bot_send_prompt: "Reply *SEND* to deliver the document, or CANCEL to start over.",
    bot_sent_single:
      "Sent ✓ {name} has the document with a *Review & sign* button.\n\nI'll send you the signed copy the moment it's done. Ref: {ref}",
    bot_sent_multi:
      "Sent ✓ {first} has the document now.{queue}\n\nI'll keep you posted and send the final signed copy when everyone's done. Ref: {ref}",
    bot_send_failed:
      "I created the request but couldn't reach +{phone} on WhatsApp. Share this link with them directly:\n{url}",
    bot_status_empty: "You have no documents waiting to be signed right now. Send me a PDF to start one.",
    bot_status_header: "Your pending documents:\n",
    bot_dashboard: "Here's your private dashboard link (valid 30 minutes):\n{url}",
    bot_cancelled: "Cancelled. Send me a PDF whenever you're ready to start a new one.",
    bot_error: "Something went wrong on our side — please try that again.",

    // Bot — template flow
    tpl_start: "Let's create a *{title}*.\n\n{description}\n\nI'll ask you a few questions. Reply CANCEL any time.",
    tpl_ask_field: "{label}?",
    tpl_ready:
      "All done — I've prepared your *{title}*.\n\nNow, who's signing it? Send the signer's full name.",

    // Signer — WhatsApp
    sign_notify:
      "{sender} has sent you a document to sign.{message}",
    sign_cta_body:
      "Hi {name}, review and sign here — it takes about 20 seconds, no app or account needed:",
    sign_cta_button: "Review & sign",
    sign_otp_message: "Your Inkline verification code is *{code}*. Enter it on the signing page to continue.",
    sign_done_signer:
      "Signed ✓ — here's your copy. The certificate on the last page is your proof of signing.",
    sign_thanks: "Thanks {first} — all done.",
    sign_sender_complete:
      "✓ Everyone has signed *{filename}*. Here's the completed copy with its certificate. Ref: {ref}",
    sign_sender_progress: "✓ {name} has signed *{filename}*. Waiting on {remaining} more.",
    approve_recorded:
      "Approved ✓ — recorded at {time} UTC. {sender} has been notified.",

    // Signing page
    page_asks: "{sender} asks you to sign",
    page_read: "Read the document ↗",
    page_sign_prompt: "Sign with your finger",
    page_start_again: "Start again",
    page_consent:
      "I am {name} and I agree that my electronic signature is the legal equivalent of my handwritten signature.",
    page_sign_button: "Sign document",
    page_sealing: "Sealing your document…",
    page_otp_prompt: "Enter the 6-digit code we sent to your WhatsApp",
    page_otp_button: "Verify",
    page_otp_wrong: "That code isn't right. Check your WhatsApp and try again.",
    page_done_title: "Signed and sealed",
    page_done_body:
      "Your signed copy of {filename} is on its way to your WhatsApp, certificate included.",
    page_download: "Download your signed copy ↗",
    page_summary_title: "In plain English",
    page_expired: "This signing request has expired.",
    page_invalid: "This signing link is not valid.",
    page_completed: "This document has already been completed.",
    page_waiting: "Thanks — your part is done. This document is waiting on other signers.",
  },
};

export function t(key: string, vars?: Vars, lang: Lang = DEFAULT_LANG): string {
  const table = strings[lang] ?? strings[DEFAULT_LANG];
  return fill(table[key] ?? strings[DEFAULT_LANG][key] ?? key, vars);
}

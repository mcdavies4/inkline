-- Web version. Lets people send documents for signing from the website without
-- Telegram. Web senders and signers are reached by email instead of chat_id.
-- Run once.

-- A signer created on the web has an email, not a Telegram chat. The signing
-- page is already platform-agnostic (it works off sign_token); this just gives
-- us somewhere to deliver the certified copy and, optionally, the invite.
alter table signers add column if not exists email text;

-- The sender's email, so the finished copy can be emailed back to them too.
-- (Telegram senders keep using sender_chat_id; this stays null for them.)
alter table sign_requests add column if not exists sender_email text;

-- Extra recipients (comma-separated) who should receive the finished signed
-- copy but are not signers themselves — e.g. an agent, a co-owner, an archive.
alter table sign_requests add column if not exists cc_emails text;

-- Web accounts are keyed phone_e164 = 'web:<email>' (mirrors the 'tg:<chatId>'
-- scheme). No schema change needed — created_at already exists and is what the
-- 14-day trial is measured from.

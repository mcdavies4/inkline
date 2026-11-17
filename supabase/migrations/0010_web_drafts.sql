-- Web drafts: a signing composed on the website and saved to send later.
-- The PDF is already stored in `documents`; this keeps the rest of the compose
-- state (signers, message, cc) until the sender is ready to send. Run once.

create table if not exists web_drafts (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,                 -- owner of the draft (web account key = web:<email>)
  sender_name text,
  message text,
  cc_emails text,                             -- comma-separated extra recipients
  signers jsonb not null default '[]'::jsonb, -- [{ name, email }]
  document_id uuid references documents(id) on delete set null,
  filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_web_drafts_email on web_drafts(sender_email);

alter table web_drafts enable row level security;

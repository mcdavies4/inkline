-- Bulk "send individually" with placement: a placement token can carry the full
-- batch of signers, so fields placed once on a template request are replicated
-- to one independent copy per signer on save.
alter table placement_tokens add column if not exists batch jsonb;

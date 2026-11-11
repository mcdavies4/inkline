-- Paystack billing. Allow 'paystack' as a provider and store the subscription
-- code + email token so subscriptions can be cancelled via the API. Run once.

alter table accounts drop constraint if exists accounts_provider_check;
alter table accounts add constraint accounts_provider_check
  check (provider = any (array['stripe'::text, 'flutterwave'::text, 'paystack'::text]));

alter table accounts add column if not exists paystack_subscription_code text;
alter table accounts add column if not exists paystack_email_token text;

-- Delivery workers claim queued rows without exposing provider credentials to clients.
alter table public.alert_deliveries
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists next_attempt_at timestamptz not null default timezone('utc', now()),
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid;

create index if not exists alert_deliveries_worker_queue_idx
  on public.alert_deliveries (status, next_attempt_at, claimed_at);

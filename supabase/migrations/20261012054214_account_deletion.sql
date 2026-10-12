-- Account deletion requests are retained without a foreign key to auth.users so
-- the completion record survives the auth-user cascade.
create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  reason text,
  error_code text
);

alter table public.account_deletion_requests enable row level security;
create policy account_deletion_requests_select on public.account_deletion_requests for select to authenticated using (user_id = auth.uid());
create policy account_deletion_requests_insert on public.account_deletion_requests for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.account_deletion_requests to authenticated;

-- Contact invitations are single-purpose, expiring capabilities. They are
-- created/accepted by the private Edge Function, never by the mobile client.
create table public.contact_invitations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  contact_id uuid not null references public.trusted_contacts (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  scope_event_types text[] not null default '{emergency}',
  scope_fields text[] not null default '{event_type,occurred_at,callback_action}',
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'not_configured')),
  delivery_error_code text
);

create index contact_invitations_patient_idx on public.contact_invitations (patient_id, created_at desc);
create index contact_invitations_contact_status_idx on public.contact_invitations (contact_id, status);
create unique index contact_invitations_one_pending_idx on public.contact_invitations (contact_id) where status = 'pending';

alter table public.contact_invitations enable row level security;

-- Patients may review their invitation status; mutation is intentionally private.
create policy contact_invitations_select on public.contact_invitations
  for select to authenticated
  using (private.has_patient_access(patient_id));

grant select on public.contact_invitations to authenticated;

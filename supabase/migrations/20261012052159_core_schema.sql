-- GlucoCare cloud foundation.
-- The mobile app remains local-first: these tables are an optional sync target.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.patients (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  birth_date date,
  locale text not null default 'es-CO',
  timezone text not null default 'America/Bogota',
  glucose_unit text not null default 'mg_dl' check (glucose_unit in ('mg_dl', 'mmol_l')),
  simple_mode boolean not null default false,
  cloud_sync_enabled boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.patient_access (
  patient_id uuid not null references public.patients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'caregiver', 'clinician', 'support_admin')),
  status text not null default 'active' check (status in ('active', 'revoked', 'pending')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (patient_id, user_id)
);
create index patient_access_user_idx on public.patient_access (user_id, status);

create table public.glucose_readings (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  value_original numeric(8, 2) not null check (value_original > 0),
  unit_original text not null check (unit_original in ('mg_dl', 'mmol_l')),
  value_mg_dl numeric(8, 2),
  conversion_version text,
  measured_at timestamptz not null,
  timezone text not null,
  utc_offset_minutes smallint,
  recorded_at timestamptz not null default timezone('utc', now()),
  time_edited boolean not null default false,
  context text not null check (context in ('fasting', 'before_meal', 'after_meal', 'bedtime', 'symptoms', 'other')),
  meal_offset_minutes integer,
  source text not null default 'manual' check (source in ('manual', 'import', 'cgm', 'glucometer')),
  symptoms text[] not null default '{}',
  note text,
  care_plan_revision_id uuid,
  classification text,
  rule_id text,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);
create index glucose_readings_patient_measured_idx on public.glucose_readings (patient_id, measured_at desc);

create table public.care_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  effective_from timestamptz not null,
  effective_to timestamptz,
  target_bands jsonb not null default '{}'::jsonb,
  urgent_rules jsonb not null default '[]'::jsonb,
  symptom_actions jsonb not null default '[]'::jsonb,
  author_name text,
  source text,
  reviewed_at timestamptz,
  clinician_verified boolean not null default false,
  content_locale text not null default 'es-CO',
  created_at timestamptz not null default timezone('utc', now()),
  unique (patient_id, revision_number)
);

create table public.measurement_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  readings_per_day smallint not null check (readings_per_day between 1 and 3),
  times_json jsonb not null default '[]'::jsonb,
  instructions text,
  effective_from timestamptz not null default timezone('utc', now()),
  effective_to timestamptz,
  source text not null default 'patient_entered',
  clinician_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (patient_id, revision_number)
);

create table public.measurement_occurrences (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  plan_revision_id uuid not null references public.measurement_plan_revisions (id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'planned' check (status in ('planned', 'due', 'completed', 'skipped', 'expired')),
  completed_reading_id uuid references public.glucose_readings (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (plan_revision_id, scheduled_at)
);

create table public.medications (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null,
  dose_text text not null,
  route text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.medication_schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  times_json jsonb not null default '[]'::jsonb,
  timezone text not null default 'America/Bogota',
  effective_from timestamptz not null default timezone('utc', now()),
  effective_to timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (medication_id, revision_number)
);

create table public.medication_occurrences (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  medication_id uuid not null references public.medications (id) on delete cascade,
  schedule_revision_id uuid not null references public.medication_schedule_revisions (id) on delete restrict,
  scheduled_at timestamptz not null,
  status text not null default 'due' check (status in ('due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded')),
  acted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (schedule_revision_id, scheduled_at)
);
create index medication_occurrences_patient_schedule_idx on public.medication_occurrences (patient_id, status, scheduled_at);

create table public.trusted_contacts (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null,
  relationship text,
  phone text,
  email text,
  consent_status text not null default 'pending' check (consent_status in ('invited', 'accepted', 'revoked', 'expired', 'pending')),
  allowed_event_types text[] not null default '{emergency}',
  allowed_fields text[] not null default '{event_type,occurred_at,callback_action}',
  quiet_hours jsonb not null default '{}'::jsonb,
  consent_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (phone is not null or email is not null)
);

create table public.emergency_cards (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  full_name text not null,
  birth_date date,
  diabetes_type text,
  allergies text,
  care_provider text,
  emergency_notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table public.emergency_incidents (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  timezone text not null,
  trigger text not null default 'manual' check (trigger in ('manual', 'risk_rule')),
  symptom_codes text[] not null default '{}',
  reading_id uuid references public.glucose_readings (id) on delete set null,
  location jsonb,
  call_attempted boolean not null default false,
  resolution_note text,
  closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.alert_deliveries (
  id uuid primary key,
  incident_id uuid not null references public.emergency_incidents (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  contact_id uuid not null references public.trusted_contacts (id) on delete cascade,
  channel text not null check (channel in ('push', 'email', 'sms', 'voice')),
  status text not null default 'queued' check (status in ('queued', 'provider_accepted', 'delivered', 'failed', 'unknown', 'acknowledged')),
  provider_event_id text,
  queued_at timestamptz not null default timezone('utc', now()),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  failure_code text,
  unique (incident_id, contact_id, channel)
);

create table public.appointments (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  title text not null,
  provider text not null,
  specialty text,
  insurer text,
  facility text,
  authorization_number text,
  status text not null check (status in ('requested', 'pending_authorization', 'authorized', 'scheduled', 'completed', 'missed', 'denied', 'cancelled')),
  requested_at timestamptz,
  authorized_at timestamptz,
  scheduled_at timestamptz,
  location text,
  virtual_url text,
  preparation_notes text,
  reminder_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);
create index appointments_patient_schedule_idx on public.appointments (patient_id, status, scheduled_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  occurred_at timestamptz not null default timezone('utc', now()),
  reason text,
  before_data jsonb,
  after_data jsonb,
  device_id text
);

create table public.outbox_events (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  schema_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  status text not null default 'pending' check (status in ('pending', 'sending', 'acked', 'failed', 'dead_letter')),
  created_at timestamptz not null default timezone('utc', now()),
  acknowledged_at timestamptz
);
create index outbox_pending_idx on public.outbox_events (status, next_attempt_at);

create or replace function private.has_patient_access(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_access
    where patient_id = p_patient_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function private.is_patient_owner(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patient_access
    where patient_id = p_patient_id and user_id = auth.uid() and role = 'owner' and status = 'active'
  );
$$;

create or replace function private.provision_patient_owner_access()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.patient_access (patient_id, user_id, role, status)
  values (new.id, new.id, 'owner', 'active')
  on conflict (patient_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists provision_patient_owner_access on public.patients;
create trigger provision_patient_owner_access
after insert on public.patients
for each row execute function private.provision_patient_owner_access();

alter table public.patients enable row level security;
alter table public.patient_access enable row level security;
alter table public.glucose_readings enable row level security;
alter table public.care_plan_revisions enable row level security;
alter table public.measurement_plan_revisions enable row level security;
alter table public.measurement_occurrences enable row level security;
alter table public.medications enable row level security;
alter table public.medication_schedule_revisions enable row level security;
alter table public.medication_occurrences enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.emergency_cards enable row level security;
alter table public.emergency_incidents enable row level security;
alter table public.alert_deliveries enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_events enable row level security;
alter table public.outbox_events enable row level security;

create policy patients_select on public.patients for select to authenticated using (id = auth.uid() or private.has_patient_access(id));
create policy patients_insert on public.patients for insert to authenticated with check (id = auth.uid());
create policy patients_update on public.patients for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy patient_access_select on public.patient_access for select to authenticated using (user_id = auth.uid() or private.has_patient_access(patient_id));
create policy patient_access_insert on public.patient_access for insert to authenticated with check (private.is_patient_owner(patient_id));
create policy patient_access_update on public.patient_access for update to authenticated using (private.is_patient_owner(patient_id) or user_id = auth.uid()) with check (private.is_patient_owner(patient_id) or user_id = auth.uid());

create policy glucose_readings_access on public.glucose_readings for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy care_plan_revisions_access on public.care_plan_revisions for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy measurement_plan_revisions_access on public.measurement_plan_revisions for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy measurement_occurrences_access on public.measurement_occurrences for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy medications_access on public.medications for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy medication_schedule_revisions_access on public.medication_schedule_revisions for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy medication_occurrences_access on public.medication_occurrences for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy trusted_contacts_access on public.trusted_contacts for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy emergency_cards_access on public.emergency_cards for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy emergency_incidents_access on public.emergency_incidents for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy alert_deliveries_access on public.alert_deliveries for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy appointments_access on public.appointments for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));
create policy audit_events_access on public.audit_events for select to authenticated using (private.has_patient_access(patient_id));
create policy outbox_events_access on public.outbox_events for all to authenticated using (private.has_patient_access(patient_id)) with check (private.has_patient_access(patient_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on schema private from anon, authenticated;

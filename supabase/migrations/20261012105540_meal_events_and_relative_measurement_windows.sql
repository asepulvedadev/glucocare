-- Record explicit meal times so relative measurement windows never infer or guess
-- a meal that the patient did not enter.
create table public.meal_events (
  id uuid primary key,
  patient_id uuid not null references public.patients (id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  occurred_at timestamptz not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index meal_events_patient_occurred_idx on public.meal_events (patient_id, occurred_at desc);
create index meal_events_patient_updated_idx on public.meal_events (patient_id, updated_at);

alter table public.measurement_plan_revisions
  add column if not exists windows_json jsonb not null default '[]'::jsonb;

alter table public.measurement_occurrences
  add column if not exists window_index smallint,
  add column if not exists meal_event_id uuid references public.meal_events (id) on delete set null;

alter table public.measurement_occurrences
  drop constraint if exists measurement_occurrences_window_index_check;

alter table public.measurement_occurrences
  add constraint measurement_occurrences_window_index_check
  check (window_index is null or window_index >= 0);

alter table public.meal_events enable row level security;

create policy meal_events_select on public.meal_events
  for select to authenticated using (private.has_patient_access(patient_id));
create policy meal_events_insert on public.meal_events
  for insert to authenticated with check (private.is_patient_owner(patient_id));
create policy meal_events_update on public.meal_events
  for update to authenticated using (private.is_patient_owner(patient_id)) with check (private.is_patient_owner(patient_id));
create policy meal_events_delete on public.meal_events
  for delete to authenticated using (private.is_patient_owner(patient_id));

drop trigger if exists set_updated_at_meal_events on public.meal_events;
create trigger set_updated_at_meal_events
  before update on public.meal_events
  for each row execute function private.set_updated_at();

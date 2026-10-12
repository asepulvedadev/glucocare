-- Keep mutable cloud projections observable by cursor-based clients.

alter table public.medication_occurrences
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.measurement_occurrences
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists medication_occurrences_patient_updated_idx
  on public.medication_occurrences (patient_id, updated_at);

create index if not exists measurement_occurrences_patient_updated_idx
  on public.measurement_occurrences (patient_id, updated_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', clock_timestamp());
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'patients',
    'patient_access',
    'glucose_readings',
    'medications',
    'measurement_occurrences',
    'medication_occurrences',
    'trusted_contacts',
    'emergency_cards',
    'appointments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at_' || target_table, target_table);
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      'set_updated_at_' || target_table,
      target_table
    );
  end loop;
end;
$$;

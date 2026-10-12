-- Preserve the source and validity window of clinician-provided medication instructions.
-- These fields are descriptive only: GlucoCare never changes a dose.
alter table public.medications
  add column if not exists prescriber_name text,
  add column if not exists instructions text,
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.medications
  drop constraint if exists medications_validity_window_check;

alter table public.medications
  add constraint medications_validity_window_check
  check (start_date is null or end_date is null or start_date <= end_date);

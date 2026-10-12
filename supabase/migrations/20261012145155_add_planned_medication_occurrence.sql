-- Keep future doses visible without allowing them to be acknowledged early.
alter table public.medication_occurrences
  drop constraint if exists medication_occurrences_status_check;

alter table public.medication_occurrences
  add constraint medication_occurrences_status_check
  check (status in ('planned', 'due', 'taken', 'skipped', 'snoozed', 'expired', 'not_recorded'));

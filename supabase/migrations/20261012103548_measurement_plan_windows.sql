-- Support weekday exceptions and temporary measurement plans without guessing a schedule.
alter table public.measurement_plan_revisions
  add column if not exists weekdays_json jsonb not null default '[1,2,3,4,5,6,7]'::jsonb,
  add column if not exists effective_from date,
  add column if not exists effective_to date;

alter table public.measurement_plan_revisions
  drop constraint if exists measurement_plan_validity_window_check;

alter table public.measurement_plan_revisions
  add constraint measurement_plan_validity_window_check
  check (effective_from is null or effective_to is null or effective_from <= effective_to);

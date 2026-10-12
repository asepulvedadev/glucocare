-- Preserve a structured, user-entered ketone strip result without interpreting it.
alter table public.glucose_readings
  add column if not exists ketone_result text not null default 'not_checked';

alter table public.glucose_readings
  drop constraint if exists glucose_readings_ketone_result_check;

alter table public.glucose_readings
  add constraint glucose_readings_ketone_result_check
  check (ketone_result in ('not_checked', 'negative', 'trace', 'small', 'moderate', 'large', 'unknown'));

alter table public.glucose_readings
  drop constraint if exists glucose_readings_context_check;

alter table public.glucose_readings
  add constraint glucose_readings_context_check
  check (context in ('fasting', 'before_meal', 'after_meal', 'bedtime', 'exercise', 'illness', 'symptoms', 'other'));

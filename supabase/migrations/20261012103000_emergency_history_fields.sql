-- Keep the offline emergency card useful to a nearby helper without making it a clinical record.
alter table public.emergency_cards
  add column if not exists diagnosis_year text,
  add column if not exists insulin_use text check (insulin_use in ('yes', 'no', 'unknown')),
  add column if not exists critical_conditions text,
  add column if not exists insurer text,
  add column if not exists policy_number text;

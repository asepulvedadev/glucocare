-- Store the clinician/user-provided context for each fixed measurement time.
-- The context is descriptive; the app does not infer a meal or clinical result.
alter table public.measurement_plan_revisions
  add column if not exists timings_json jsonb not null default '[]'::jsonb;

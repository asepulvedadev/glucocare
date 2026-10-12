-- Keep the emergency card useful when a responder needs to know where the
-- patient is normally attended, without making a facility mandatory.
alter table public.emergency_cards
  add column if not exists care_facility text;

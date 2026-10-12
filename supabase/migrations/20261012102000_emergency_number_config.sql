-- Let each patient verify the emergency number and region used by the offline help flow.
alter table public.emergency_cards
  add column if not exists emergency_number text,
  add column if not exists emergency_region text;

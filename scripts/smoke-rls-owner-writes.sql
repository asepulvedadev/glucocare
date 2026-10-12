-- CI-only RLS smoke test. Delegated users can read but cannot mutate records.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'owner-smoke@example.com', 'not-a-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'caregiver-smoke@example.com', 'not-a-password', '{}', '{}', now(), now());

insert into public.patients (id, display_name)
values ('00000000-0000-0000-0000-000000000011', 'RLS smoke test');

insert into public.patient_access (patient_id, user_id, role, status)
values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012', 'caregiver', 'active');

insert into public.glucose_readings (id, patient_id, value_original, unit_original, measured_at, timezone, context)
values ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000011', 100, 'mg_dl', now(), 'America/Bogota', 'fasting');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);

do $$
declare
  visible_rows integer;
  changed_rows integer;
begin
  select count(*) into visible_rows
  from public.glucose_readings
  where id = '00000000-0000-0000-0000-000000000013';
  if visible_rows <> 1 then
    raise exception 'caregiver cannot read an active patient record';
  end if;

  update public.glucose_readings set note = 'unauthorized' where id = '00000000-0000-0000-0000-000000000013';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'caregiver mutated a patient record';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
update public.glucose_readings set note = 'owner update' where id = '00000000-0000-0000-0000-000000000013';

do $$
begin
  if not exists (select 1 from public.glucose_readings where id = '00000000-0000-0000-0000-000000000013' and note = 'owner update') then
    raise exception 'owner update was rejected';
  end if;
end;
$$;

rollback;

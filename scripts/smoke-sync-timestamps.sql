-- CI-only smoke test for cursor-visible updates. The transaction is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'sync-smoke@example.com', 'not-a-password', '{}', '{}', now(), now());

insert into public.patients (id, display_name)
values ('00000000-0000-0000-0000-000000000001', 'Cursor smoke test');

insert into public.medications (id, patient_id, name, dose_text, route)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Smoke test', '1', 'oral');

insert into public.medication_schedule_revisions (medication_id, patient_id, revision_number, times_json)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 1, '["08:00"]');

insert into public.medication_occurrences (id, patient_id, medication_id, schedule_revision_id, scheduled_at)
select '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', id, now()
from public.medication_schedule_revisions
where medication_id = '00000000-0000-0000-0000-000000000002';

do $$
declare
  before_update timestamptz;
  after_update timestamptz;
begin
  select updated_at into before_update
  from public.medication_occurrences
  where id = '00000000-0000-0000-0000-000000000003';

  perform pg_sleep(0.01);
  update public.medication_occurrences
  set status = 'taken'
  where id = '00000000-0000-0000-0000-000000000003';

  select updated_at into after_update
  from public.medication_occurrences
  where id = '00000000-0000-0000-0000-000000000003';

  if after_update <= before_update then
    raise exception 'updated_at trigger did not advance: % -> %', before_update, after_update;
  end if;
end;
$$;

rollback;

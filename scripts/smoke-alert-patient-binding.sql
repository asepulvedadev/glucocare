-- CI-only smoke test for emergency alert patient binding. The transaction is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'alert-binding-patient-one@example.com', 'not-a-password', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'alert-binding-patient-two@example.com', 'not-a-password', '{}', '{}', now(), now());

insert into public.patients (id, display_name)
values
  ('00000000-0000-0000-0000-000000000031', 'Alert binding patient one'),
  ('00000000-0000-0000-0000-000000000032', 'Alert binding patient two');

insert into public.trusted_contacts (id, patient_id, name, phone, consent_status)
values ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000031', 'Alert binding contact', '+573001234567', 'accepted');

insert into public.emergency_incidents (id, patient_id, timezone)
values ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000031', 'America/Bogota');

insert into public.alert_deliveries (id, incident_id, patient_id, contact_id, channel)
values ('00000000-0000-0000-0000-000000000035', '00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000033', 'sms');

do $$
begin
  begin
    insert into public.alert_deliveries (id, incident_id, patient_id, contact_id, channel)
    values ('00000000-0000-0000-0000-000000000036', '00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000033', 'email');
    raise exception 'cross-patient alert delivery insert unexpectedly succeeded';
  exception when foreign_key_violation then
    null;
  end;
end;
$$;

rollback;

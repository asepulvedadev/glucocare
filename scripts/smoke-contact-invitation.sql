-- CI-only smoke test for trusted-contact invitation isolation. The transaction is rolled back.
begin;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'contact-invitation-smoke@example.com', 'not-a-password', '{}', '{}', now(), now());

insert into public.patients (id, display_name)
values ('00000000-0000-0000-0000-000000000021', 'Invitation smoke test');

insert into public.trusted_contacts (id, patient_id, name, email, consent_status)
values ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000021', 'Support contact', 'support@example.com', 'pending');

insert into public.contact_invitations (id, patient_id, contact_id, channel, token_hash, expires_at)
values ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', 'email', 'smoke-token-hash', now() + interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);

do $$
declare
  visible_rows integer;
  changed_rows integer;
  insert_allowed boolean := false;
begin
  select count(*) into visible_rows
  from public.contact_invitations
  where id = '00000000-0000-0000-0000-000000000023';
  if visible_rows <> 1 then
    raise exception 'owner cannot review invitation status';
  end if;

  update public.contact_invitations set status = 'accepted' where id = '00000000-0000-0000-0000-000000000023';
  get diagnostics changed_rows = row_count;
  if changed_rows <> 0 then
    raise exception 'owner mutated invitation status outside the private function';
  end if;

  begin
    insert into public.contact_invitations (patient_id, contact_id, channel, token_hash, expires_at)
    values ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000022', 'email', 'second-token-hash', now() + interval '1 hour');
    insert_allowed := true;
  exception when insufficient_privilege then
    null;
  end;
  if insert_allowed then
    raise exception 'owner inserted an invitation outside the private function';
  end if;
end;
$$;

rollback;

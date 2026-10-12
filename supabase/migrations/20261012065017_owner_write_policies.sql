-- Patient access is read-oriented for delegated users. Only the patient owner
-- may mutate health records in the MVP; trusted alerts are created by private
-- Edge Functions with the service role.

do $$
declare
  target_table text;
  policy_suffix text;
begin
  foreach target_table in array array[
    'glucose_readings',
    'care_plan_revisions',
    'measurement_plan_revisions',
    'measurement_occurrences',
    'medications',
    'medication_schedule_revisions',
    'medication_occurrences',
    'trusted_contacts',
    'emergency_cards',
    'emergency_incidents',
    'appointments',
    'outbox_events'
  ] loop
    foreach policy_suffix in array array['access', 'select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', target_table || '_' || policy_suffix, target_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_patient_access(patient_id))',
      target_table || '_select', target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.is_patient_owner(patient_id))',
      target_table || '_insert', target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.is_patient_owner(patient_id)) with check (private.is_patient_owner(patient_id))',
      target_table || '_update', target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.is_patient_owner(patient_id))',
      target_table || '_delete', target_table
    );
  end loop;
end;
$$;

drop policy if exists alert_deliveries_access on public.alert_deliveries;
create policy alert_deliveries_select on public.alert_deliveries
  for select to authenticated using (private.has_patient_access(patient_id));

drop policy if exists audit_events_access on public.audit_events;
create policy audit_events_select on public.audit_events
  for select to authenticated using (private.has_patient_access(patient_id));

revoke insert, update, delete on public.alert_deliveries from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;

-- Keep alert deliveries bound to the same patient as their incident. A plain
-- incident_id foreign key does not prevent a service-role path from inserting
-- a delivery row with another patient's patient_id.
alter table public.emergency_incidents
  add constraint emergency_incidents_id_patient_key unique (id, patient_id);

alter table public.alert_deliveries
  drop constraint if exists alert_deliveries_incident_id_fkey;

alter table public.alert_deliveries
  add constraint alert_deliveries_incident_patient_fkey
  foreign key (incident_id, patient_id)
  references public.emergency_incidents (id, patient_id)
  on delete cascade;

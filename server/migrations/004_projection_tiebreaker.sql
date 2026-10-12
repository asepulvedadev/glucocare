ALTER TABLE health_records ADD COLUMN IF NOT EXISTS projection_event_id uuid;
CREATE INDEX IF NOT EXISTS health_records_projection_event_idx
  ON health_records (patient_id, entity_type, entity_id, updated_at, projection_event_id);

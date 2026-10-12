ALTER TABLE emergency_alerts DROP CONSTRAINT IF EXISTS emergency_alerts_status_check;
ALTER TABLE emergency_alerts ADD CONSTRAINT emergency_alerts_status_check
  CHECK (status IN ('queued', 'not_configured', 'provider_accepted', 'failed', 'unknown'));

ALTER TABLE alert_deliveries DROP CONSTRAINT IF EXISTS alert_deliveries_status_check;
ALTER TABLE alert_deliveries ADD CONSTRAINT alert_deliveries_status_check
  CHECK (status IN ('queued', 'processing', 'not_configured', 'provider_accepted', 'delivered', 'failed', 'unknown'));

ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE alert_deliveries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS alert_deliveries_queue_idx
  ON alert_deliveries (status, next_attempt_at, queued_at);

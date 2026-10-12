CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_idx ON app_users (lower(email));

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS health_records (
  patient_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  projection_event_id uuid,
  deleted_at timestamptz,
  PRIMARY KEY (patient_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS health_records_cursor_idx ON health_records (patient_id, updated_at, entity_type);

CREATE TABLE IF NOT EXISTS sync_events (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_events_patient_idx ON sync_events (patient_id, created_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_patient_idx ON audit_events (patient_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS emergency_alerts (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  incident_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'not_configured', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, incident_id)
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id uuid PRIMARY KEY,
  alert_id uuid NOT NULL REFERENCES emergency_alerts(id) ON DELETE CASCADE,
  contact_id text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'not_configured', 'failed')),
  queued_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failure_code text
);

CREATE TABLE IF NOT EXISTS contact_invitations (
  id uuid PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  contact_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS contact_invitations_patient_idx ON contact_invitations (patient_id, contact_id, status);

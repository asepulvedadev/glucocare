-- This table intentionally has no foreign key to app_users: the minimal,
-- pseudonymous deletion evidence must survive the account cascade.
CREATE TABLE IF NOT EXISTS account_deletion_events (
  id uuid PRIMARY KEY,
  user_id_hash text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_deletion_events_requested_idx
  ON account_deletion_events (requested_at DESC);

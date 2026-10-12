# Operations and observability

## Operational goal

Detect failures that threaten data integrity, reminders, alert delivery, privacy, or access—without collecting the clinical data the system is meant to protect.

## Environments

- **Local:** emulator/device and local PostgreSQL/API containers; synthetic data only.
- **Preview:** isolated backend per change where practical; synthetic fixtures.
- **Staging:** production-like policies/providers in sandbox mode; no real patient data.
- **Production:** least privilege, audited access, protected branches, reviewed migrations.

Never copy production health data into lower environments.

## Safe telemetry

Allowed examples:

- App version, OS version, device class.
- Route identifier and performance duration.
- Database schema version and migration result code.
- Outbox pending count/age without event payload.
- Notification scheduling result and generic failure category.
- Alert provider status keyed by random correlation ID.
- Crash stack after automated/manual sensitive-data review.

Prohibited examples:

- Glucose values, medication names/doses, symptoms, diagnosis.
- Contact email/phone, insurance/member number.
- Full request/response bodies, auth tokens, location coordinates.
- Free-text notes.

## Secret and dependency hygiene

- CI runs `scripts/scan-secrets.py` against every tracked text file and blocks
  high-confidence private-key, provider-token, and hard-coded credential
  patterns.
- Environment-variable references are allowed; their values must exist only in
  VPS secret storage (`/srv/glucocare/.env`).
- This scan is a guardrail, not proof of safety: rotate credentials after any
  suspected exposure and review dependency advisories before a release.

## Service-level indicators

| SLI | Initial objective |
|---|---:|
| Crash-free sessions | ≥ 99.8% monthly |
| Successful local clinical writes | ≥ 99.99% |
| Outbox events acknowledged within 15 min when online | ≥ 99% |
| Remote alert requests accepted by provider within 60 s | ≥ 99% |
| Account deletion completed within published window | 100% |
| Critical security patches deployed within policy window | 100% |

Provider acceptance is not end-recipient delivery. Keep these metrics separate.

## Alerts

Page an operator for:

- Sustained failure of clinical record writes or migrations.
- Emergency alert dispatch failure above threshold.
- Authentication/RLS anomaly or suspected cross-patient access.
- Backup failure or restore-test failure.
- Sudden crash increase in emergency, glucose, or medication routes.
- Queue backlog exceeding its safety window.

Ticket/non-page:

- Noncritical export latency.
- Individual permission denial.
- Isolated provider transient failure already surfaced to user.

## Runbooks required before beta

The actionable procedures are in [Incident runbooks](13-incident-runbooks.md).
They cover provider outage, VPS/PostgreSQL outage, migration rollback, breach,
credential rotation, deletion/export, unsafe clinical content, and critical
mobile updates. A runbook is not considered exercised until its checklist has a
dated tabletop or staging result.

Each runbook identifies owner, detection, containment, user messaging, recovery, verification, and post-incident review.

## Backups and restore

- Define RPO/RTO after business impact analysis.
- Encrypt backups and restrict access.
- Test restore at least quarterly before launch, then at a documented cadence.
- Verify RLS and encryption settings after restore.
- Record evidence without patient payloads.
- Ensure deletion commitments include backup expiration behavior.

For the current static VPS staging deployment, each successful release retains
the three most recent bundles in `/srv/glucocare/releases`. The checked-in
`deploy/vps/glucocare-rollback` command rehydrates one of those bundles, rebuilds
the Compose project, and restores the previous bundle if the synthetic health
check fails. This is a deployment rollback cache, not a backup of local mobile
records or PostgreSQL data; encrypted PostgreSQL backups and user-controlled
exports remain the recovery sources for those datasets.

The checked-in `deploy/vps/glucocare-healthcheck` script is payload-free. It
checks container health, both localhost health endpoints, the COOP/COEP
headers needed by the web SQLite worker, and the age-bounded alert queue
backlog. Install its systemd timer before beta; the timer is a detection
mechanism, not a substitute for on-call alerting.

The API records alert requests and delivery states on the VPS. The private
worker is deployed with email and SMS adapters disabled by default; operators
must provide reviewed credentials before enabling either channel. Until then no
delivery is claimed and the mobile app shows the queued/unavailable state.
The worker writes a heartbeat only after a complete database/provider polling
tick; its container health check becomes unhealthy when that heartbeat is older
than two minutes, instead of treating a merely running process as healthy.
If the worker stops after claiming a delivery, the two-minute lease expires and
the next tick reclaims that delivery. This prevents a crashed process from
leaving an alert permanently stuck in `processing`; the worker smoke test
exercises this recovery path.

The checked-in `deploy/vps/glucocare-db-backup` command creates a mode-600
PostgreSQL custom-format dump under `/srv/glucocare/backups`. Its daily systemd
timer keeps 30 days locally; operations must also copy the dumps to encrypted
off-host storage and exercise a restore before beta. The backup command never
logs database credentials or clinical payloads.

`deploy/vps/glucocare-db-restore-check` exercises the newest dump in a
disposable database, verifies the migration table, and drops the temporary
database. It is safe for scheduled restore drills but does not replace a
reviewed disaster-recovery runbook.

## Release strategy

- Internal dogfood with synthetic data.
- Closed clinical/usability pilot.
- Staged mobile rollout with crash/safety monitoring.
- Feature flags only for non-safety behavior unless the flag system itself is validated and audited.
- Preserve previous app/backend compatibility during rollback window.
- Clinical rule/content changes have independent version and rollback.

## Support

- In-app support path clearly states that support is not an emergency service.
- Support identity verification does not ask users to email health screenshots by default.
- Staff use approved redaction/secure-upload workflows.
- Clinical questions are routed to the patient’s care team; support does not improvise medical advice.

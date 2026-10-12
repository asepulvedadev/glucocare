# Operations and observability

## Operational goal

Detect failures that threaten data integrity, reminders, alert delivery, privacy, or access—without collecting the clinical data the system is meant to protect.

## Environments

- **Local:** emulator/device and local Supabase; synthetic data only.
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

1. Notification provider outage.
2. Supabase outage or degraded auth/database.
3. Failed database migration/app rollback.
4. Suspected data breach or cross-patient access.
5. Lost signing key or leaked credential.
6. Account deletion/export failure.
7. Clinically unsafe content/rule rollback.
8. App-store forced update for critical safety fix.

Each runbook identifies owner, detection, containment, user messaging, recovery, verification, and post-incident review.

## Backups and restore

- Define RPO/RTO after business impact analysis.
- Encrypt backups and restrict access.
- Test restore at least quarterly before launch, then at a documented cadence.
- Verify RLS and encryption settings after restore.
- Record evidence without patient payloads.
- Ensure deletion commitments include backup expiration behavior.

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

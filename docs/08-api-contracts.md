# API and event contracts

## Contract rules

- HTTPS JSON APIs are versioned under `/v1`.
- Every write accepts `Idempotency-Key` and a client-generated entity/event ID.
- Every payload includes `schemaVersion` when persisted in the outbox.
- Dates are ISO 8601 UTC instants; local timezone is a separate IANA field.
- Errors use stable machine codes plus safe, localized client copy.
- Client-provided patient IDs never bypass authorization derived from the authenticated relationship.
- Clinical values are not placed in URLs, query strings, tracing baggage, or provider metadata.

## Authentication model

- Core local mode: no cloud API required.
- Sync mode: revocable VPS API session stored in SecureStore.
- Privileged dispatch: the VPS API verifies the session, contact ownership, accepted invitation, and request schema.
- Trusted-contact acknowledgement: a short-lived invitation token changes consent state; it grants no record access.

## Representative endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v1/auth/signup` / `/v1/auth/signin` | Create or open a revocable VPS API session. |
| `POST` | `/v1/sync/events` | Idempotent upload of one local outbox event. |
| `GET` | `/v1/sync?since=...` | Pull the patient-scoped record projection after a cursor. |
| `POST` | `/v1/contact-invitations` | Send verified contact invitation. |
| `GET` | `/v1/contact-invitations/accept?token=...` | Accept scoped contact consent. |
| `GET` | `/v1/contact-invitations` | Read the patient's pending/accepted invitation states. |
| `POST` | `/v1/contact-invitations/revoke` | Revoke a contact invitation and future alerts. |
| `POST` | `/v1/emergency-alerts` | Queue alerts only for accepted contacts. |
| `GET` | `/v1/emergency-alerts/{incidentId}/deliveries` | Read delivery states for the patient's incident. |
| `DELETE` | `/v1/account` | Start verified account deletion workflow. |

CRUD for health records passes through the versioned VPS API; sensitive multi-step actions remain server-side and the API scopes every query by the authenticated patient.

## Emergency alert request

```json
{
  "schemaVersion": 1,
  "incidentId": "01J...",
  "patientId": "01J...",
  "occurredAt": "2026-10-12T03:20:00Z",
  "timezone": "America/Bogota",
  "contactIds": ["01J..."],
  "channels": ["push", "email"],
  "share": {
    "eventType": true,
    "location": false,
    "glucoseValue": false
  }
}
```

Response `202 Accepted` means queued, not delivered. A private VPS worker later
transitions each channel to `provider_accepted`, `not_configured`, or `failed`;
provider acceptance still does not prove that a person read the message. The
API returns `400 INVALID_ALERT_CONTACTS` unless every contact has a non-expired
accepted invitation:

```json
{
  "alertId": "01J...",
  "status": "queued",
  "deliveries": [
    {"contactId": "01J...", "channel": "email", "status": "queued"}
  ]
}
```

## Sync event upload and pull

```json
{
  "schemaVersion": 1,
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "glucose.reading.recorded.v1",
  "entityType": "glucose_reading",
  "entityId": "01J...",
  "payload": {}
}
```

The server returns `accepted` or `already_accepted`. Reusing an event UUID
with different data returns `409 IDEMPOTENCY_CONFLICT`; one invalid event does
not make the client discard unrelated valid local writes. Pull responses return
`{ "until": "...", "records": [...] }` and are filtered by the authenticated
patient.

## Domain event catalog

| Event | Notes |
|---|---|
| `glucose.reading.recorded.v1` | Append-only; includes original/canonical unit values. |
| `glucose.reading.corrected.v1` | References original and audit reason. The VPS API persists the immutable audit event in PostgreSQL; retries reuse the outbox event UUID. |
| `care_plan.revision.activated.v1` | Immutable revision and effective time. |
| `medication.occurrence.responded.v1` | Due/snoozed occurrence taken, skipped, snoozed, or marked not recorded with user time; planned doses first emit a due event at their scheduled instant. |
| `appointment.updated.v1` | Replaces editable appointment details and reschedules the local reminder. |
| `appointment.status_changed.v1` | Enforces legal transition. |
| `contact.updated.v1` | Replaces contact details and requires consent confirmation again. |
| `contact.consent_changed.v1` | Accepted/revoked and scopes. |
| `emergency.incident.started.v1` | Minimal incident record. |
| `emergency.alert.status_changed.v1` | Provider status, not clinical state. |

When a `trusted_contact` event carries `revoked: true` (for example after a
contact edit, deletion, or privacy-consent withdrawal), the API revokes that
contact's pending and accepted invitations in the same transaction as the
health-record projection. A stale invitation therefore cannot authorize a
later emergency alert.

## Error envelope

```json
{
  "error": {
    "code": "INVALID_ALERT_CONTACTS",
    "message": "Uno o más contactos no tienen una invitación aceptada.",
    "retryable": false,
    "correlationId": "safe-random-id"
  }
}
```

Do not return another patient’s existence or sensitive record details in errors.

## Idempotency

- Server binds key to authenticated actor, endpoint, and request hash.
- Repeating the same key/payload returns the original result.
- Reusing a key with a different payload returns `409 IDEMPOTENCY_CONFLICT`.
- Retention covers the maximum client retry window.
- Provider callbacks are deduplicated by provider event ID.

## Rate limits

- Stricter limits for invitations, invitation acceptance, contact alerts, and login are enforced in the single VPS API process; export/acknowledgement limits remain required when those routes are added.
- Emergency alert limiting prevents abuse but must return a direct-call fallback rather than a dead end.
- Limit response includes safe retry timing; never expose internal provider details.

## Compatibility policy

- Additive fields are optional for older clients.
- Removing/renaming fields requires a new schema/API version.
- Server supports at least the current and previous supported app contract during forced-update grace periods.
- Clinical content versioning is independent of API versioning.

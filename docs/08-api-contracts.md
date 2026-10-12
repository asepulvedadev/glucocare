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
- Sync mode: Supabase Auth session stored in SecureStore.
- Privileged dispatch: Edge Function verifies JWT, consent, relationship, and request schema.
- Trusted-contact acknowledgement: short-lived, single-purpose signed token; it grants no record access.

## Representative endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v1/sync/batch` | Idempotent upload/download cursor exchange. |
| `POST` | `/v1/contact-invitations` | Send verified contact invitation. |
| `POST` | `/v1/contact-invitations/{token}/accept` | Accept scoped contact consent. |
| `POST` | `/v1/emergency-alerts` | Dispatch consented contact alerts. |
| `POST` | `/v1/emergency-alerts/{token}/acknowledge` | Contact acknowledgement. |
| `POST` | `/v1/exports` | Request encrypted report generation if server-side export is enabled. |
| `DELETE` | `/v1/account` | Start verified account deletion workflow. |

CRUD for health records should prefer Supabase Data API with strict RLS where appropriate; sensitive multi-step actions use server functions.

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

Response `202 Accepted` means queued, not delivered:

```json
{
  "alertId": "01J...",
  "status": "queued",
  "deliveries": [
    {"contactId": "01J...", "channel": "email", "status": "queued"}
  ]
}
```

## Sync batch

```json
{
  "schemaVersion": 1,
  "deviceId": "device-public-id",
  "cursor": "opaque-server-cursor",
  "events": [
    {
      "id": "01J...",
      "type": "glucose.reading.recorded",
      "occurredAt": "2026-10-12T03:15:00Z",
      "aggregateId": "01J...",
      "aggregateVersion": 1,
      "payload": {}
    }
  ]
}
```

Server returns per-event acceptance/rejection and an opaque next cursor. One invalid event must not make the client discard unrelated valid local writes.

## Domain event catalog

| Event | Notes |
|---|---|
| `glucose.reading.recorded.v1` | Append-only; includes original/canonical unit values. |
| `glucose.reading.corrected.v1` | References original and audit reason. Mobile sync persists the immutable cloud audit through the private `record-glucose-audit` function; retries reuse the outbox event UUID. |
| `care_plan.revision.activated.v1` | Immutable revision and effective time. |
| `medication.occurrence.responded.v1` | Taken/skipped/snoozed with user time. |
| `appointment.updated.v1` | Replaces editable appointment details and reschedules the local reminder. |
| `appointment.status_changed.v1` | Enforces legal transition. |
| `contact.updated.v1` | Replaces contact details and requires consent confirmation again. |
| `contact.consent_changed.v1` | Accepted/revoked and scopes. |
| `emergency.incident.started.v1` | Minimal incident record. |
| `emergency.alert.status_changed.v1` | Provider status, not clinical state. |

## Error envelope

```json
{
  "error": {
    "code": "CONTACT_CONSENT_REQUIRED",
    "message": "This contact has not accepted alerts.",
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

- Stricter limits for invitations, contact alerts, login, export, and acknowledgement.
- Emergency alert limiting prevents abuse but must return a direct-call fallback rather than a dead end.
- Limit response includes safe retry timing; never expose internal provider details.

## Compatibility policy

- Additive fields are optional for older clients.
- Removing/renaming fields requires a new schema/API version.
- Server supports at least the current and previous supported app contract during forced-update grace periods.
- Clinical content versioning is independent of API versioning.

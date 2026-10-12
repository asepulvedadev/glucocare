# Glossary

| Term | Meaning in GlucoCare |
|---|---|
| Care plan | Versioned thresholds and actions supplied/approved for a patient; not inferred by the app. |
| Canonical glucose value | Stored `mg/dL` representation used for deterministic comparison while preserving the original. |
| CGM | Continuous glucose monitor. Integration is outside the MVP. |
| Clinical rule | Deterministic rule mapping entered facts and an active care plan to an explanation/action. |
| Delivery | Provider-confirmed arrival where the channel supports it; different from provider acceptance or human acknowledgement. |
| EPS | Colombian health insurer/benefits administrator context recorded by the user. |
| Emergency card | Offline summary of critical information intended to help the patient or a responder. |
| Idempotency | Retrying the same operation does not create a duplicate clinical event or alert. |
| Incident | A user-initiated or rule-triggered record that help may be needed; it is not itself a diagnosis. |
| IPS | Healthcare provider/facility in Colombia. |
| Local-first | The device database accepts core work immediately; cloud synchronization is optional and later. |
| Occurrence | One generated expected medication or measurement action at a specific time/window. |
| Outbox | Local queue written atomically with domain data for later idempotent synchronization. |
| Personalized threshold | Limit contained in the active patient care plan and associated with a source/review date. |
| Provider accepted | A message provider accepted the request; it does not prove delivery or reading. |
| RLS | PostgreSQL Row Level Security used to enforce record access per authenticated relationship. |
| Trusted contact | A verified person who consented to receive selected alerts; not automatically a caregiver with record access. |
| UTC instant | Unambiguous moment stored for synchronization; local timezone is stored separately. |

## Units

- `mg/dL`: milligrams per deciliter.
- `mmol/L`: millimoles per liter.
- Conversion must be centralized, tested, versioned, and never hide the original unit/value.

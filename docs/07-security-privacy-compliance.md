# Security, privacy, and regulatory baseline

## Position

Health data is sensitive data. Security, explicit consent, purpose limitation, and confidentiality are product requirements, not launch paperwork.

This document is an engineering baseline, not legal advice. Colombian counsel and a clinical/regulatory specialist must approve the final product, privacy notice, and intended purpose.

## Colombia baseline

- Colombia’s [Law 1581 of 2012](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) classifies health information as sensitive personal data and requires appropriate security and confidentiality controls.
- Consent must be prior, express, and informed where required; optional contact alerts, location sharing, analytics, and cloud sync need granular choices.
- Contact records remain local when cloud sync is enabled without emergency-sharing consent; a revocation event is the only contact event allowed through that boundary so remote consent can still be withdrawn.
- The right to access, correct, export where promised, revoke authorization where applicable, and request deletion must have an operational workflow.
- The patient’s initial emergency care cannot depend on prior authorization or a provider contract; official Ministry material states that initial emergency care must be provided across Colombia. See [Ministry of Health emergency coverage information](https://www2.minsalud.gov.co/salud/Documents/Contenidos/PQR-POS.aspx).
- INVIMA states that whether software is a medical device depends on its intended use, application, and purpose under Decree 4725 of 2005. See [INVIMA device software FAQ](https://www.invima.gov.co/node/184). The “risk notification” claim therefore needs a formal classification assessment before commercialization.

## Intended-purpose guardrail

Initial wording:

> GlucoCare records user-provided health information, presents reminders, displays user/clinician-configured care-plan instructions, and helps the user contact trusted people or emergency services. It does not diagnose, prescribe, calculate medication doses, or guarantee emergency response.

Marketing, store listings, onboarding, and in-app copy must remain consistent with the approved intended purpose.

## Data inventory

| Category | Examples | Default |
|---|---|---|
| Identity | Name, email, phone | Minimum required |
| Sensitive health | Glucose, diagnosis, medications, symptoms, incidents | Explicit health-data consent |
| Support network | Contact name/channel/consent | Separate opt-in |
| Location | Emergency location | Off; one-time or event-based consent |
| Device/security | Device ID, session, app version | Security purpose only |
| Product analytics | Screen/events without clinical values | Off until consent design is approved |

No advertising SDK, data broker, or cross-app tracking SDK is permitted.

## Security architecture

### On device

- SQLite database encrypted on native builds using a reviewed key lifecycle.
- Tokens/key material in SecureStore, not AsyncStorage or source code.
- Optional biometric/PIN app lock; emergency card/help remain available without unlocking so a locked user is not denied urgent care information.
- The direct trusted-contact/emergency call action remains available when local privacy consent is still pending; in that state GlucoCare does not persist the help event or send a remote alert. Local incident history and remote delivery require their respective explicit consents.
- Redact app-switcher snapshots on sensitive screens where platform support allows.
- Exclude sensitive plaintext from logs, crash reports, clipboard defaults, and notification bodies.
- Root/jailbreak detection may inform risk but must not silently lock a patient out of emergency information.

### In transit and cloud

- TLS for all connections; certificate validation remains enabled.
- PostgreSQL is private to the VPS Docker network; the API enforces deny-by-default patient scoping on every record query.
- Client contains only publishable credentials. Secret/service-role keys stay server-side.
- Privileged API routes validate the revocable session, patient relationship, schema, rate limits, consent, and idempotency.
- Emergency-sharing consent is also projected to the VPS through an explicit, revocable `privacy.consent.updated.v1` event; invitation creation, alert queueing, and worker dispatch recheck that server-side authorization instead of trusting only the mobile UI.
- PostgreSQL volume encryption, backup permissions, and restore controls are
  operated and verified on the AutoKing VPS; encrypted off-host copies remain a
  release requirement.
- Production access uses least privilege, MFA, audit logs, and time-bounded elevation.

### Authorization rules

- Patient owns their record.
- Trusted contact has alert-recipient permission only, unless separately granted caregiver access in a later release.
- A client may create or revoke a contact, but cannot write remote `accepted` consent; acceptance is established only by the private invitation function.
- Support staff cannot view clinical data by default.
- Administrator roles are never derived from user-editable metadata.
- Export/share actions require recent user confirmation.

## Threat model summary

| Threat | Control |
|---|---|
| Lost/unlocked phone | Device encryption, optional app lock, privacy-safe notifications, remote session revocation. |
| Broken object-level authorization | Private PostgreSQL network, patient-scoped API authorization, and negative cross-patient tests. |
| Malicious or mistaken contact | Invitation verification, granular consent, revocation, minimum data. |
| Secret leaked from app bundle | No server secrets in client; rotate publishable credentials where needed. |
| Notification leaks health data | Generic lock-screen body by default. |
| Duplicate panic dispatch | Idempotency keys and delivery ledger. |
| Tampered local time/data | Preserve device time/source; server timestamp and audit; do not conceal mismatch. |
| Injection | Runtime schema validation and parameterized/prepared SQL. |
| Excessive staff access | Least privilege, approval, immutable access audit, periodic review. |
| Supply-chain compromise | Lockfile, dependency review, SBOM, secret scan, signed builds. |

## Consent records

Each consent stores document/version, locale, purpose, data categories, channels, granted/withdrawn timestamps, actor, and evidence. A new incompatible purpose requires new consent; changing a privacy document must not silently opt users in.

## Retention and deletion

Before beta, approve a retention schedule for clinical records, delivery logs, audit logs, backups, invitations, and deleted accounts. Deletion UX must state:

- What is deleted immediately.
- What remains in backups and for how long.
- What must be retained by law, if applicable.

The VPS deletion transaction removes the account, sessions, health records,
invitation and delivery data through PostgreSQL cascades. It retains only a
pseudonymous user-id hash and completion timestamp in `account_deletion_events`
so the operator can prove the request was processed without retaining the
patient's email or clinical payload.
- Effects on trusted contacts and synced devices.

## Incident response

1. Detect and classify without copying sensitive payloads into tickets.
2. Contain compromised accounts/keys and preserve evidence.
3. Assess affected data subjects and legal notification obligations.
4. Notify through approved channels and language.
5. Remediate, rotate, restore, and document lessons learned.
6. Feed clinically relevant failures into the clinical safety process.

## Required pre-release artifacts

- Data Protection Impact Assessment.
- Record of processing activities and data-flow diagram.
- Final privacy notice and sensitive-data authorization.
- Terms and medical disclaimer.
- Trusted-contact consent notice.
- Processor/vendor agreements and cross-border-transfer assessment.
- INVIMA intended-purpose/classification opinion.
- Security threat model, penetration test, and remediation report.
- Incident response and breach-notification procedure.
- Account export/deletion runbook.

## Security release gate

- [ ] API authorization negative tests prove cross-patient access fails.
- [ ] No health data or secrets appear in client logs, notification previews, analytics, or crash breadcrumbs.
- [ ] Local encryption/key loss/restore behavior is tested.
- [ ] Consent withdrawal blocks new processing promptly.
- [ ] Withdrawing emergency-sharing consent clears local eligibility and requests remote trusted-contact revocation; failures remain visible for retry.
- [ ] Production access and backups are audited.
- [ ] Legal and regulatory sign-off is recorded.

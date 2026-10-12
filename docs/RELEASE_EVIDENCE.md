# GlucoCare release evidence

This document is the evidence index for the controlled beta gate. It separates
what is proven by the repository and staging environment from what still needs
human, clinical, legal, or physical-device evidence. A green build alone is not
beta authorization.

## Evidence recorded

| Area | Evidence | Status |
|---|---|---|
| Expo domain and UI code | `apps/mobile`, TypeScript, lint, and Vitest suite | Automated; current local checks pass |
| Local data durability | SQLite migrations, repositories, outbox, export/restore, deletion, and enabled foreign-key cascades | Automated; migration and domain coverage present |
| Reminder cleanup | Data deletion and replace-style restore cancel medication, appointment, and payload-identified glucose-check reminders before clearing local records | Automated code path; native device cancellation evidence pending |
| Native data protection | SQLCipher initialization and device-bound SecureStore key | Code-reviewed; physical reinstall/restore evidence pending |
| Unit integrity | Original glucose value/unit are retained alongside a deterministic canonical mg/dL value and conversion version on device and cloud sync | Automated conversion, migration, trigger, and domain coverage; clinician sign-off pending |
| Unit preference | Onboarding and Profile persist the preferred mg/dL or mmol/L entry unit without rewriting existing readings | Automated SQLite v33 migration and web/type/domain checks; native usability evidence pending |
| Clinical boundary | No dosing calculator, diagnosis engine, or guaranteed delivery claim | Code/docs guardrail; clinical sign-off pending |
| Cloud authorization | PostgreSQL migrations, patient-scoped API sessions, idempotent sync routes, timestamp-guarded projections that reject stale out-of-order events, and API payload boundary validation for glucose values, units, contexts, risk metadata, and medication schedules | Automated API smoke covers anonymous rejection, cross-patient isolation, malformed glucose/event/schedule rejection, glucose convergence, and emergency-incident convergence across two sessions; TLS, penetration, and physical-device evidence pending |
| Account deletion audit | PostgreSQL cascade deletes account data while retaining only a pseudonymous completion event | Automated migration/API code path; legal retention approval pending |
| Consent boundary | Trusted-contact outbox events are blocked without emergency-sharing consent; privacy consent is uploaded as a revocable server-side authorization with policy version, locale, purposes, categories, recipients, and evidence method; the VPS API rejects invitations and alerts unless patient sharing consent and contact consent are current, revocations remain uploadable even after cloud opt-out or local-data deletion (only a minimal revocation event remains), accepted invitations are revoked transactionally when a contact is edited/removed, alert requests are idempotent by patient/incident, and the alert worker rechecks both consent layers before dispatch | Automated v42 consent-metadata migration, domain coverage, API validation/smoke (including privacy consent, pre-consent invitation rejection, post-revocation rejection, and alert replay), and worker code path; legal text, provider, and physical-device evidence pending |
| Trusted-contact invitation UX | Provider delivery remains explicit (`provider_accepted`, `failed`, or `not_configured`); browser links show a no-index confirmation page and mutate consent only after an HTML `POST`; JSON clients retain the token acceptance contract | API/VPS smoke passed; CI also points Resend at a deterministic local provider and verifies email `provider_accepted` while SMS without Twilio remains `not_configured`; public HTTPS/provider evidence pending |
| Emergency consent fallback | The direct call/emergency path remains usable while privacy consent is pending; the app skips local incident persistence and remote dispatch until the corresponding consent is granted | Pure consent gate is covered by domain tests; code-reviewed mobile path; physical no-consent device walkthrough pending |
| Emergency incident sync | Local help incidents remain durable offline, state changes are replayable through the outbox, a second device can project the incident history without exposing contact delivery details, and reviewed conflicts can apply a remote incident projection safely | Mobile repository/sync/conflict paths implemented and 59 domain tests pass; physical two-device incident walkthrough pending |
| Reminder integrity | Medication and glucose-check reminders use bounded 14-day one-shot windows, honor validity, fixed/interval/weekday/meal-relative schedules, and deep-link taps to the relevant screen | Automated domain coverage (59 mobile tests); native device timing evidence pending |
| Occurrence lifecycle | Future medication doses remain `planned`, become `due` at their scheduled time, and past due/snoozed medication and measurement occurrences become explicit `expired` records with replayable outbox events; stale windows are not silently deleted | Automated migration/typecheck/domain coverage; clock-change and native device evidence pending |
| Appointment lifecycle | Requested/authorization/scheduled/completed/missed/denied/cancelled states are synchronized across local storage, cloud pulls, conflict restore, and reminder reconciliation; reopening a denied/missed appointment reschedules its reminder | Automated typecheck/domain coverage; native timing evidence pending |
| Web staging | Docker Compose, health checks, COOP/COEP headers, CSP worker allowance for the SQLite WASM worker, and safe fallback navigation for direct deep links without browser history | Commit `8193013` verified on the VPS over an SSH tunnel with Chromium: onboarding completed, `/log` saved a local `120 mg/dL` reading, `/history` displayed it, and 0 browser errors were reported; one known Expo web-notifications warning remains |
| Release recovery | Three-release cache, automatic deploy rollback, `glucocare-rollback` | VPS installed and manually verified |
| Backup restore check | Disposable-database restore command validates PostgreSQL custom dumps without touching live data; encrypted `.dump.gpg` artifacts are decrypted only into a mode-600 temporary file; a systemd timer schedules the drill monthly | VPS drill passed 2026-10-12 against `glucocare-20261012T161957Z.dump`; restore-check timer is enabled and active, with production GPG key/off-host copy and quarterly review still required |
| Operational monitoring | Payload-free systemd health check every five minutes | VPS timer active; external paging channel pending |
| Incident response | Payload-free procedures for provider outage, VPS/PostgreSQL outage, rollback, breach, credential rotation, rights requests, unsafe clinical content, and critical mobile updates | Runbooks checked in; dated tabletop/staging exercises and on-call assignment pending |
| Alert queue monitoring | Payload-free systemd check fails when queued/processing deliveries older than the configured limit accumulate; worker health is based on a post-tick heartbeat with a two-minute freshness window | Implemented in VPS health check and Compose worker probe; external paging channel and outage drill pending |
| Alert worker crash recovery | A delivery claimed before a process crash is reclaimed after its two-minute lease expires instead of remaining stuck in `processing`; the same private tick removes expired sessions and expires pending invitations | Automated PostgreSQL worker smoke test; provider outage and multi-worker staging evidence pending |
| Provider retry semantics | A transient provider HTTP failure is requeued with backoff and only a later response carrying a provider message ID moves the delivery and parent alert to `provider_accepted`; provider dispatch fails closed unless `PUBLIC_API_URL` is HTTPS; the API and private worker receive the same origin guard from Compose | Automated synthetic-provider CI smoke, CI HTTP/HTTPS guard checks, and deployment validation of both service environments; real provider outage drill pending |
| Provider delivery callbacks | Signed HMAC callback endpoint updates a matching provider message to `delivered` or `failed`, preserves a delivered terminal state, and does not reveal unknown IDs | Synthetic signed callback smoke in CI; provider-specific webhook adapter and HTTPS route review pending |
| Accessibility | Semantic labels, large text, high contrast, simple mode, reduced motion (native stack transitions are disabled when the preference or system setting is active), optional touch feedback, persistent help | Automated v42 migration suite and web walkthrough; TalkBack/VoiceOver evidence pending |
| Native build configuration | Expo plugins, Android/iOS identifiers, assets, and prebuild hooks | `CI=1 npx expo prebuild --no-install` passes in CI; development/release artifact and physical-device evidence pending |
| Range export | CSV and printable clinician report expose a selected 7-day, 30-day, or all-history period; CSV retains reading IDs, original/canonical units, context, source, ketone result, and risk-rule provenance; JSON remains a complete backup; the printable report includes the configured emergency number and region | Automated range-boundary, CSV escaping/provenance, and report rendering tests; native share/print evidence pending |
| Care-plan auditability | Medication, appointment, care-plan, measurement-plan, emergency-card, trusted-contact, and privacy-consent changes retain local/server before/after snapshots in `change_audit_events`/`audit_events` and survive JSON backup/restore where applicable; glucose readings also preserve the deterministic risk rule and care-plan revision timestamp used; reviewed remote conflicts preserve care-plan provenance and emergency-card fields | Automated v35/v41/v42 migrations (including identity, blood-type/RH, care-facility address, and consent metadata fields), repository/API audit paths, CI SQL assertion for consent audit rows, and 59 domain tests; reviewer/accessibility evidence pending |
| Context and ketone capture | Glucose records support exercise/illness/symptom contexts and structured user-entered ketone-strip results without interpreting them | Automated v36 migration, sync, export, and report coverage; clinical wording/device evidence pending |
| Dependency posture | Expo SDK and React Native versions are pinned and checked by Expo Doctor; audit output is recorded separately | `docs/DEPENDENCY_AUDIT.md`; upstream-compatible remediation and security-owner review pending |
| Production configuration handoff | A separate validator rejects localhost/place-holder origins, weak database/callback secrets, missing off-host GPG backup recipient, and partial provider credentials before a reviewed public release | Synthetic valid/invalid cases pass in CI and the VPS correctly rejects its localhost staging environment; DNS, TLS, GPG key handoff, and real-provider review pending |

## Reproducible checks

Run from the repository root:

```bash
cd apps/mobile
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test
npx expo export --platform web
cd ../..
python3 scripts/validate-docs.py
python3 scripts/scan-secrets.py
bash scripts/validate-deployment.sh
```

The deployment validator also runs `scripts/smoke-backup-gpg.sh` with an
ephemeral test key, proving the encrypted backup/restore primitive without
touching a real database or importing an operator key.

The web export must remain below the 5 MiB CI budget. The deployment script
check also parses every privileged VPS script and validates the Compose file.

## Staging verification

The staging surfaces are intentionally localhost-only on the shared VPS. Verify
them through SSH as an operations administrator:

```bash
systemctl start glucocare-healthcheck.service
journalctl -u glucocare-healthcheck.service -n 20 --no-pager
docker inspect --format '{{.State.Health.Status}}' glucocare-glucocare-web-1
docker inspect --format '{{.State.Health.Status}}' glucocare-docs
```

The health check must report `status=healthy`; it never reads application
payloads or patient records.

## Remaining beta evidence

These items are release gates, not TODOs that can be safely inferred from code.
Execute them using the [physical-device test matrix](DEVICE_TEST_MATRIX.md):

1. Physical Android and iOS runs covering offline capture, process kill/restart,
   permissions, reboot, timezone/DST, notifications, export, deletion, and
   emergency fallback.
2. TalkBack and VoiceOver walkthroughs with large text, high contrast, reduced
   motion, and switch/keyboard navigation where applicable.
3. Two-device sync and conflict review using synthetic accounts, including API
   authorization negative tests against the VPS PostgreSQL deployment.
4. Production provider credentials, private worker scheduling, queue/backlog
   alerting, and a provider-outage drill.
5. Clinical review of every threshold, medication message, symptom escalation,
   and emergency limitation.
6. Colombian privacy counsel and regulatory/INVIMA assessment, including the
   final privacy notice, sensitive-data authorization, retention, and deletion
   commitments.

Each item needs a reviewer, date, build/device identifier, observed result, and
rollback or mitigation note before the beta checklist can be checked off.

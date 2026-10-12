# GlucoCare release evidence

This document is the evidence index for the controlled beta gate. It separates
what is proven by the repository and staging environment from what still needs
human, clinical, legal, or physical-device evidence. A green build alone is not
beta authorization.

## Evidence recorded

| Area | Evidence | Status |
|---|---|---|
| Expo domain and UI code | `apps/mobile`, TypeScript, lint, and Vitest suite | Automated; current local checks pass |
| Local data durability | SQLite migrations, repositories, outbox, export/restore, deletion | Automated; migration and domain coverage present |
| Reminder cleanup | Data deletion and replace-style restore cancel medication, appointment, and payload-identified glucose-check reminders before clearing local records | Automated code path; native device cancellation evidence pending |
| Native data protection | SQLCipher initialization and device-bound SecureStore key | Code-reviewed; physical reinstall/restore evidence pending |
| Unit integrity | Original glucose value/unit are retained alongside a deterministic canonical mg/dL value and conversion version on device and cloud sync | Automated conversion, migration, trigger, and domain coverage; clinician sign-off pending |
| Unit preference | Onboarding and Profile persist the preferred mg/dL or mmol/L entry unit without rewriting existing readings | Automated SQLite v33 migration and web/type/domain checks; native usability evidence pending |
| Clinical boundary | No dosing calculator, diagnosis engine, or guaranteed delivery claim | Code/docs guardrail; clinical sign-off pending |
| Cloud authorization | Supabase migrations, RLS negative tests, private functions | Local Supabase CI evidence exists; hosted credentials/deploy pending |
| Consent boundary | Trusted-contact outbox events are blocked without emergency-sharing consent; revocations remain uploadable; privacy withdrawal requests remote revocation; the delivery worker re-checks accepted emergency consent immediately before provider dispatch | Automated domain coverage, schema migration, and local Edge Function smoke present |
| Reminder integrity | Medication and glucose-check reminders use bounded 14-day one-shot windows, honor validity/weekday/meal windows, and deep-link taps to the relevant screen | Automated domain coverage; native device timing evidence pending |
| Appointment lifecycle | Requested/authorization/scheduled/completed/missed/denied/cancelled states are synchronized across local storage, cloud pulls, conflict restore, and reminder reconciliation; reopening a denied/missed appointment reschedules its reminder | Automated typecheck/domain coverage; native timing evidence pending |
| Web staging | Docker Compose, health checks, COOP/COEP headers | VPS verified healthy on `127.0.0.1:18080/18082` |
| Release recovery | Three-release cache, automatic deploy rollback, `glucocare-rollback` | VPS installed and manually verified |
| Operational monitoring | Payload-free systemd health check every five minutes | VPS timer active; external paging channel pending |
| Accessibility | Semantic labels, large text, high contrast, simple mode, reduced motion, persistent help | Code coverage; TalkBack/VoiceOver evidence pending |

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

These items are release gates, not TODOs that can be safely inferred from code:

1. Physical Android and iOS runs covering offline capture, process kill/restart,
   permissions, reboot, timezone/DST, notifications, export, deletion, and
   emergency fallback.
2. TalkBack and VoiceOver walkthroughs with large text, high contrast, reduced
   motion, and switch/keyboard navigation where applicable.
3. Two-device sync and conflict review using synthetic accounts, including RLS
   negative tests against the hosted project.
4. Production provider credentials, private worker scheduling, queue/backlog
   alerting, and a provider-outage drill.
5. Clinical review of every threshold, medication message, symptom escalation,
   and emergency limitation.
6. Colombian privacy counsel and regulatory/INVIMA assessment, including the
   final privacy notice, sensitive-data authorization, retention, and deletion
   commitments.

Each item needs a reviewer, date, build/device identifier, observed result, and
rollback or mitigation note before the beta checklist can be checked off.

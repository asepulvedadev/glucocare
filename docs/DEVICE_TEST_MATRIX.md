# GlucoCare physical-device and release evidence matrix

This matrix is the execution sheet for the controlled-beta gates. Repository
tests do not replace these checks: every completed row needs a reviewer, date,
device/build identifier, observed result, and mitigation or rollback note.

## Evidence record

Copy this block once per device and test run:

```text
Test ID:
Platform / model:
OS version:
App build / git commit:
Locale / timezone:
Network state:
Accessibility service / text-size setting:
Tester / reviewer:
Date and time:
Result: pass | fail | blocked
Observed result:
Evidence link or filename:
Defect / mitigation / rollback:
```

## Device matrix

| ID | Journey | Setup | Pass criteria | Required evidence |
|---|---|---|---|---|
| DEV-01 | First launch and onboarding | Fresh install; Spanish (Colombia); notifications initially denied | User completes onboarding, configures emergency number/region, and can reach Help without an account | Screenshot or recording plus build identifier |
| DEV-02 | Offline glucose capture | Airplane mode; no cloud session | Reading saves with automatic local date/time, unit, context, and history entry; app restart does not lose it | Before/after screenshots and exported fixture |
| DEV-03 | Edited timestamp audit | Existing reading; change recorded time and reason | New value is visible in history, correction audit retains before/after values, and CSV/report preserve provenance | Exported CSV/report and audit screenshot |
| DEV-04 | Measurement reminders | Configure one fixed and one meal-relative window; grant notifications | Fixed reminder arrives at configured local time; meal-relative reminder appears only after explicit meal entry; no duplicate after resume | Notification screenshots and occurrence identifiers |
| DEV-05 | Medication routine | Configure fixed, interval, and weekday schedules with a validity end date | Reminder wording does not give dosing advice; future occurrences remain planned; end date stops new occurrences/reminders | Schedule screen, occurrence ledger, notification evidence |
| DEV-06 | Permission and reminder recovery | Deny notifications, then enable them in system settings; kill/reopen app | Data remains saved while permission is denied; explicit settings action works; resume reconciles the bounded reminder window | Screenshots plus scheduled-notification listing |
| DEV-07 | Timezone/DST | Run across a supported timezone/DST transition with a test clock or staging date | Local fixed-time schedules keep the configured wall-clock time; stale reminders are cancelled/rebuilt without duplicates | Device timezone and notification logs |
| DEV-08 | Emergency fallback | Lock app; disable network and local consent; configure emergency number | Help remains reachable without unlocking or network; emergency call action opens the dialer; no unauthorized incident/remote alert is persisted | Screen recording and local database/export check |
| DEV-09 | Trusted-contact consent | Create contact; test pending, accepted, revoked, and edited states | Contact receives nothing before consent/invitation; revocation blocks new alerts; contact never sees clinical history | API smoke output and UI screenshots |
| DEV-10 | Appointment lifecycle | Create appointment and move through requested, authorization, scheduled, completed/missed | Valid transitions are presented; terminal states cancel reminders; reopening missed/denied reschedules when applicable | State screenshots and reminder identifiers |
| DEV-11 | Export and restore | Populate synthetic records; export JSON, CSV, and clinician report | JSON restores records without restoring consent; contacts require fresh consent; CSV/report contain selected range and disclaimer | Files plus restore result |
| DEV-12 | Local deletion | Populate all record types; invoke local deletion with and without cloud session | Local tables and native reminders are removed; minimal revocation event is the only pending cloud payload; retry remains possible | Deletion confirmation, outbox inspection, API response |
| DEV-13 | App lock lifecycle | Enable biometric/device-passcode lock; background, kill, and reopen app | Routine data stays behind lock; Help remains available; unavailable device authentication disables the setting safely | Screen recording and device security settings |
| DEV-14 | Large text / high contrast / reduced motion | Enable each preference and system reduced-motion setting | No safety action depends on color, sound, precision gesture, or hidden text; controls remain reachable and transitions stop when requested | Screenshots at largest supported text size |
| DEV-15 | Screen reader critical paths | Android TalkBack and iOS VoiceOver | Onboarding, glucose entry, medication, Help, appointment, export, and deletion have meaningful labels, state announcements, and logical focus order | Accessibility test notes or recording |
| DEV-16 | Two-device sync | Two synthetic accounts/devices; network on/off; edit same entity on both | Local capture works offline, replay is idempotent, conflicts are explicit, and reviewed remote projection does not leak another patient’s data | Device logs, API smoke output, conflict screenshots |
| DEV-17 | Provider outage | Staging provider returns transient and permanent failures | Queue state is truthful, retry/backoff occurs, no delivery is claimed without provider acceptance, and call fallback remains visible | Worker logs without payloads and incident note |
| DEV-18 | Reboot and process kill | Schedule reminders; reboot device and force-stop app | Valid reminders are reconciled after resume; expired validity windows do not reappear; no duplicate occurrences are created | Notification list and occurrence export |

## Execution rules

1. Use synthetic accounts and records until privacy/counsel approval allows
   consented pilot data.
2. Never paste glucose values, medication details, contact destinations, or
   access tokens into issue comments or CI logs. Store sensitive evidence in the
   approved restricted evidence location and link only the reference.
3. A failed or blocked row is a release gate. Record the defect and mitigation;
   do not convert a missing physical run into an automated pass.
4. Repeat DEV-04, DEV-05, DEV-07, DEV-13, DEV-14, DEV-15, and DEV-18 on both
   Android and iOS before beta authorization.

## Automated prerequisites

Run these checks before starting the physical session:

```bash
cd apps/mobile
npm ci --legacy-peer-deps
npm run typecheck
npm run lint
npm test
npx expo export --platform web
cd ../..
python3 scripts/smoke-mobile-outbox-migration.py
python3 scripts/validate-docs.py
bash scripts/validate-deployment.sh
```

The current repository evidence is indexed in
[`RELEASE_EVIDENCE.md`](RELEASE_EVIDENCE.md). This matrix records the human and
device evidence still required; it does not mark those rows as completed.

# GlucoCare mobile

Expo SDK 57 mobile-first application for the GlucoCare self-management companion.

## Implemented vertical slice

- Expo Router navigation: Today, History, Care, Profile, Help.
- Guided first-run onboarding for accessibility preferences, local-data consent, and optional emergency-card setup.
- First-run unit preference (`mg/dL` or `mmol/L`) reused by new glucose entries and editable later from Profile.
- Atmos-inspired dark amber visual tokens.
- Accessible 44 pt touch targets, labels, semantic status colors, and large readable values.
- Offline glucose entry backed by SQLite, automatic timestamp, unit, context, symptoms, and notes.
- Glucose records preserve the original value/unit and a deterministic canonical `mg/dL` value with an explicit conversion version for summaries, risk classification, export, and cloud sync.
- Unusually high data-entry values request explicit confirmation before saving; this is a typo check, not a clinical threshold or diagnosis.
- Glucose entries preserve the capture timezone, UTC offset, and whether the timestamp was edited for auditability.
- Existing readings can be corrected from History; the previous and new snapshots are retained in a local append-only audit record and queued as `glucose.reading.corrected.v1`.
- Medication, appointment, care-plan, measurement-plan, emergency-card, and trusted-contact edits also retain local before/after snapshots in `change_audit_events`; complete JSON backups preserve this audit trail.
- When cloud sync is enabled, correction events are persisted through the private `record-glucose-audit` function; a missing function keeps the outbox pending instead of silently dropping the audit trail.
- Optional clinician-provided glucose thresholds with deterministic, non-diagnostic risk labels and urgent foreground guidance.
- Urgent clinician-configured glucose risks also surface a privacy-preserving local notification when notification permission is already granted; saving a reading never requires notification permission.
- Local history persisted across app restarts.
- History includes meals, medication occurrences, appointments, and help events alongside glucose readings.
- Emergency help flow that opens the local emergency number and states delivery limitations.
- Medication records with clinician-provided dose text, route, one to three daily times, prescriber, instructions, validity dates, and local reminder state.
- Daily medication occurrence ledger with planned/due/taken/omitted actions and replayable sync events; future doses cannot be acknowledged before their scheduled time.
- Occurrence reconciliation marks past due/snoozed medication and measurement windows as expired with a sync event instead of silently dropping them.
- Medication occurrences also support a ten-minute snooze with a one-shot native reminder, plus an explicit not-recorded state; the app never invents a missed-dose instruction.
- Native daily reminder scheduling with explicit permission-denied and web-unavailable states.
- Android separates medication, appointment, and urgent-risk notification channels so users can control each reminder category independently. Profile also exposes sound and vibration preferences; Android creates channel variants because channel behavior is fixed after creation, while device-level settings can still override them.
- Changing sound or vibration preferences rebuilds existing scheduled reminders so old channel settings do not remain active silently.
- Medication, measurement, and appointment reminders share a bounded native queue. The app keeps the 60 earliest requests, marks a record `scheduled_limited` when the device budget is exhausted, and rebuilds the rolling window on resume instead of silently claiming every future reminder is scheduled.
- Lock-screen notifications use generic copy; medication names, doses, appointment providers, and glucose values stay inside the app.
- Local emergency card with diabetes history, allergies/critical conditions, care provider/facility, EPS/affiliation data, patient-verified emergency number/region, and consented trusted contacts.
- The offline help view projects enabled medicines and consented contact phone/email into the responder view at display time, labels the medication list as informational, and never copies it into the emergency-card record.
- Trusted contacts can be edited; changing their details resets consent until the person confirms again.
- Help-event recording with an explicit call fallback; alert delivery is never overstated.
- Complete JSON backup plus selectable 7-day/30-day/all-history glucose CSV and clinician report exports, each preceded by an explicit included-fields confirmation, plus replace-style local JSON restore and data deletion with medication, appointment, and measurement-reminder cleanup. Restored contacts require consent again; cloud consent and sync queues are never restored from a file.
- The printable clinician report includes glucose, meals, medication adherence, appointments, help requests, and corrected-reading summaries, with the non-diagnostic disclaimer preserved.
- Versioned local privacy consent with separate controls for on-device storage, optional cloud sync, and emergency-contact sharing.
- Configurable measurement plan with one, two, or three daily times, per-reading context (fasting/before/after meal/bedtime), weekday exceptions, temporary validity dates, and optional care-team instructions.
- Daily measurement occurrence checklist that can be completed by a glucose reading or explicitly skipped.
- Future measurement windows remain `planned` until their scheduled instant; the app does not let a reading or skip acknowledge a window early.
- Appointment records with authorization workflow (`requested`, `pending_authorization`, `authorized`, `scheduled`, `completed`, `missed`, `denied`, `cancelled`), editable scheduling details, and reminder rescheduling when a date changes or a closed appointment is reopened.
- Device-local accessibility preferences for large text, high contrast, simple mode, and reduced motion.
- Native and web builds follow the operating-system light/dark appearance with accessible theme tokens; high-contrast text remains available in either scheme.
- Native builds initialize SQLCipher with a device-bound key stored in SecureStore before migrations run. Losing the device key makes the local database unrecoverable, so export a backup before uninstalling or resetting a device; web uses the separate WASM SQLite path.
- Native users can optionally enable biometric/device-passcode app lock from Profile. The emergency help route remains available without unlocking; Face ID requires a native development or release build, not Expo Go.
- The web companion shows an explicit capability notice: it supports recording, review, and export, but does not promise native alarms or delivery while the tab is closed.
- A redacted error boundary keeps a rendering failure from hiding emergency help or exposing health data in logs.
- Optional Supabase Auth session with SecureStore/local web persistence, replayable outbox uploads, and a cursor-based pull projection for the user's cloud records.
- Cursor sync performs a pull-before-push pass. If a remote edit arrives while a local event is still pending, the local record is preserved and an explicit conflict is stored locally. Profile lets the user either keep the pending local event for retry or explicitly apply a supported remote projection.
- Cloud account deletion workflow that leaves local data available until the user separately deletes it.
- SQLCipher config enabled for native builds; web SQLite uses the documented WASM/COOP/COEP setup.

## Commands

```bash
npm install --legacy-peer-deps
npm run typecheck
npm run lint
npx expo-doctor
npx expo start
npx expo export --platform web
npx eas-cli@latest build --profile preview
```

### Direct VPS staging deploy

The VPS is deployed locally, not from GitHub Actions. From the repository root,
run the strict release order from a clean, pushed `main` checkout:

```bash
./scripts/deploy-vps-direct.sh
```

The command validates the repository and mobile app, exports the web bundle,
streams it to the VPS, and verifies both staging health endpoints. See
[`../../DEPLOYMENT.md`](../../DEPLOYMENT.md) for rollback and operator details.

Use a development build for native modules and notifications. Expo Go is useful for early UI review but is not the release artifact.

### Native EAS builds

The repository includes a manual GitHub Actions workflow at [`.github/workflows/eas-build.yml`](../../.github/workflows/eas-build.yml). Add an `EXPO_TOKEN` secret to the `production` GitHub environment, then run **Native mobile build** and choose `preview` or `production` plus the target platform. The workflow verifies or initializes the EAS project before starting a non-interactive build; signing credentials remain managed by EAS and are never committed.

`eas.json` defines development, preview, and production channels. Signing credentials, EAS project ID, and store metadata remain release-environment configuration and must not be committed.

Cloud sync is opt-in and disabled until `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are supplied. See [`../../supabase/README.md`](../../supabase/README.md) before linking a hosted project.

Conflict records are intentionally visible from Profile after a sync failure. They contain only the local and remote projections needed to explain the decision; the app never silently replaces a pending local health record with a remote copy. Remote resolution is limited to projections with a tested local mapping.

## Safety boundary

This app records and organizes user-provided information. It does not diagnose, prescribe, calculate insulin doses, or guarantee that an emergency notification is delivered.

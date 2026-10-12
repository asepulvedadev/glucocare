# MVP roadmap and prioritized backlog

## Delivery approach

Build vertical slices that are usable and testable on a physical device. Do not build every screen first and postpone safety, offline storage, or accessibility.

## Implementation status

The current repository has completed the local-first core through the first continuity slice: glucose capture/history with exercise/illness/symptom context and structured ketone capture, clinician-provided risk classification, fixed and explicit meal-relative measurement occurrences, medication records with presentation plus fixed/interval/weekday/meal-relative schedules, medication occurrence tracking (including validity-window enforcement), appointments, emergency card/help, trusted contacts with an expiring invitation/acceptance route on the VPS API, versioned JSON export/restore/deletion, selectable 7-day/30-day/all-history CSV and printable clinician report exports, accessibility preferences with notification controls and optional touch feedback, native SQLCipher key initialization, optional biometric/device-passcode app lock with emergency-help bypass, optional Auth, replayable outbox uploads, a cursor-bounded pull projection with explicit reviewed remote conflict resolution, PostgreSQL API authorization/account deletion, a private alert-delivery worker with disabled-by-default provider adapters, CI, and AutoKing web staging. The remaining release blockers are two-device physical validation of conflict paths, native physical-device evidence, provider credentials/monitoring, clinician/legal review, and a clinician portal if that scope is approved.

## Phase 0 — validation and governance (2–3 weeks)

### Outcomes

- Interview 5–8 patients/caregivers and 2 clinicians.
- Confirm initial country/locale and emergency-number strategy.
- Approve intended-purpose statement and regulatory assessment plan.
- Prototype quick glucose, reminder, and help flows with accessible components.
- Complete initial hazard analysis and data-flow inventory.

### Exit criteria

- Product and clinical owners approve MVP boundaries.
- Target users can complete prototype tasks.
- Legal/security risks have accountable owners.

## Phase 1 — local safety core (3–4 weeks)

### Vertical slice

- Expo project, typed routes, theme, accessibility primitives.
- SQLite migrations and repository ports.
- Local patient preferences and emergency card.
- Glucose capture/history with unit safety.
- Versioned care plan and deterministic classification.
- Offline tests and encrypted native database proof.

### Exit criteria

A user records and reviews glucose offline; results explain which care-plan rule was used.

## Phase 2 — routines and reminders (3 weeks)

- Medication records and revisioned schedules.
- Measurement plans, fixed/meal-relative occurrences.
- Local notification permission/test/reconciler.
- Taken/skipped/snoozed/not-recorded semantics.
- Timezone, reboot, and app-update tests.

### Exit criteria

Two weeks of routine occurrences reconcile without duplicates across simulated time changes.

## Phase 3 — account, sync, and contacts (3–4 weeks)

- Optional VPS API account/sync.
- Patient-scoped API authorization, private PostgreSQL network exposure, migrations, and negative access tests.
- Outbox/inbox sync with conflicts and idempotency.
- Trusted-contact invitation, acceptance, revocation, and channel verification.
- Privacy-safe push/email provider adapter.

### Exit criteria

Local mode stays fully usable; two devices sync; revoked contacts cannot receive new alerts or access records.

## Phase 4 — emergency, appointments, and export (3 weeks)

- Help/panic flow with call, incident, alerts, and delivery ledger.
- Offline emergency card entry point.
- Appointment state machine and reminders.
- Accessible CSV/printable report export.
- Local HTML/PDF clinician report with explicit non-diagnostic disclaimer.
- Incident simulation and provider-failure drills.

### Exit criteria

Critical end-to-end journeys pass on physical Android/iOS with network on/off and accessibility services enabled.

## Phase 5 — controlled beta and hardening (3–4 weeks)

- Clinical/usability pilot with consented participants.
- Performance, battery, security, and accessibility remediation.
- Privacy/legal/INVIMA review closure.
- Support, incident response, backups, deletion, and rollback rehearsal.
- Store metadata and final intended-purpose consistency check.

## Prioritized backlog

### P0 — release blocking

- Local glucose capture with unit/timestamp audit.
- Care-plan revision and safe fallback.
- Emergency call/card path without login/network.
- Medication and measurement schedules with reconciled local notifications.
- Privacy consent, export, deletion, and lock-screen safety.
- Trusted-contact consent before dispatch.
- Offline data durability and encrypted native storage.
- TalkBack/VoiceOver critical-flow compliance.
- API authorization and cross-patient negative tests.

### P1 — MVP value

- Optional sync across devices.
- Push/email contact alerts with accurate delivery states.
- Appointment authorization workflow.
- Printable clinician report.
- Simplified mode, high-contrast themes, haptic/audio preferences.
- Incident history and care-team contacts.

### P2 — after evidence

- SMS/WhatsApp provider channels.
- Inventory/refill reminders.
- HealthKit/Health Connect.
- CGM/glucometer imports.
- Caregiver or clinician portal.
- Multiple dependants/minors.

### Explicitly deferred

- Insulin calculator.
- Predictive “AI risk” score.
- Automatic emergency-service dispatch.
- Treatment-plan changes initiated by the app.

These are not shortcuts; they require separate clinical validation, regulation, and operational capacity.

## First implementation work units

1. **Foundation:** Expo app, strict TypeScript, router, CI, design tokens, accessibility primitives.
2. **Persistence:** encrypted SQLite proof, migrations, repositories, outbox transaction.
3. **Glucose slice:** domain value, entry/history UI, unit conversion, care-plan rules, tests.
4. **Emergency shell:** card, configurable dialer, offline incident record—before remote alerts.
5. **Routines:** medication/measurement schedules, occurrence generator, local notification reconciler.
6. **Cloud boundary:** PostgreSQL migrations, API authorization, optional auth/sync, contact routes.

Each work unit ends with device evidence and documentation updates.

## MVP definition of done

- Product, clinical, accessibility, security, legal, and operations gates pass.
- No P0 defect is open.
- Recovery from failed sync/migration/provider outage is demonstrated.
- Monitoring and incident response are staffed.
- User-facing limitations are truthful and understandable.

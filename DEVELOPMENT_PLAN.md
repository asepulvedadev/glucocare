# GlucoCare — complete development plan

GlucoCare is an accessible, local-first Expo application that helps people living with diabetes record glucose, follow clinician-defined routines, remember medicines and appointments, and reach a trusted person in an urgent situation. This plan turns the current product and safety blueprint into an executable 18-week delivery sequence.

> **Current baseline (2026-10-12):** the Expo mobile application contains a working offline-first vertical slice with glucose logging (including editable timestamp audit metadata, correction history, original-unit preservation, canonical `mg/dL` storage, and persisted `mg/dL`/`mmol/L` preference), clinician-provided risk classification, date/context history filters, meal events and explicit meal-relative measurement windows, measurement and medication occurrence ledgers with future medication doses held as `planned` until due, validity-window enforcement, editable appointments and reminder rescheduling, emergency card/help, editable trusted contacts with consent reset, local privacy consent, complete JSON backup plus selectable 7-day/30-day/all-history CSV and printable clinician report exports, accessibility preferences, configurable notification sound/vibration, native SQLCipher key initialization, optional biometric/device-passcode app lock with an emergency-help bypass, optional Auth, replayable outbox uploads, and a cursor-bounded cloud pull projection with explicit local-wins conflict records and reviewed remote projections. The Supabase schema/RLS foundation, account deletion flow, private alert-delivery worker scaffold, CI, EAS profiles, AutoKing-hosted web staging, three-release VPS rollback cache, and payload-free systemd health check are versioned and validated. Native physical-device evidence, production provider credentials, clinician portal/configuration, and clinical/legal sign-off remain release gates.

## 1. Outcome and boundaries

### 1.1 Release outcome

The first controlled beta is complete when a user can:

1. create a protected profile and emergency card;
2. record glucose offline with automatic date/time, unit, context, symptoms, and notes;
3. follow a clinician-defined measurement plan without the app inventing clinical advice;
4. see medication doses and reminders exactly as configured by the user/clinician;
5. acknowledge, skip, or record a medication occurrence;
6. add a consented trusted contact and send an urgent alert or place a call;
7. view appointments and reminder states (`requested`, `pending_authorization`, `authorized`, `scheduled`, `completed`, `missed`, `denied`, `cancelled`);
8. review history, export it, and delete the account/data;
9. use every safety-critical flow with TalkBack/VoiceOver, large text, reduced motion, and offline conditions.

### 1.2 Non-goals for the first release

- Diagnosis, insulin-dose calculation, prescription, or autonomous treatment advice.
- Universal glucose thresholds presented as personal medical instructions.
- Guaranteed emergency-service dispatch or guaranteed notification delivery.
- Continuous glucose-monitoring integrations, pharmacy ordering, billing, or clinician dashboards.
- Public web parity with native alarm and emergency behavior.

### 1.3 Target platforms and locale

- **Tier 1:** Android and iOS through Expo/EAS.
- **Tier 2:** responsive web companion for review, export, and basic capture only.
- **Initial locale:** Spanish (Colombia); country-specific emergency and legal content must be configurable.

## 2. Delivery principles (non-negotiable)

| Principle | Engineering consequence | Product consequence |
|---|---|---|
| Clinical boundary | No dose calculator or diagnosis engine in the client or API | Copy always directs users to their care plan or emergency services |
| Local-first | SQLite is the source of truth for capture; sync is additive | Logging works without connectivity |
| Accessibility first | Every feature has screen-reader, text-size, contrast, touch-target, and motion acceptance criteria | No safety action depends on color, sound, or memory alone |
| Truthful safety | Separate `created`, `queued`, `sent`, `delivered`, and `failed` states | The user is never told an alert was delivered when it was only queued |
| Least data | Store only data needed for care coordination and user control | Consent, export, deletion, retention, and access are visible |
| Reversible delivery | Feature flags, migrations, backups, and rollback are mandatory | Beta can be stopped without corrupting records |

## 3. Team and accountability

A small team can combine roles, but accountability cannot be ambiguous.

| Role | Accountable for | Required sign-off |
|---|---|---|
| Product owner | scope, priority, release decision | phase gates and beta go/no-go |
| Clinical safety lead | care-plan language, escalation, medication semantics | all P0 clinical changes |
| Mobile lead | Expo architecture, offline data, native notifications | mobile vertical slices |
| Backend/security lead | auth, sync, RLS, secrets, audit events | production data paths |
| UX/accessibility lead | flows, content hierarchy, assistive technology testing | usability and accessibility gates |
| QA lead | test strategy, device matrix, release evidence | release candidate |
| Operations lead | CI/CD, VPS/EAS environments, monitoring, rollback | deployment gate |
| Colombian privacy/regulatory counsel | consent, health-data processing, INVIMA boundary | beta and public release |

## 4. Workstreams and exit evidence

### WS0 — Governance, clinical safety, and legal

**Objective:** make the intended use safe and reviewable before implementation.

**Deliverables:** validated product boundary; care-plan and escalation copy; consent matrix; privacy/retention/deletion decisions; INVIMA classification assessment; incident-response owner.

**Dependencies:** none.

**Exit evidence:** clinical lead approval, counsel review recorded, unresolved risks assigned owners and dates.

### WS1 — Design system and accessibility

**Objective:** implement the Atmos-inspired, mobile-first visual system without reducing safety clarity.

**Deliverables:** tokens (dark canvas, amber primary, semantic status colors); accessible component primitives; navigation shell; empty/loading/error/offline states; Spanish content inventory.

**Dependencies:** WS0.

**Exit evidence:** component test page, contrast report, VoiceOver/TalkBack walkthrough, large-text screenshots, reduced-motion verification.

### WS2 — Expo foundation

**Objective:** create a maintainable cross-platform runtime.

**Deliverables:** Expo + TypeScript + Expo Router; environment configuration; lint/typecheck/test scripts; EAS profiles; secure storage/key strategy; error boundary and crash reporting adapter.

**Dependencies:** WS1 decisions; WS0 data classification.

**Exit evidence:** clean Android/iOS development builds, web build, CI green, no secrets in bundle.

### WS3 — Domain model and local persistence

**Objective:** make health records durable, auditable, and offline-first.

**Deliverables:** SQLite schema and migrations; repository interfaces; encrypted sensitive storage strategy; idempotent write IDs; clock/time-zone policy; sync metadata; import/export schema.

**Dependencies:** WS0 and WS2.

**Exit evidence:** migration tests, restart/offline tests, corrupted-write recovery, deterministic export fixture.

### WS4 — Glucose and measurement plans

**Objective:** deliver the first safe vertical slice from capture to history.

**Deliverables:** quick glucose entry; unit/context/symptom fields; automatic timestamp with edit disclosure; clinician-defined measurement plans; trend/history view; non-diagnostic educational states.

**Dependencies:** WS3, WS1, clinical copy from WS0.

**Exit evidence:** physical-device capture offline, sync replay, accessibility pass, clinical review of every state and message.

### WS5 — Medication routines and reminders

**Objective:** help users follow configured routines without implying prescription authority.

**Deliverables:** medication record; route/frequency/times; occurrence state machine; local notifications; snooze/skip/taken actions; missed-dose wording; timezone/DST handling.

**Dependencies:** WS3, WS4 notification primitives, WS0 clinical semantics.

**Exit evidence:** notification tests on Android/iOS, DST/time-zone tests, duplicate suppression, clear “contact your care team” fallback.

### WS6 — Trusted contacts and urgent help

**Objective:** provide a low-friction, honest escalation path.

**Deliverables:** consented contact record; emergency card; help/panic flow with confirmation/undo; call/SMS/share intents; queued remote alert; delivery status; offline fallback instructions.

**Dependencies:** WS0 consent and escalation policy, WS3, WS2 platform adapters.

**Exit evidence:** one-handed flow, accidental activation test, offline behavior, delivery-state copy, contact revocation test.

### WS7 — Appointments, history, export, and deletion

**Objective:** complete the user-controlled record lifecycle.

**Deliverables:** appointment state machine and reminders; filters and summaries; CSV/JSON export; account/data deletion; restore/recovery guidance.

**Dependencies:** WS3, WS4, WS5, WS0 legal retention decision.

**Exit evidence:** export opens correctly, deletion is idempotent and audited, appointments remain understandable with large text.

### WS8 — Auth, sync, and backend services

**Objective:** add optional cloud continuity without weakening local capture.

**Deliverables:** Supabase Auth/Postgres/Edge Functions (or approved equivalent); row-level security; outbox/inbox sync; conflict policy; remote notification adapter; rate limits and audit events.

**Dependencies:** stable local schema from WS3; security review from WS0.

**Exit evidence:** two-device sync tests, replay/idempotency tests, RLS negative tests, secret rotation drill, offline-first behavior unchanged.

### WS9 — Quality, operations, and release

**Objective:** prove the product can be safely shipped and operated.

**Deliverables:** CI checks; device matrix; observability; backup/restore; incident runbook; staged rollout; release evidence bundle; support content.

**Dependencies:** all P0 features.

**Exit evidence:** release checklist signed, rollback rehearsed, no open P0/P1 safety defects, beta monitoring live.

## 5. 18-week sequence and gates

Dates are relative to project kickoff so the plan survives staffing changes.

| Phase | Weeks | Focus | Gate |
|---|---:|---|---|
| P0 — validate | 1–2 | clinical/legal decisions, user research, risk register, architecture spikes | **G0:** clinical boundary and data/consent decisions approved |
| P1 — foundation | 3–5 | design system, Expo shell, local schema, CI/EAS, accessibility primitives | **G1:** offline shell builds on physical Android and iOS |
| P2 — core slice | 6–8 | glucose capture, measurement plans, history, local notifications | **G2:** glucose vertical slice passes clinical and accessibility review |
| P3 — routines | 9–11 | medications, occurrences, reminder reliability, trusted contacts | **G3:** routine and help flows pass failure-mode tests |
| P4 — continuity | 12–14 | auth, sync, appointments, export, deletion, emergency card | **G4:** two-device sync and data-rights evidence complete |
| P5 — controlled beta | 15–18 | hardening, pilot, monitoring, release candidate, rollback | **G5:** beta go/no-go signed by product, clinical, QA, security, and legal |

### Gate evidence rule

A phase is not complete because code merged. It is complete only when the gate evidence is attached to the release issue: test results, device/build identifiers, reviewer, unresolved risks, and rollback step.

## 6. Prioritized backlog

Estimates are relative engineering effort: `S` (1–2 days), `M` (3–5 days), `L` (1–2 weeks). Each item is intended to be one reviewable work-unit commit or a small chained PR.

| ID | Priority | Size | Work item | Acceptance evidence |
|---|---|---:|---|---|
| GOV-01 | P0 | M | Confirm intended use, clinical boundary, escalation copy | signed clinical review and ADR if boundary changes |
| GOV-02 | P0 | M | Consent, retention, deletion, and Colombia privacy decisions | counsel notes mapped to requirements |
| UX-01 | P0 | M | Tokens, typography, semantic status colors, touch targets | contrast and large-text report |
| UX-02 | P0 | M | Accessible navigation shell and persistent Help action | TalkBack/VoiceOver walkthrough |
| FND-01 | P0 | L | Expo Router app shell, TypeScript, environments, CI | Android/iOS/web builds and CI green |
| FND-02 | P0 | M | EAS profiles and signing placeholders | development/preview build instructions |
| DATA-01 | P0 | L | SQLite schema, migrations, repositories, idempotent IDs | migration/restart/offline test suite |
| DATA-02 | P0 | M | Secure storage and key lifecycle | threat-model review; no sensitive logs |
| GLU-01 | P0 | L | Glucose capture with automatic timestamp and context | offline physical-device test |
| GLU-02 | P0 | M | Measurement plans and safe educational states | clinical content approval |
| GLU-03 | P1 | M | History filters, summaries, and trend visualization | accessibility and deterministic fixtures |
| MED-01 | P0 | L | Medication and occurrence state machines | transition/property tests |
| NOT-01 | P0 | L | Local reminder scheduler and exact-time behavior | Android/iOS notification matrix |
| NOT-02 | P0 | M | Snooze/skip/taken and missed-dose copy | no dosing advice; DST tests |
| HELP-01 | P0 | L | Emergency card and trusted-contact consent | revoke/export/delete tests |
| HELP-02 | P0 | M | Panic/help flow with confirmation and delivery states | offline and accidental-tap tests |
| APP-01 | P1 | M | Appointment states and reminders | state transition tests |
| HIST-01 | P1 | M | CSV/JSON export with schema version | import-independent fixture validation |
| RIGHTS-01 | P0 | M | Account/data deletion and audit event | idempotent deletion evidence |
| SYNC-01 | P1 | L | Auth, outbox/inbox sync, conflict policy | two-device replay and RLS tests |
| SYNC-02 | P1 | M | Remote alert adapter with rate limits | provider failure and retry tests |
| SEC-01 | P0 | M | Threat model, RLS, secret scan, dependency policy | security review signed |
| QA-01 | P0 | L | Unit/component/e2e matrix and physical-device lab | release evidence template |
| OPS-01 | P0 | M | Monitoring, backup/restore, incident and rollback runbooks | tabletop exercise completed |
| BETA-01 | P0 | L | Controlled pilot with support channel and feedback loop | pilot report and go/no-go decision |

## 7. Definition of Ready and Definition of Done

### Definition of Ready

A work item may start only when:

- user outcome and non-goals are written;
- clinical or privacy impact is identified;
- acceptance criteria include offline, error, and accessibility states;
- dependencies and migration impact are known;
- test data and rollback boundary are named;
- the accountable reviewer is assigned.

### Definition of Done

A work item is done only when:

- implementation, tests, and user-facing documentation are in the same work unit;
- lint, typecheck, unit/component tests, and focused e2e checks pass;
- Android/iOS behavior is verified where native behavior is involved;
- TalkBack/VoiceOver, large text, contrast, reduced motion, and keyboard/web behavior are checked as applicable;
- telemetry contains no raw health values or secrets;
- clinical/security/legal review is recorded when applicable;
- migration, rollback, and support notes are updated;
- the Conventional Commit and PR describe outcome, verification, and rollback boundary.

## 8. Quality strategy and release gates

### Automated checks on every pull request

1. Markdown/link validation for the blueprint.
2. Formatting, lint, TypeScript, and unit tests.
3. SQLite migration and repository tests.
4. Component accessibility assertions.
5. Secret/dependency scanning.
6. Expo web build and Docker smoke test for the documentation site.

### Required pre-beta checks

- Physical Android and iOS matrix covering supported OS versions.
- Offline capture, process kill, restart, clock/time-zone/DST, and duplicate-tap tests.
- Notification permission denied, revoked, delayed, and provider failure tests.
- Panic/help accidental activation and contact revocation tests.
- Export, deletion, restore, and account recovery tests.
- TalkBack and VoiceOver with large text; color-blind and reduced-motion checks.
- Clinical review of every threshold, warning, fallback, and medication message.

### Release blockers

- Any P0 clinical safety, privacy, data-loss, authentication, or emergency-flow defect.
- A message that implies diagnosis, dose calculation, or guaranteed alert delivery.
- A safety action reachable only by color, sound, precision gesture, or online connectivity.
- Unreviewed schema migration or untested deletion/restore behavior.
- Missing rollback or incident owner.

## 9. Environments and delivery pipeline

| Environment | Purpose | Data | Access |
|---|---|---|---|
| Local | feature development | synthetic fixtures only | developer machine |
| Preview | PR review and UX checks | synthetic fixtures | CI artifact/EAS preview |
| Staging | integration, device, and pilot rehearsal | synthetic or consented test data | restricted team access |
| Production | controlled beta and later public release | encrypted user data | least privilege; audited |

Current repository CI validates Markdown and builds the documentation container. The VPS deployment is intentionally restricted to `127.0.0.1:18080` and uses a dedicated forced-command deploy user; it is **not** a public app endpoint. When the Expo app exists:

- use EAS for signed native builds and staged channels;
- keep backend migrations separately reviewed and reversible;
- deploy backend/web artifacts with an explicit Compose project name;
- never deploy with root SSH or a shared personal key;
- keep secrets in GitHub Environments/VPS secret storage, never in the repository;
- document the public domain, TLS, backups, and on-call ownership before production exposure.

## 10. Observability and support

Capture operational events, not health content:

- app version, platform, locale, sync latency, queue depth, notification outcome, crash/error class, and feature-flag state;
- never log glucose values, medication names/doses, emergency-card contents, contact details, or access tokens;
- alert on sync failures, notification-provider failures, elevated crash-free-session regression, backup failure, and abnormal queue growth;
- retain an immutable audit trail for consent, access, export, deletion, and emergency-alert attempts.

Support must have a short script for: lost phone, wrong reading, missed reminder, contact not reached, duplicate alert, account deletion, and suspected clinical emergency. Support must never give dosing advice.

## 11. Critical risks and mitigations

| Risk | Trigger | Mitigation | Owner |
|---|---|---|---|
| Users interpret education as treatment | copy or UI implies a personal action | clinical review, explicit care-plan language, release blocker | clinical lead |
| Reminder is missed or duplicated | OS permission, DST, reboot, duplicate scheduling | local occurrence ledger, reconciliation, device matrix, truthful status | mobile lead |
| Panic flow activates accidentally | one-tap destructive action | confirmation/undo, large target, haptics/voice alternatives, audit event | UX lead |
| Contact alert is not delivered | offline/provider/API failure | queue state, retry, call/SMS fallback, no guarantee wording | backend lead |
| Data loss or sync conflict | process kill, two-device edit, migration | idempotency, outbox/inbox, conflict policy, backups, restore drill | backend/ops |
| Sensitive data exposure | logs, analytics, backups, RLS error | data inventory, redaction, RLS tests, secret scan, least privilege | security lead |
| Regulatory scope expands | intended use changes | ADR + counsel review before marketing or feature change | product owner |
| Shared VPS regression | port/name/capability collision | explicit Compose project, localhost binding, canary and rollback | operations lead |

## 12. First 10 implementation actions

1. Assign product, clinical, accessibility, security, QA, and operations owners.
2. Run a 90-minute clinical-boundary workshop and close GOV-01.
3. Run a privacy/consent/retention workshop and close GOV-02.
4. Recruit at least three target users, including one older adult and one TalkBack/VoiceOver user.
5. Convert `design.md` tokens into a small component inventory and UX-01/UX-02 tickets.
6. Scaffold Expo Router, TypeScript, environments, and CI (FND-01).
7. Write the SQLite schema/migration draft and data classification (DATA-01).
8. Build the navigation shell with Today, History, Care, Profile, and persistent Help.
9. Implement one complete offline glucose-entry vertical slice with synthetic fixtures.
10. Hold Gate G1 review before adding medication, sync, or remote alert complexity.

## 13. Decision log and open questions

Decisions already captured in the repository:

- local-first architecture and offline capture (`docs/adr/0001-local-first.md`);
- strict clinical boundary (`docs/adr/0002-clinical-boundary.md`);
- Expo + Supabase direction (`docs/adr/0003-expo-supabase-stack.md`);
- Atmos-inspired dark, amber, mobile-first visual language (`design.md`).

Open questions that must be answered before the corresponding gate:

- Which emergency numbers and care pathways are configurable for each launch region? The mobile build now reads `EXPO_PUBLIC_EMERGENCY_REGION` and `EXPO_PUBLIC_EMERGENCY_NUMBER`, defaulting to Colombia/123 for this launch.
- Which Supabase region, retention period, and backup policy satisfy counsel’s decision?
- Which exact Android/iOS versions are in the beta support matrix?
- Will remote alerts use SMS, WhatsApp, push, or a provider abstraction at beta?
- Which clinician-authored measurement-plan format is accepted for the first pilot?
- What is the support SLA and who can view audit events?

## 14. Completion checklist

- [ ] P0–P5 gates have signed evidence.
- [ ] All P0 backlog items are complete; P1 items have explicit beta decisions.
- [ ] No open release-blocking clinical, privacy, security, or data-loss defect.
- [ ] Physical-device accessibility and notification tests are attached.
- [ ] Export, deletion, backup, restore, incident, and rollback drills are complete.
- [ ] Clinical lead, product owner, QA, security, operations, and counsel sign the beta decision.
- [ ] The public release notes state limitations and emergency-service boundaries plainly.

**Next document to execute:** [Roadmap and backlog](docs/10-roadmap-backlog.md), then create the first work-unit issue for `GOV-01` and `FND-01`.

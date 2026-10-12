# Product requirements for a safe diabetes companion

## Release objective

Deliver a small patient-facing app that reliably supports daily routines and emergency preparation, while keeping treatment decisions with the patient and their healthcare team.

## Core journeys

### 1. First-run setup

1. Choose language, unit (`mg/dL` or `mmol/L`), text size, and simplified mode.
2. Read and accept privacy/health-data consent; optional features have separate consent.
3. Create an emergency card and configure the local emergency number.
4. Add the clinician-provided glucose plan and medication schedule.
5. Add a trusted contact; the contact must accept before automatic alerts are enabled.
6. Test a reminder and a non-emergency contact alert.

The user may skip cloud account setup. Core local features remain usable.

### 2. Record glucose

Required:

- Value and unit.
- Automatic device timestamp and timezone.
- Source: manual, imported, or device integration.

Optional:

- Context: fasting, before meal, after meal, bedtime, symptoms, exercise, illness, or other.
- Meal relation and minutes after meal.
- Symptoms, notes, and a structured ketone-strip result (`not_checked`, `negative`, `trace`, `small`, `moderate`, `large`, or `unknown`). Photo references remain deferred until a privacy-safe local media flow is approved.
- Edit timestamp with an audit entry.

After save, the app shows the care-plan category and the exact clinician-approved instruction. It must not invent a dose or diagnosis.

### 3. Follow a measurement plan

- Support one to nine checks per day, including one, two, or three explicit
  post-meal windows for each main meal when prescribed.
- Support fixed times and relative-to-meal windows.
- Allow day-of-week exceptions and temporary sick-day plans.
- Record due, completed, skipped, and expired occurrences.
- Avoid duplicate reminders after timezone or daylight-saving changes.

### 4. Manage medication

- Store name, presentation, dose as prescribed text, route, instructions, start/end dates, prescriber, and optional inventory.
- Support fixed times, intervals, specific days, and meal-relative schedules.
- Record taken, skipped, snoozed, and not recorded.
- Provide “I am not sure” guidance to contact the care team rather than guessing.
- Never recommend doubling a missed dose.

### 5. Ask for help

The persistent **Get help** action opens a confirmation sheet with:

1. **Call emergency services** using the configured number.
2. **Alert trusted contacts** with the minimum consented information.
3. **Show emergency card** for a nearby helper.
4. **Record how I feel** without delaying the first three actions.

If the user confirms a severe incident, the app logs it locally immediately, attempts remote alert delivery, and shows per-channel status: queued, sent, delivered where supported, failed, or unknown.

### 6. Track appointments

Canonical states:

`requested → pending_authorization → authorized → scheduled → completed`

The record also preserves the reviewed terminal outcomes `denied`, `missed`, and `cancelled`. A denied or missed appointment may be returned to `requested` when the user starts a new authorization request; terminal states never keep an active reminder.

Alternative terminal states: `denied`, `cancelled`, `missed`.

Fields include specialty, provider, EPS/insurer, authorization number, requested date, scheduled time, location/video link, preparation notes, documents, and reminders.

### 7. Emergency card and health history

Available offline and from the lock-screen-safe app entry point after explicit opt-in:

- Preferred name and photo (optional).
- Identity document type/number, blood type, and RH factor (optional user-entered emergency data; never treated as verified identity or laboratory data).
- Diabetes type, year diagnosed, insulin use.
- Allergies and critical conditions.
- Current medication summary.
- Trusted contacts.
- EPS/insurer, policy/member number, preferred/assigned IPS, and care-facility address.
- Configured emergency number and care-team contact.
- Last updated date and a warning that data may be incomplete.

### 8. Review and export

- Timeline filtered by date, glucose context, medications, incidents, or appointments.
- Daily/weekly summaries without judgmental scoring.
- Export selected rolling date range (7 days, 30 days, or all history) to CSV and an accessible printable report; JSON remains a complete local backup.
- Share only after explicit confirmation of recipient and included fields.

## Functional requirements

| ID | Requirement | MVP acceptance |
|---|---|---|
| FR-01 | Offline-first record capture | Create/read/update glucose, medication events, appointments, and emergency card in airplane mode. |
| FR-02 | Automatic timestamp | Store UTC instant, local timezone, offset, and user-edited flag. |
| FR-03 | Unit safety | Preserve original unit; convert for display using a tested decimal rule. |
| FR-04 | Personalized thresholds | Versioned care plan controls categories and instructions. |
| FR-05 | Reliable local reminders | Reconcile scheduled OS notifications after edits, reboot, timezone changes, and app updates. |
| FR-06 | Trusted contact consent | No automatic alert until the contact accepts and the user enables a channel. |
| FR-07 | Emergency action | Call path never depends on network, authentication, or cloud sync. |
| FR-08 | Delivery honesty | UI distinguishes “attempted,” “sent,” and “acknowledged.” |
| FR-09 | Appointment state machine | Invalid transitions are blocked and all changes are timestamped. |
| FR-10 | Data portability | Export and deletion are available from settings. |
| FR-11 | Accessibility | Critical journeys pass TalkBack, VoiceOver, large text, contrast, and switch-control checks. |
| FR-12 | Auditability | Clinical plan and schedule edits preserve actor, time, old value, and new value. |

## Non-functional requirements

| Area | Requirement |
|---|---|
| Startup | Warm start under 1 second on a representative mid-range Android device; cold start target under 2.5 seconds. |
| Offline | Core read/write and emergency card do not require connectivity. |
| Resilience | User writes use local transactions and an idempotent sync outbox. |
| Battery | No continuous background polling or location tracking. |
| Bundle | Keep the initial route lean; lazy-load reports and noncritical media. |
| Privacy | No health values in lock-screen notification bodies by default. |
| Availability | Cloud outage must not block local records or emergency calling. |
| Localization | Store structured values; localize labels, dates, units, and legal text. |

## Explicitly out of scope for MVP

- Diagnosis or classification of diabetes.
- Automated medication changes, dose calculators, or closed-loop control.
- Continuous background location tracking.
- Guaranteed delivery of notifications, SMS, email, or emergency response.
- Integration with every EPS/IPS authorization system.
- Clinician EHR write-back.
- Public social/community features.

## Definition of product validation

- Five target patients, including at least two older adults, complete core journeys without facilitator rescue.
- A diabetes-care clinician signs off the wording and escalation matrix.
- A privacy/security threat model and data-protection impact assessment are approved.
- The intended purpose is reviewed against INVIMA medical-device criteria.
- All MVP acceptance criteria in the testing document have evidence.

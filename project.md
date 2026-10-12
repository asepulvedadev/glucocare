# GlucoCare product brief

## Outcome

Create a fast, simple, and accessible companion that reduces the mental load of diabetes self-management without pretending to replace clinical judgment.

## Problem

People living with diabetes may need to remember several glucose checks, medication times, medical appointments, and emergency instructions. Illness, low vision, reduced dexterity, hypoglycemia, stress, or cognitive disorientation can make a complicated interface actively unsafe.

## Primary users

1. **Patient:** records information and receives reminders.
2. **Trusted contact:** receives only consented alerts and can help during an incident.
3. **Clinician:** defines the care plan outside the MVP or reviews an exported report; a clinician portal is not part of the first release.

## MVP promise

The user can:

- Record a glucose reading in under 20 seconds, with automatic date/time and optional context.
- Follow a configurable schedule of glucose checks around meals or at fixed times.
- Store medications, dose text, route, instructions, and reminder times.
- Mark reminders as taken, skipped, or delayed without the app changing prescribed treatment.
- Maintain one or more trusted contacts with explicit consent and alert preferences.
- Use a prominent help action to call the configured emergency number, notify contacts, and record an incident.
- Track appointments through authorization and scheduling states.
- Display an offline emergency card with essential medical and insurance information.
- Export a human-readable history for a healthcare professional.

## Non-negotiable safety boundaries

- No diagnosis, automated prescription, or insulin-dose calculator in the MVP.
- No universal “safe” range presented as personalized medical advice.
- Thresholds and instructions must come from a care plan approved by the user’s clinician.
- Generic educational defaults are clearly labeled and never silently override a personalized plan.
- Emergency actions work without opening a session or waiting for synchronization.
- A sent notification is never represented as delivered or acknowledged unless confirmed.

## Product principles

| Principle | Practical consequence |
|---|---|
| Safety before engagement | No streaks or guilt language for missed medication or readings. |
| Offline first | Capture and emergency card remain available without internet. |
| Recognition over recall | The home screen shows the next important action; users do not hunt through menus. |
| Accessible by default | Large targets, scalable text, screen-reader semantics, redundant visual/audio/haptic cues. |
| Minimum necessary data | Collect only data required for the stated feature. |
| Human-controlled escalation | Users configure who is contacted and what is shared. |
| Auditable changes | Edits to clinical schedules and thresholds preserve history. |

## Scope by release

### MVP

- Local-first patient profile and emergency card.
- Glucose logs and measurement schedules.
- Medication list, schedules, local reminders, and adherence events.
- Trusted contact invitation/consent and server-mediated push/email alerts.
- Help/panic flow with call, contact alert, incident log, and clear delivery status.
- Appointment workflow and reminders.
- CSV/PDF-style printable report export.
- Optional account and encrypted synchronization.

### Later

- Clinician/caregiver portal.
- CGM or glucometer integrations.
- Health Connect / HealthKit integration.
- Pharmacy refill workflows.
- Clinically validated prediction models.
- Remote treatment changes or insulin calculations.

## Success measures

| Measure | Initial target |
|---|---:|
| Median time to record glucose | ≤ 20 seconds |
| Critical flows completed with screen reader | 100% |
| Crash-free sessions | ≥ 99.8% |
| Local reminder scheduling success | ≥ 99% in controlled device tests |
| Panic flow starts a call in two actions or fewer | 100% |
| Users who can explain what the app does *not* do | ≥ 90% in usability tests |

## Open decisions requiring human validation

- Final product name and brand.
- Whether the first release is Colombia-only.
- Identity model for minors, dependants, and caregivers.
- Cloud region, data-processing agreements, and retention period.
- Which alert channels are funded: push, email, SMS, or WhatsApp.
- Whether clinicians can author care plans; this materially changes regulatory scope.

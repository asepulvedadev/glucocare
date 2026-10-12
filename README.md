# GlucoCare — product and engineering blueprint

GlucoCare is a lightweight, accessible Expo application for people living with diabetes. It helps users record glucose readings, follow medication and measurement schedules, manage appointments, keep an emergency card, and ask a trusted contact for help.

> **Product boundary:** GlucoCare supports self-management. It does not diagnose, prescribe, calculate insulin doses, or replace emergency services or a healthcare professional.

## Start here

1. Read the [product brief](project.md).
2. Validate the [product requirements](docs/01-product-requirements.md) with patients and clinicians.
3. Review [clinical safety](docs/02-clinical-safety.md) and [privacy/compliance](docs/07-security-privacy-compliance.md) before implementation.
4. Follow the [complete development plan](DEVELOPMENT_PLAN.md) and build the first vertical slice from the [roadmap and backlog](docs/10-roadmap-backlog.md).

## Documentation map

| Area | Document |
|---|---|
| Product scope and requirements | [Product requirements](docs/01-product-requirements.md) |
| Clinical safeguards | [Clinical safety](docs/02-clinical-safety.md) |
| User experience and inclusion | [UX and accessibility](docs/03-ux-accessibility.md) |
| Technical structure | [Architecture](docs/04-architecture.md) |
| Entities and state machines | [Data model](docs/05-data-model.md) |
| Reminders and escalation | [Notifications](docs/06-notifications-escalation.md) |
| Security, privacy, and regulation | [Security and compliance](docs/07-security-privacy-compliance.md) |
| Service boundaries | [API contracts](docs/08-api-contracts.md) |
| Quality strategy | [Testing](docs/09-testing-quality.md) |
| MVP plan | [Roadmap and backlog](docs/10-roadmap-backlog.md) |
| Complete development plan | [Development plan](DEVELOPMENT_PLAN.md) |
| Operational readiness | [Operations](docs/11-operations-observability.md) |
| Release evidence | [Beta evidence index](docs/RELEASE_EVIDENCE.md) |
| Open risks | [Risk register](docs/12-risk-register.md) |
| Product vocabulary | [Glossary](docs/GLOSSARY.md) |
| Architecture decisions | [ADR index](docs/adr/README.md) |
| Legal drafts checklist | [Legal index](docs/legal/README.md) |
| Security reporting | [Security policy](SECURITY.md) |

## Proposed delivery target

- **Tier 1:** Android and iOS, including offline capture and native reminders.
- **Tier 2:** responsive web companion for review, export, and basic capture; it must not promise native alarm or emergency behavior.
- **Initial locale:** Spanish for Colombia, with all country-specific emergency and legal content configurable.

## Required validation before release

- At least one endocrinology/diabetes-care professional approves the clinical content and escalation language.
- Target users, including older adults and users of TalkBack/VoiceOver, complete usability tests.
- Colombian privacy counsel validates sensitive-health-data processing and consent flows.
- INVIMA counsel determines whether the final intended purpose makes the software a medical device.
- Panic, reminders, offline mode, export, deletion, and restore are tested on physical Android and iOS devices.

## Status

The Expo foundation, offline glucose logging with timestamp/correction audit, clinician-provided threshold classification, history filters, configurable fixed and meal-relative measurement plans, daily measurement occurrences and bounded glucose-check reminders, medication reminders with prescriber/instructions/validity metadata, medication occurrence tracking, editable appointment records with reminder rescheduling, appointment states, emergency card, editable trusted contacts with consent reset, expiring trusted-contact invitation/acceptance flow, local help-event flow, local JSON/CSV export and deletion controls, printable clinician report, device-local accessibility preferences, native SQLCipher key initialization, optional biometric/device-passcode app lock with an emergency-help bypass, opt-in Supabase Auth/outbox sync with cursor-based pull projection and explicit conflict review, account deletion workflow, a Supabase RLS schema, emergency-alert and contact-invitation functions plus provider-worker scaffolds, domain tests, EAS build profiles, and an AutoKing-hosted Expo web staging build are implemented in [apps/mobile](apps/mobile). The VPS release keeps a three-bundle rollback cache and includes a payload-free systemd health check. Clinician portal/configuration, native physical-device release evidence, and production backend/provider credentials remain on the development plan.

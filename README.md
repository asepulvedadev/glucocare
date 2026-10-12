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
| Open risks | [Risk register](docs/12-risk-register.md) |
| Product vocabulary | [Glossary](docs/GLOSSARY.md) |
| Architecture decisions | [ADR index](docs/adr/README.md) |
| Legal drafts checklist | [Legal index](docs/legal/README.md) |

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

The Expo foundation, offline glucose logging, configurable measurement plans, medication reminders, appointment states, emergency card, trusted contacts, local help-event flow, local JSON/CSV export and deletion controls, opt-in Supabase Auth/outbox sync, a Supabase RLS schema, emergency-alert function scaffold, domain tests, and EAS build profiles are implemented in [apps/mobile](apps/mobile). Clinician configuration, conflict-aware multi-device sync, account deletion, physical-device release evidence, and production backend/provider deployment remain on the development plan.

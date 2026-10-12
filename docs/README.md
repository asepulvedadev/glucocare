# Documentation guide

These documents are the source of truth for product intent, safety, and implementation constraints.

## Reading order

1. [Product requirements](01-product-requirements.md)
2. [Clinical safety](02-clinical-safety.md)
3. [UX and accessibility](03-ux-accessibility.md)
4. [Architecture](04-architecture.md)
5. [Data model](05-data-model.md)
6. [Notifications and escalation](06-notifications-escalation.md)
7. [Security, privacy, and compliance](07-security-privacy-compliance.md)
8. [API contracts](08-api-contracts.md)
9. [Testing and quality](09-testing-quality.md)
10. [Roadmap and backlog](10-roadmap-backlog.md)
11. [Operations](11-operations-observability.md)
12. [Risk register](12-risk-register.md)

## Document ownership

| Document | Accountable reviewer |
|---|---|
| Product requirements | Product owner |
| Clinical safety | Clinical safety lead |
| UX/accessibility | Accessibility lead + patient panel |
| Architecture/API/data | Engineering lead |
| Security/compliance/legal | Security lead + Colombian counsel |
| Testing/operations | QA and operations leads |

## Change rule

Any change to emergency behavior, clinical thresholds, medication semantics, notification delivery claims, consent, or data retention requires review by the accountable owner and an ADR when it changes architecture or product boundaries.

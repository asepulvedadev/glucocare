# Product risk register

## Scoring

- Likelihood: 1 (rare) to 5 (frequent).
- Impact: 1 (minor) to 5 (catastrophic).
- Initial score = likelihood × impact. Residual score is set only after controls are implemented and tested.

## Current risks

| ID | Risk | L | I | Score | Planned controls | Owner | Status |
|---|---|---:|---:|---:|---|---|---|
| R-01 | Incorrect risk classification delays care | 3 | 5 | 15 | Deterministic versioned rules, symptom override, clinical approval, golden tests | Clinical | Open |
| R-02 | User confuses provider acceptance with delivered alert | 4 | 5 | 20 | Delivery ledger, explicit labels, fallback call action | Product | Open |
| R-03 | Notification is suppressed by OS/battery policy | 4 | 4 | 16 | Local scheduling, permission diagnostics, in-app due list, truthful limitations | Mobile | Open |
| R-04 | Wrong unit or conversion changes interpretation | 3 | 5 | 15 | Unit always shown, original+canonical storage, boundary/property tests | Engineering | Open |
| R-05 | Unauthorized access to health data | 3 | 5 | 15 | Encryption, private PostgreSQL network, patient-scoped API authorization, least privilege, negative tests, penetration test | Security | Open |
| R-06 | Lock-screen notification exposes health data | 3 | 4 | 12 | Generic default body, explicit preview consent, privacy tests | Product | Open |
| R-07 | Trusted contact never consented or was wrong | 3 | 4 | 12 | Verified invitation, acceptance, scope, revocation, periodic review | Backend | Open |
| R-08 | Emergency number is wrong for locale | 3 | 5 | 15 | Country/municipality configuration, onboarding verification, visible edit/test | Product | Open |
| R-09 | App is regulated as a medical device unexpectedly | 3 | 5 | 15 | Intended-purpose control, INVIMA assessment, claim review | Legal | Open |
| R-10 | User cannot act because of low vision/confusion | 4 | 5 | 20 | Accessible defaults, simplified mode, human testing, emergency-first IA | Accessibility | Open |
| R-11 | Local database loss/reinstall loses critical history | 3 | 4 | 12 | Optional sync/export, backup guidance, tested key lifecycle, no false backup claim | Engineering | Open |
| R-12 | Sync conflict silently overwrites care plan | 3 | 5 | 15 | Immutable revisions, explicit conflict resolution, audit | Engineering | Open |
| R-13 | Provider/logging SDK receives sensitive payload | 3 | 5 | 15 | Data minimization, log allowlist, SDK review, egress tests | Security | Open |
| R-14 | Care plan becomes stale | 4 | 4 | 16 | Review date, visible source, expiration warning, safe fallback | Clinical | Open |
| R-15 | Medication reminder is treated as medical advice | 3 | 4 | 12 | Prescription-as-record model, no dose change/doubling advice, copy tests | Clinical | Open |
| R-16 | Support staff gives unsafe clinical guidance | 2 | 5 | 10 | Support scripts, scope training, escalation to care team | Operations | Open |
| R-17 | Web version implies alarm parity with native | 3 | 4 | 12 | Tier-2 label, capability detection, prominent limitation | Product | Open |
| R-18 | Cost/provider outage blocks contact alerts | 3 | 4 | 12 | Provider adapter, quotas, monitoring, direct call fallback | Operations | Open |

## Review cadence

- Review biweekly during implementation.
- Review before every beta/release.
- Re-score after a patient-safety incident, security incident, provider change, or new intended-purpose claim.
- Close a risk only with linked verification evidence, not merely completed code.

## Stop-ship conditions

- Cross-patient data access is possible.
- Unit/threshold boundary test fails.
- Emergency action requires network/login.
- UI claims an unconfirmed alert is delivered.
- Screen-reader user cannot complete emergency or glucose flow.
- Clinical or legal approval for released claims is missing.
- Data migration can destroy history without recovery.

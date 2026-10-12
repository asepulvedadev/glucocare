# Release checklist

## Product and clinical

- [ ] MVP scope and intended purpose match implementation and store copy.
- [ ] Clinical content/rules have source, version, tests, and approval.
- [ ] No diagnosis, dose calculation, or guaranteed emergency-response claim exists.
- [ ] Emergency number setup and offline emergency path pass.

## Accessibility and usability

- [ ] TalkBack and VoiceOver critical journeys pass on physical devices.
- [ ] Largest text, high contrast, reduced motion, and switch/keyboard tests pass.
- [ ] Target-user usability study exit criteria pass.
- [ ] All statuses have text/icon semantics, not color alone.

## Privacy, security, and legal

- [ ] Privacy/consent/terms approved and versioned.
- [ ] INVIMA classification assessment recorded.
- [ ] RLS/access matrix and penetration test pass.
- [ ] Logs, analytics, crash reports, and notifications contain no prohibited data.
- [ ] Export, revocation, deletion, backup expiry, and incident response are operational.

## Reliability and operations

- [ ] Offline, provider outage, denied permission, expired session, reboot, and timezone scenarios pass.
- [ ] Database migration/rollback and restore rehearsed.
- [ ] Alert delivery wording matches evidence.
- [ ] Dashboards, alerts, on-call ownership, and runbooks are active.
- [ ] Staged rollout and rollback criteria are approved.

## Final authorization

| Role | Name | Evidence/date |
|---|---|---|
| Product owner |  |  |
| Clinical safety owner |  |  |
| Accessibility owner |  |  |
| Security owner |  |  |
| Privacy/legal reviewer |  |  |
| Regulatory reviewer |  |  |
| Operations owner |  |  |

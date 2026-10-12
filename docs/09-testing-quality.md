# Testing and quality strategy

## Quality principle

Safety-critical behavior requires evidence at the domain, persistence, integration, device, accessibility, and human-usability levels. A green unit-test suite alone is NOT sufficient.

## Test pyramid

### Domain unit tests

Fast, deterministic tests for:

- Unit conversions and threshold boundaries.
- Risk-rule ordering and explanation IDs.
- Medication and measurement occurrence generation.
- Appointment state transitions.
- Timezone, daylight-saving, and clock-shift calculations.
- Shared native notification budget, duplicate suppression, and partial-schedule truthfulness.
- Consent and message-minimization rules.
- Sync conflict and idempotency decisions.

Use table-driven boundary tests and property-based tests for conversions/schedules.

### Repository and migration tests

- Fresh database initialization.
- Upgrade from every supported schema version.
- Failed migration rollback and backup recovery.
- Atomic record + outbox transaction.
- Foreign keys, unique occurrence IDs, indexes, and tombstones.
- Encrypted database open, key rotation, reinstall, and restore behavior.

### Backend integration tests

- API authorization matrix: owner, different patient, revoked delegate, anonymous, and service function.
- Private PostgreSQL exposure is verified: the database is reachable only from the VPS Docker network; public access is rejected.
- Idempotent sync and emergency dispatch.
- Consent expiry/revocation race.
- Provider timeout, duplicate callback, and partial channel failure.
- Export/deletion lifecycle and backup expiry evidence.

The PostgreSQL CI job runs `server/scripts/smoke-api.mjs` with two sessions for
the same synthetic patient, an anonymous request, and a different patient. It
proves that same-patient devices converge on the newest timestamped projection,
stale events cannot regress it, anonymous pulls are rejected, and a different
patient cannot read the record.

It also runs `server/scripts/smoke-provider-retry.mjs` with a
synthetic local provider. It returns one transient HTTP 500, verifies the
delivery is requeued with an attempt count and backoff, then returns a provider
message ID and verifies the delivery and parent alert become
`provider_accepted`.

The same job starts `server/scripts/synthetic-provider.mjs` and runs the API
smoke with Resend credentials pointed at that local provider. The smoke proves
that an email invitation is reported as `provider_accepted` while an SMS
invitation without Twilio credentials remains `not_configured`; it also keeps
the provider path deterministic and network-free in CI.

It also runs `server/scripts/smoke-provider-callback.mjs`: a signed synthetic
callback moves a matching delivery to `delivered`, a late failure cannot regress
that terminal state, and the callback endpoint rejects invalid signatures.

### UI/component tests

- Labels, roles, states, hints, focus order, and dynamic announcements.
- Largest font size and narrow viewport.
- Error messages associated with inputs.
- No color-only status.
- Privacy-safe notification previews.

### End-to-end device tests

Run on physical mid-range Android and supported iPhone:

- Onboarding and local-only mode.
- Record/correct glucose offline.
- Medication reminder actions from background/terminated states.
- Panic flow with network on/off and permissions denied.
- Reboot, timezone change, and app update reconciliation.
- Session expiration during local write/sync.
- Export and account deletion.
- TalkBack and VoiceOver critical journeys.

Automate stable flows, but preserve manual exploratory and accessibility sessions.

## Clinical scenario suite

Every scenario states care-plan revision and expected explanation/action.

| Scenario | Expected result |
|---|---|
| Value exactly on low boundary | Deterministic documented category. |
| Same value in different units | Same canonical classification. |
| Severe symptom with “normal” value | Emergency guidance based on symptom rule. |
| High reading without personalized plan | No invented dose or universal emergency claim. |
| Stale/expired plan | Visible warning and safe fallback. |
| Corrected reading | Original remains auditable; result is reevaluated against correct plan version. |
| Child/pregnancy flag | Generic adult action is not assumed; clinician-plan instruction wins. |

Clinical owner signs the golden scenario set.

## Accessibility verification

- Automated checks catch missing semantics but do not replace human tests.
- Test all critical flows with TalkBack and VoiceOver.
- Test keyboard/switch navigation and focus restoration.
- Test 200%+ text sizing, high contrast, dark mode, reduced motion, and grayscale.
- Recruit users with low vision, tremor, and mild cognitive difficulty for moderated testing.

## Security verification

- Static analysis, dependency audit, secret scan, and SBOM on CI.
- Mobile application security review aligned with OWASP MASVS.
- API authorization/fuzz tests and rate-limit tests.
- Penetration test before public release and after material auth/data-flow changes.
- Verify logs/crash reports/analytics contain no raw health values or access tokens.

## Performance budgets

Measure on representative hardware, release build, and realistic history size.

| Metric | Target |
|---|---:|
| Warm start | < 1.0 s |
| Cold start | < 2.5 s |
| Save glucose locally | < 150 ms p95 |
| Today screen interaction ready | < 2.0 s cold |
| Scroll list | Visually stable at 60 fps target |
| Crash-free sessions | ≥ 99.8% |

The staging web bundle is kept under a 5 MiB compressed-on-disk budget in CI;
native release size and startup targets still require measurements on physical
devices.

Targets are product goals and may be revised with measured evidence.

## CI quality gates

- Type checking and lint.
- Unit/domain tests with changed-rule coverage.
- Database migration tests.
- API authorization and backend integration tests.
- Component accessibility tests.
- Expo native prebuild configuration for Android/iOS plugins and identifiers.
- Build Android/iOS development artifacts.
- Dependency/secret scan.
- Documentation links and Mermaid validation where tooling permits.

## Release evidence checklist

- [ ] Clinical golden scenarios approved.
- [ ] Zero open critical/high security findings.
- [ ] All P0/P1 device scenarios pass.
- [ ] Accessibility critical journeys pass manually.
- [ ] Offline, outage, and permission-denied behavior observed.
- [ ] Rollback and data-migration recovery rehearsed.
- [ ] Store copy matches intended purpose and legal approval.

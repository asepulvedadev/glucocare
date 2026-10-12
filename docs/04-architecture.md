# Architecture for a lightweight, local-first Expo app

## Decision summary

Build one Expo/React Native TypeScript application with a feature-first modular structure, local SQLite persistence, and optional synchronization with the self-hosted PostgreSQL API on the AutoKing VPS. Keep clinical rules and repositories behind explicit ports so the API and UI can change without rewriting the safety-critical domain.

## Platform support

| Platform | Support level | Notes |
|---|---|---|
| Android | Tier 1 | Full offline capture, local notifications, push, emergency deep links. |
| iOS | Tier 1 | Full offline capture, local notifications, push, emergency deep links. |
| Web | Tier 2 | Review/basic capture; no promise of native alarms or background emergency behavior. |

Expo Router provides file-based routing across Android, iOS, and web, typed routes, deep links, and production lazy evaluation according to the [official Expo Router documentation](https://docs.expo.dev/router/introduction/).

## Implemented stack

| Concern | Choice | Reason / tradeoff |
|---|---|---|
| Runtime | Expo SDK 57, React Native 0.86, TypeScript strict mode | Pinned in `apps/mobile/package.json` and checked by Expo Doctor; native notification behavior still requires development/release builds. |
| Language | TypeScript, strict mode | Safer domain values and API contracts. |
| Navigation | Expo Router | Universal deep links and route-level organization. |
| Local database | `expo-sqlite` with migrations; SQLCipher on native builds | Durable relational data and offline transactions; web support is treated separately because Expo SQLite web support may be unstable. |
| Secret storage | `expo-secure-store` | Store tokens and database-key material, never the full clinical record. |
| Server | Node.js/TypeScript API + PostgreSQL 16 on the AutoKing VPS | Keeps health data and operations under project control; requires the team to own patching, backups, TLS, sessions, and authorization. |
| Notifications | `expo-notifications` + server provider adapters | Local reminders and remote alerts; OS delivery is not guaranteed. |
| Validation | Typed domain constructors and explicit API boundary validation | Avoids persisting untrusted JSON; the VPS API rejects malformed events and the mobile repositories validate domain values before writes. |
| State | React context providers plus SQLite repositories and a replayable outbox | No React Query dependency in the MVP; SQLite remains the local source of truth and cloud sync is additive. |
| Tests | Vitest domain/migration tests, Expo Doctor, typecheck/lint, API/worker smoke tests | Physical-device, screen-reader, and native notification evidence remain release gates. |

`expo-sqlite` persists data across app restarts and supports WAL and prepared statements; its documentation recommends WAL for general performance and prepared statements for user input. Native builds call SQLCipher `PRAGMA key` before migrations, using a random device-bound key held in `expo-secure-store`; web intentionally uses the separate WASM SQLite path. Losing the native key makes the local database unrecoverable, so export must be offered before device reset or uninstall. See [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/) and [Expo SecureStore](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).

## Architectural style

```text
app routes / UI
       │
application use cases
       │
domain entities + deterministic safety rules
       │
ports (repositories, clock, notifications, emergency dialer, sync)
       │
adapters (SQLite, VPS API, Expo APIs, export files)
```

Dependency direction points inward. Domain code has no Expo, React, API transport, or SQL imports.

## Feature structure (current repository)

```text
apps/mobile/src/app/          # Expo Router screens and navigation composition
apps/mobile/src/components/   # Accessible visual primitives
apps/mobile/src/domain/       # Pure rules, state machines, schedules, summaries
apps/mobile/src/db/           # SQLite migrations and repositories
apps/mobile/src/*Context.tsx  # Feature state orchestration around repositories
apps/mobile/src/notifications.ts, sync.ts, cloudApi.ts
server/src/                   # Node.js API, auth, providers, alert worker
server/migrations/            # Idempotent PostgreSQL migrations
```

Routes compose features; they do not contain business rules or SQL.

## Local-first write path

1. Validate command.
2. Execute local write and append an outbox event in one exclusive transaction.
3. Render success from local state.
4. Sync worker sends idempotent event when online.
5. Server validates authorization/version and returns canonical server timestamp.
6. Client marks outbox event acknowledged or exposes a resolvable conflict.

Never block a local glucose or incident record on network success.

## Synchronization policy

- IDs are random UUIDs generated locally; ordering uses explicit timestamps and
  cursor fields rather than assuming IDs are sortable.
- Local records preserve sync state and audit metadata; the VPS projection uses
  `(patient_id, entity_type, entity_id, updated_at)` and rejects stale events.
  Full tombstone retention remains a follow-up when remote record deletion is
  introduced.
- Append-only events (readings, adherence, incidents) are not silently overwritten.
- Profile fields use last-write-wins only where clinically harmless.
- Care plans, medication schedules, and emergency contacts require explicit revision/conflict resolution.
- All requests carry an idempotency key.
- Server time is authoritative when online; original device time remains preserved.

## Notification architecture

- **Local:** measurement and medication reminders scheduled on-device.
- **Remote:** contact invitations, contact alerts, appointment updates, and cross-device events.
- **Reconciler:** computes the next bounded set of occurrences and repairs OS schedules after boot/app-open/timezone changes.
- **Delivery ledger:** stores request, provider acceptance, delivery callback where available, failure, and acknowledgement as distinct events.

Expo notes that push notifications require a development build and that background execution/delivery is not guaranteed by the operating system. See [Expo notification guidance](https://docs.expo.dev/push-notifications/what-you-need-to-know/).

## VPS API and PostgreSQL boundaries

- The mobile client receives only `EXPO_PUBLIC_API_URL`; database credentials never enter a build.
- PostgreSQL is attached only to the internal Docker network and never publishes port 5432.
- The API authenticates every sync, invitation, alert, and deletion request with a revocable opaque session.
- Every health record query is scoped to the authenticated `patient_id`; trusted contacts do not gain clinical-record access.
- The API validates event type, entity ID, payload size, idempotency, and server timestamps before writing.
- Backups, retention, secret rotation, and TLS are operator responsibilities documented in `DEPLOYMENT.md`.

## Performance rules

- No full-history query on the Today route.
- Index timestamps, patient IDs, status, and pending outbox rows.
- Use cursor pagination and precomputed daily summaries only when measurements prove need.
- Lazy-load reporting/export code.
- Avoid background polling; use connectivity events, app resume, and bounded retry.
- Store images outside the database and exclude them from MVP unless essential.

## Failure modes

| Failure | Expected behavior |
|---|---|
| No internet | Local capture/reminders/card continue; remote alerts show queued/failed. |
| API or PostgreSQL outage | No data loss locally; retry with backoff; never claim delivery. |
| Notification permission denied | In-app schedule remains; persistent explanation and test action. |
| Device clock wrong | Mark time source as device; reconcile with server time when connected. |
| Session expired | Local write continues; sync pauses and requests reauthentication. |
| Database migration fails | Stop destructive migration, preserve backup, show recoverable support path. |

## Architecture completion checklist

- [ ] Domain rules run without React Native.
- [ ] Critical write + outbox is atomic.
- [ ] API authorization tests cover patient, contact, anonymous, and privileged service roles.
- [ ] Local database encryption/key lifecycle is threat-modeled.
- [ ] Web limitations are visible in product copy.
- [ ] Push/local notifications are tested in development builds, not only Expo Go.

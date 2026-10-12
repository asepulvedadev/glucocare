# ADR-0003: Initial evaluation of Expo with a managed cloud backend

- Status: superseded by ADR-0004; historical record only
- Date: 2026-10-11
- Owners: engineering and security

## Context

The product needs Android/iOS delivery, a lighter web companion, local reminders, encrypted local data, optional identity/sync, and server-mediated contact alerts. The team needs an MVP stack with low operational overhead.

## Decision evaluated in the initial MVP draft

- Expo/React Native + strict TypeScript and Expo Router for the shared client.
- `expo-sqlite` for device persistence, with native database encryption and repository abstractions.
- `expo-secure-store` for tokens/key material only.
- A managed Postgres/Auth provider was evaluated for the first MVP draft; it was
  not adopted and is not part of the current deployment.
- Provider adapters for push/email/SMS so alert transport is replaceable.

## Consequences

Positive:

- Shared mobile codebase and native platform APIs.
- Relational backend with RLS and fast MVP setup during the evaluation.
- Clear path to local-first and later multi-device sync.

Costs/risks:

- Real push testing requires Expo development builds.
- OS notification delivery is never guaranteed.
- Expo SQLite web support may not meet Tier-1 guarantees.
- A managed provider would create provider, region, pricing, and data-processing
  dependencies.
- Backend schema exposure/grants and RLS require careful explicit configuration.

## Alternatives considered

- **Fully local app:** simpler privacy/operations, but cannot reliably coordinate remote trusted-contact alerts or multi-device recovery.
- **Self-hosted PostgreSQL/API:** greater control and portability, but more
  delivery and operational cost; this is the option accepted by ADR-0004.
- **Firebase:** strong mobile ecosystem, but the relational clinical/audit model and authorization are clearer in Postgres for this team.

## Verification notes from the evaluation

- Native encryption/key lifecycle proof of concept.
- Managed-provider RLS negative tests and data-region/legal review were part of
  the evaluation only; they are not release evidence for the current stack.
- Push/local notification tests on physical devices.
- Demonstrate provider replacement through an alert-port contract test.

The product owner rejected the managed provider. The active architecture is
documented in [ADR-0004](0004-vps-postgresql-backend.md), which runs PostgreSQL
and the API directly on the AutoKing VPS.

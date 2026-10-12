# ADR-0003: Use Expo with optional Supabase sync

- Status: accepted for MVP planning
- Date: 2026-10-11
- Owners: engineering and security

## Context

The product needs Android/iOS delivery, a lighter web companion, local reminders, encrypted local data, optional identity/sync, and server-mediated contact alerts. The team needs an MVP stack with low operational overhead.

## Decision

- Expo/React Native + strict TypeScript and Expo Router for the shared client.
- `expo-sqlite` for device persistence, with native database encryption and repository abstractions.
- `expo-secure-store` for tokens/key material only.
- Supabase Auth/Postgres/Edge Functions for optional cloud sync and alert orchestration.
- Provider adapters for push/email/SMS so alert transport is replaceable.

## Consequences

Positive:

- Shared mobile codebase and native platform APIs.
- Relational backend with RLS and fast MVP setup.
- Clear path to local-first and later multi-device sync.

Costs/risks:

- Real push testing requires Expo development builds.
- OS notification delivery is never guaranteed.
- Expo SQLite web support may not meet Tier-1 guarantees.
- Supabase creates provider, region, pricing, and data-processing dependencies.
- Backend schema exposure/grants and RLS require careful explicit configuration.

## Alternatives considered

- **Fully local app:** simpler privacy/operations, but cannot reliably coordinate remote trusted-contact alerts or multi-device recovery.
- **Custom Go backend:** greater control and portability, but more delivery and operational cost for the MVP.
- **Firebase:** strong mobile ecosystem, but the relational clinical/audit model and authorization are clearer in Postgres for this team.

## Verification

- Native encryption/key lifecycle proof of concept.
- Supabase RLS negative tests and data-region/legal review.
- Push/local notification tests on physical devices.
- Demonstrate provider replacement through an alert-port contract test.

# ADR-0001: Use a local-first architecture

- Status: accepted
- Date: 2026-10-11
- Owners: product and engineering

## Context

Glucose capture, medication routines, and emergency information may be needed with weak or no connectivity. A network-first app would make a cloud outage or expired session a patient-facing failure.

## Decision

SQLite on the device is the source of truth for active local use. Core writes commit locally with an outbox event in one transaction. Cloud synchronization is optional and asynchronous. Emergency calling and the emergency card never require a network or authenticated session.

## Consequences

Positive:

- Fast interaction and resilient offline use.
- Cloud outage does not block recording.
- Optional account reduces onboarding burden.

Costs:

- Sync conflicts, migrations, encryption keys, and backup semantics require explicit design.
- Multiple-device consistency is eventual.
- Web persistence needs a separate adapter and is Tier 2.

## Verification

- Airplane-mode end-to-end tests.
- Atomic write/outbox failure tests.
- Reinstall, restore, migration, and conflict simulations.

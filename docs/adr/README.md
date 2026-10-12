# Architecture decision records

ADRs capture durable decisions and their tradeoffs. Accepted ADRs are not immutable; supersede them with a new ADR rather than rewriting history.

## Status values

`proposed | accepted | superseded | rejected`

## Index

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-local-first.md) | Use a local-first architecture | Accepted |
| [0002](0002-clinical-boundary.md) | Keep diagnosis and dosing outside MVP | Accepted |
| [0003](0003-expo-supabase-stack.md) | Initial managed-backend evaluation (not adopted) | Superseded by ADR-0004 |
| [0004](0004-vps-postgresql-backend.md) | Run PostgreSQL and API on the AutoKing VPS | Accepted |

## Template

```markdown
# ADR-NNNN: Decision title

- Status: proposed
- Date: YYYY-MM-DD
- Owners: role(s)

## Context

## Decision

## Consequences

## Verification
```

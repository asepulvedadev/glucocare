# Contributing

## Before changing code or documentation

1. Read the product, clinical safety, and architecture documents.
2. Identify whether the change affects clinical behavior, emergency flow, consent, retention, or notification claims.
3. Add or update an ADR for a durable architecture/product-boundary decision.
4. Define verification evidence before implementation.

## Change rules

- Use English for code, identifiers, comments, and repository documentation unless a localized artifact is explicitly required.
- Keep domain rules independent from Expo, React, Supabase, and SQL.
- Never add a health value, medication, symptom, contact detail, token, or location to logs.
- Every database change uses a migration and upgrade test.
- Every exposed database table requires deliberate grants plus tested RLS.
- Every remote write is idempotent.
- Every accessibility-sensitive component includes semantics and manual verification notes.

## Commit style

Use conventional commits without AI attribution or `Co-Authored-By` trailers.

Examples:

```text
feat(glucose): add offline reading capture
fix(notifications): prevent duplicate medication occurrence
docs(safety): clarify emergency delivery states
```

## Review checklist

- [ ] Change matches the approved intended purpose.
- [ ] Clinical claims cite an approved source and clinical owner review.
- [ ] Offline/failure behavior is explicit.
- [ ] Accessibility semantics and large-text behavior are verified.
- [ ] Privacy data inventory and logs remain safe.
- [ ] Tests cover boundary, authorization, and migration cases.
- [ ] Relevant documentation and risk register are updated.

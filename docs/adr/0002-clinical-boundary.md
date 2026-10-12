# ADR-0002: Keep diagnosis and dosing outside the MVP

- Status: accepted
- Date: 2026-10-11
- Owners: product and clinical safety

## Context

The app will process glucose, symptom, medication, and emergency information. Predictive diagnosis, insulin calculation, or treatment changes could cause direct harm and materially expand medical-device obligations.

## Decision

The MVP records information, schedules reminders, evaluates deterministic patient/clinician-configured rules, and presents approved instructions. It does not diagnose, calculate doses, or change treatment. Generic educational content is visibly separate from a personalized care plan.

## Consequences

Positive:

- Clearer patient expectations and safer validation scope.
- Deterministic, auditable explanations.
- Faster delivery of core routine value.

Costs:

- Less automation than some users may expect.
- Requires clinicians/users to enter and review care-plan instructions.
- Regulatory assessment is still required because intended purpose and risk alerts may qualify as medical-device software.

## Verification

- Review all UI/store/marketing claims.
- Static content inventory contains source and approval.
- Tests assert no rule returns a diagnosis or medication dose.

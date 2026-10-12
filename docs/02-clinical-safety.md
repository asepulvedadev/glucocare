# Clinical safety and escalation boundaries

## Safety position

GlucoCare is a self-management aid, not a diagnostic or treatment system. Any feature that predicts an event, recommends a dose, or changes treatment materially expands clinical and regulatory risk and requires a separate validated release.

## Clinical governance required

- Appoint a named clinical safety owner before implementation.
- Maintain a versioned source for every clinical sentence and threshold.
- Review content at least annually and whenever source guidance changes.
- Test all translated content with a clinician fluent in the target language.
- Run hazard analysis before each release that changes the risk engine or emergency flow.

## Threshold policy

### Personalized plan first

Every patient has a versioned care plan containing:

- Preferred display unit.
- Low and urgent-low thresholds.
- High and urgent-high thresholds.
- Fasting and post-meal target ranges where supplied.
- Ketone-check instructions.
- Symptom-based instructions.
- Who to contact and when.
- Clinician/source, approval date, review date, and free-text instructions.

The app must preserve the plan version used to classify each reading.

### Educational fallback

If no clinician-authored plan exists:

- The app may state that glucose below `70 mg/dL` (`3.9 mmol/L`) is generally considered low, consistent with [American Diabetes Association guidance](https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose).
- The app may explain the general 15/15 approach only as educational content and must tell the user to follow their care plan, especially for children or individualized treatment.
- It must not invent a universal “dangerously high” cutoff. High-glucose action depends on symptoms, ketones, treatment, pregnancy, age, and clinician instructions.
- Feeling unwell, confusion, fainting, seizure, inability to swallow, heavy breathing, persistent vomiting, or worsening/high ketones triggers urgent emergency guidance regardless of the numeric reading. See [ADA severe hypoglycemia](https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose/severe) and [ketone guidance](https://diabetes.org/living-with-diabetes/managing-ketones).

All fallback content must be remotely versioned but cached locally; a remote edit cannot bypass app review and audit.

## Risk classification engine

The engine is deterministic and explainable.

Inputs:

- Reading, unit, timestamp, trend if explicitly available.
- Active care-plan version.
- Symptoms selected by the user.
- Ketone result if entered.
- Recent repeated readings.
- Medication context only when clinically approved.

Outputs:

- `unknown`: insufficient or invalid information.
- `in_range`: within the active personalized target.
- `attention`: outside target but no urgent criterion.
- `urgent`: care plan or symptom rule requires prompt action.
- `emergency`: severe symptoms or emergency rule; show emergency actions first.

Every output includes rule ID, plan version, plain-language explanation, and action content ID. Never output a probabilistic diagnosis.

## Emergency flow

### Required behavior

1. Present the call action before asking for extra data.
2. Use the country/municipality number configured and verified during onboarding; do not silently assume one universal number.
3. Allow trusted-contact notification in parallel, not as a replacement for emergency services.
4. Record the incident locally even when offline.
5. Clearly state that the app cannot guarantee that a call, push, SMS, or email was received.
6. Never wait for GPS. Share location only when permission exists and a fresh location is available; otherwise say unavailable.

For Colombia, the product may suggest `123` during setup where locally applicable, but must ask the user to verify it. Bogotá’s official [Línea 123](https://scj.gov.co/landing/linea-123/) handles life-threatening health incidents.

### Lock-screen privacy

Default notification: “GlucoCare needs your attention.”

Do not show glucose value, diagnosis, medication name, or appointment specialty on a locked device unless the user gives separate informed consent.

## Medication safeguards

- Treat prescription text as a record, not executable clinical logic.
- Require confirmation for dose, route, frequency, start/end dates, and timezone.
- Store an immutable schedule revision when any of these change.
- Do not advise taking an extra dose after a missed reminder.
- Do not infer that an ignored reminder means a missed dose.
- Distinguish “taken,” “skipped,” “snoozed,” and “not recorded.”
- Require clinician review before adding medication-interaction warnings.

## Measurement safeguards

- Accept both `mg/dL` and `mmol/L`; always display the active unit beside the value.
- Store canonical `mg/dL` plus original value/unit and conversion version.
- Flag implausible entries for confirmation rather than silently correcting them.
- Allow correction while retaining an audit trail.
- Do not treat imported CGM data and manual capillary readings as interchangeable without labeling the source.

## Clinical hazards and controls

| Hazard | Primary control | Verification |
|---|---|---|
| Wrong unit causes wrong interpretation | Persistent unit label, confirmation on unit change, canonical + original storage | Boundary/unit tests + usability test |
| Stale care plan gives wrong action | Effective dates, review reminders, visible source/date | Plan-version tests |
| App suggests emergency help too late | Symptom-first emergency rules and direct call action | Scenario simulation |
| Alert appears delivered when it is not | Per-channel delivery states; no false acknowledgement | Provider failure tests |
| Duplicate medication reminder | Deterministic occurrence IDs and reconciliation | Timezone/reinstall tests |
| User cannot navigate while disoriented | Simplified mode, one primary action, emergency access without login | Cognitive walkthrough |
| Clinically unsafe content update | Signed/versioned content and clinical approval gate | Release audit |

## Safety release gate

- [ ] Clinical owner approved all user-facing health guidance.
- [ ] Every risk rule has source, rationale, tests, and rollback plan.
- [ ] Emergency numbers and legal statements are locale-configurable.
- [ ] Offline, clock-change, expired-plan, and no-permission scenarios pass.
- [ ] No screen claims certainty or guaranteed delivery that the system cannot prove.
- [ ] Incident and near-miss reporting process is operational.

## Reference baseline

- [ADA: low blood glucose](https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose)
- [ADA: severe hypoglycemia](https://diabetes.org/living-with-diabetes/hypoglycemia-low-blood-glucose/severe)
- [ADA: managing ketones](https://diabetes.org/living-with-diabetes/managing-ketones)
- [ADA: hyperglycemia and medical identification](https://diabetes.org/living-with-diabetes/treatment-care/hyperglycemia)

These references support product design; they do not replace local clinical review.

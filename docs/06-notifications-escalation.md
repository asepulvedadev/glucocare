# Notifications, reminders, and escalation

## Reliability principle

A reminder is a best-effort prompt, not proof that a medication was taken or a measurement occurred. A remote message accepted by a provider is not proof that a person saw it.

## Notification classes

| Class | Mechanism | Example | Offline |
|---|---|---|---:|
| Local routine | OS local notification | Medication or glucose check | Yes |
| Remote informational | Push | Appointment authorized | No |
| Remote contact alert | Push/email/SMS adapter | Patient requested help | Queued locally, delivery needs network |
| In-app safety | Accessible banner/dialog | Reading outside care plan | Yes |

Expo supports scheduling local notifications and receiving push notifications, but push requires a development build and operating systems do not guarantee background execution or delivery. See [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/) and [delivery guidance](https://docs.expo.dev/push-notifications/what-you-need-to-know/).

## Reminder scheduling

### Bounded horizon

The mobile implementation schedules rolling 14-day windows of one-shot medication and glucose-check notifications. Medication reminders are capped by configured start/end dates; glucose checks honor weekdays, plan validity, fixed times, and explicitly recorded meal-relative windows. Fourteen days × three daily times stays below iOS' pending-notification limit while leaving room for appointment and safety notices. It never uses an unbounded daily repeat, because a repeating OS notification could survive the end of a prescription. Reconcile the window on:

- App start/resume.
- Schedule edit.
- Timezone/clock change.
- Permission change.
- Device reboot signal where available.
- App update.

Do not generate years of OS notifications.

### Stable occurrence identity

Each reminder maps to a domain occurrence. Rescheduling cancels the prior OS identifier and records the replacement. Reconciliation is idempotent and removes orphaned notifications.

### Time semantics

- Fixed local-time schedules follow the patient’s configured timezone.
- Travel behavior is explicit: follow current timezone or home timezone.
- Store UTC instant plus zone/offset used to calculate it.
- Daylight-saving duplicates/missing times require deterministic policy and tests.

## Reminder actions

### Medication

- Taken
- Snooze
- Skip
- Open instructions

No action defaults to `not_recorded`, never `skipped`.

### Measurement

- Record now
- Snooze
- Skip this check

Risk evaluation happens only after a valid reading is saved.

## Permission denial

If notification permission is denied:

- Keep schedules and due items in-app.
- Show a persistent but non-blocking explanation.
- Provide an “Open system settings” action.
- Let the user test current settings.
- Never repeatedly nag on every launch.

## Contact invitation and consent

1. Patient enters the contact and chooses event types/channels.
2. Server sends a signed, expiring invitation with minimal context.
3. Contact verifies the channel, reviews what may be shared, and accepts.
4. Patient sees “active” only after acceptance.
5. Either party can revoke; revocation immediately blocks new dispatches.

Contact acceptance does not grant access to the full clinical history.

## Emergency escalation flow

```text
user/risk event
  ├─ local incident saved immediately
  ├─ call action opened with configured emergency number
  ├─ remote alert added to outbox (if enabled)
  └─ UI shows real status per channel
       queued -> provider accepted -> delivered? -> acknowledged?
```

No automatic emergency-service call is placed without a deliberate user action unless a future, separately regulated feature is approved.

## Message minimization

Default contact alert:

> “[Preferred name] requested urgent help in GlucoCare at [local time]. Call them now. If you believe they are in immediate danger, contact local emergency services.”

Do not include diagnosis, numeric glucose value, medication, location, or insurance information unless separately enabled. Location includes accuracy and age when shared.

## Escalation policy

- Explicit panic bypasses contact quiet hours but not revoked consent.
- Non-emergency missed reminders never escalate by default.
- Repeated low/high readings can offer the user an alert action; automatic dispatch requires care-plan approval and explicit consent.
- Retry transient failures with exponential backoff and a hard deadline.
- Permanent failure immediately offers direct call/share alternatives.
- Contact acknowledgement stops further contact retries but does not cancel emergency-service actions.

## Delivery ledger and observability

Record timestamps for request, provider response, callback, failure reason category, and contact acknowledgement. Avoid health values in provider metadata or logs.

## Acceptance scenarios

- Offline panic: call remains available; contact alert is visibly queued and later retried.
- Provider outage: delivery becomes failed/unknown, never delivered.
- Expired contact consent: dispatch blocked with direct-call alternative.
- Notification permission denied: schedules remain visible in-app.
- Timezone change: exactly one future occurrence per intended local time.
- Duplicate API request: idempotency prevents duplicate contact alerts.
- App killed/rebooted: reminders are reconciled on the next supported lifecycle event.
- Notification tap: medication reminders open the care routine, glucose-check reminders open the log form, and urgent glucose alerts open help; unknown payload routes are ignored.

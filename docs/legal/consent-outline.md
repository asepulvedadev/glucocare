# Sensitive-data and trusted-contact consent outline — counsel review required

## Consent design principles

- Specific, informed, affirmative, versioned, and revocable.
- No pre-checked optional purposes.
- Refusing optional cloud sync, location, contact alerts, or analytics must not disable unrelated local features.
- Accessible plain-language summary precedes full legal text.

## Sensitive health data authorization

Drafting must identify:

- Controller and contact.
- Exact health-data categories.
- Core purposes: local record, reminders, care-plan display, history/export.
- Optional purposes: cloud sync, support alerts, location, product analytics.
- Sensitive nature of the information and applicable rights.
- Recipients/processors and international processing.
- Retention, withdrawal, deletion, and consequences of refusal.

## Trusted contact invitation

The invited contact sees:

- Patient’s preferred name and relationship claim.
- Which alerts may arrive and through which channels.
- What each status means; alerts are not professional emergency dispatch.
- Which fields may be included by default and optionally.
- How to accept, decline, revoke, report abuse, or update a channel.
- That acceptance does not grant access to the patient’s health history.

## Location consent

Separate consent states:

- When location is captured.
- Whether it is precise or approximate.
- Which contact receives it.
- Accuracy/age limitations.
- That emergency action does not wait for location.

## Consent event schema

```text
consent_id
subject_id
document_type
document_version
locale
purposes[]
data_categories[]
recipients[]
granted_at / withdrawn_at
evidence_method
```

## Acceptance tests

- User can use local records after declining optional cloud/contact/location purposes.
- Revocation blocks new processing and dispatch according to policy.
- Contact invitation expires and cannot be replayed.
- Accepted document version can be displayed/exported.
- Screen reader can complete consent and withdrawal flows.

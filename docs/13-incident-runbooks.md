# GlucoCare incident runbooks

These runbooks are the operator's shortest safe path for the beta environment.
They favor containment and truthful user messaging over speculative repair. Never
paste health values, medication details, contact details, tokens, or database
rows into a ticket or chat channel.

## Quick path

1. Declare the incident, owner, start time, affected build/environment, and
   synthetic correlation ID.
2. Capture only payload-free evidence: service status, timestamps, error class,
   queue depth, migration version, and deployment SHA.
3. Stop the unsafe action before attempting recovery. Do not delete or rewrite
   patient records to make a dashboard green.
4. Use the matching runbook below, verify with the stated checks, and record the
   rollback or mitigation.
5. Close only after the product, clinical, security, or privacy owner (as
   applicable) accepts the user message and follow-up actions.

## Severity and ownership

| Severity | Example | Initial owner | Notify |
|---|---|---|---|
| SEV-1 | Cross-patient access, unsafe clinical copy, deletion/data-loss event | Incident commander | Security, clinical, product, operations, counsel |
| SEV-2 | API/database outage, alert queue breach, provider outage | Operations | Product and support; clinical if emergency behavior is affected |
| SEV-3 | Export delay, isolated reminder permission denial, non-safety UI defect | Product/engineering | Support and the owning team |

## 1. Alert provider outage or queue backlog

**Trigger:** provider failures, `not_configured`, or the health check reports an
old queued/processing backlog.

**Owner:** operations; backend owns the adapter; product owns user copy.

1. Confirm without payloads:

   ```bash
   systemctl start glucocare-healthcheck.service
   journalctl -u glucocare-healthcheck.service -n 30 --no-pager
   docker inspect --format '{{.State.Health.Status}}' glucocare-glucocare-alert-worker-1
   ```

2. If credentials are missing or invalid, keep the adapter disabled. Do not
   mark an alert delivered. The app must continue to show queued/unavailable
   state and the emergency card's direct call fallback.
3. If the provider is degraded, pause credential changes and preserve the
   queue. Do not repeatedly replay an incident; the patient/incident key is
   intentionally idempotent.
   In synthetic staging, exercise the fail-closed path with:

   ```bash
   cd /srv/glucocare/release/server
   DATABASE_URL='postgresql://<staging-user>:<staging-password>@127.0.0.1:5432/glucocare' \
   PUBLIC_API_URL=https://synthetic.example.invalid \
   npm run test:provider-outage
   ```

   The drill must end with the synthetic delivery in `failed` after its
   bounded attempts; it must never report `provider_accepted`.
4. If the provider confirms recovery, run one synthetic alert in staging,
   verify `provider_accepted` and a provider correlation ID, then monitor the
   queue for two worker intervals. Provider acceptance is not recipient delivery.
5. If the queue remains old, keep the outage message active and escalate to the
   provider. Never claim that an emergency contact was reached.

**User message:** “No podemos confirmar que el aviso haya sido entregado. Usa
la llamada directa a tu contacto o al número local de emergencias. Si estás en
peligro, busca ayuda inmediata.”

**Verify and close:** health check is healthy, worker heartbeat is fresh, no
old queue entries remain above the configured limit, and a provider/outage
timeline plus follow-up owner is recorded.

## 2. VPS API or PostgreSQL outage

**Trigger:** `/healthz` fails, API authentication/sync is unavailable, or the
database container is unhealthy.

**Owner:** operations.

1. Check the surfaces and containers without opening application logs that may
   contain sensitive data:

   ```bash
   curl --fail --silent http://127.0.0.1:18084/healthz
   docker compose --env-file /srv/glucocare/.env --project-name glucocare \
     -f /srv/glucocare/release/deploy/compose.yml ps
   journalctl -u glucocare-healthcheck.service -n 30 --no-pager
   ```

2. Keep the native app in local-first mode. Do not ask a patient to re-enter a
   reading just because sync is unavailable; the outbox must retry later.
3. If PostgreSQL is restarting, wait for its health check and then run the
   payload-free health check. Do not run destructive repair commands.
4. If the current release is unhealthy, roll back to the newest retained bundle:

   ```bash
   sudo -u glucocare-deploy /usr/local/sbin/glucocare-rollback latest
   systemctl start glucocare-healthcheck.service
   ```

5. If the database itself is damaged, stop before restore. Use the disaster
   recovery owner and the backup/restore runbook; a restore requires an explicit
   impact decision because it can affect newer records.

**User message:** “La sincronización está temporalmente no disponible. Tus
registros locales siguen en el dispositivo; no cierres sesión ni reinstales la
app. Intenta de nuevo más tarde.”

**Verify and close:** API/database health is green for 15 minutes, no migration
error remains, and a synthetic sign-in/sync check succeeds without recording
real health data.

## 3. Failed migration or unsafe release

**Trigger:** deployment health checks fail, startup migration fails, or a
release changes a safety-critical state unexpectedly.

**Owner:** operations with backend/product; clinical owner joins for clinical
behavior.

1. Preserve the failing SHA, migration version, timestamp, and health output.
2. Do not manually edit `schema_migrations` or drop tables.
3. Let the deploy wrapper restore the previous release. If it already completed,
   use the retained bundle:

   ```bash
   sudo -u glucocare-deploy /usr/local/sbin/glucocare-rollback latest
   systemctl start glucocare-healthcheck.service
   ```

4. If the schema change is not backward compatible, stop API/worker rollout and
   use the reviewed migration rollback or forward-fix plan. PostgreSQL backups
   are recovery sources, not a shortcut for deleting data.
5. Block the SHA in the release checklist until a synthetic migration, API
   smoke, mobile sync, and rollback test pass.

**Verify and close:** all five Compose services are healthy, the migration table
contains the expected versions, API smoke passes, and the product owner records
whether any clients need an app update.

## 4. Suspected breach or cross-patient access

**Trigger:** a cross-patient response, exposed secret, unexpected access pattern,
or sensitive data in logs/telemetry.

**Owner:** security incident commander.

1. Treat as SEV-1. Preserve timestamps, request correlation IDs, deployment SHA,
   and access metadata; do not copy payloads.
2. Isolate the affected route or release. Disable remote sync/alert features if
   necessary while preserving local capture and emergency call fallback.
3. Revoke sessions and rotate affected credentials. Never paste the replacement
   secret into a ticket.
4. Review database ownership queries, audit events, reverse-proxy access, and
   provider logs through the approved secure channel.
5. Notify counsel and the privacy owner according to the incident notification
   policy. Do not contact affected users with an unreviewed clinical message.

**Verify and close:** negative cross-patient tests pass, the secret scan is
   clean, rotated credentials are active, access scope is documented, and the
   privacy/security owner approves closure.

## 5. Lost signing key or leaked credential

**Trigger:** a VPS, provider, database, CI, or EAS credential may be exposed.

1. Revoke or disable the credential at its authority immediately; do not wait
   for forensic certainty when exposure is plausible.
2. Rotate the replacement in the secret store only. Keep `/srv/glucocare/.env`
   mode `600` and never commit it.
3. For provider credentials, leave the adapter disabled until a synthetic send
   verifies the new key and sender identity.
4. For EAS signing credentials, pause native release and follow the provider's
   recovery procedure; never generate an emergency binary without a recorded
   signing-owner review.
5. Search tracked files with the repository secret scanner and inspect CI logs
   for accidental disclosure.

**Verify and close:** old credential is rejected, new credential works in the
   intended scope, no secret appears in repository/history/logs, and a rotation
   date and owner are recorded.

## 6. Account deletion or export failure

**Trigger:** a user cannot export records, deletion does not complete, or the
   support team receives a data-rights request.

1. Verify the requester through the approved account process. Do not request
   health screenshots by email.
2. Preserve the request ID and timestamps, not exported health payloads.
3. For export failure, keep the local database intact and retry through the
   in-app export path; do not promise a backup that was not produced.
4. For deletion failure, do not partially delete rows manually. Check the API
   response and transaction status, then escalate to the backend owner.
5. Confirm the pseudonymous deletion audit event and backup-retention policy
   with counsel before communicating completion.

**User message:** “Recibimos tu solicitud. Te confirmaremos cuando la exportación
o eliminación haya terminado; soporte no puede interpretar tus datos clínicos.”

**Verify and close:** export checksum/schema is recorded when applicable,
account sessions are invalidated, cascade behavior is confirmed, and the legal
retention/deletion window is met.

## 7. Clinically unsafe content or rule rollback

**Trigger:** a threshold, warning, medication message, or escalation copy may
   cause unsafe action.

1. Treat as SEV-1 and stop the affected feature flag/release. Do not patch copy
   directly in production without review.
2. Clinical safety lead decides whether to hide the message, show a neutral
   limitation, or roll back the entire release.
3. Preserve the rule/content version and affected build identifiers. Do not
   infer a replacement threshold from a support conversation.
4. Deploy the reviewed rollback through the normal strict validation and VPS
   deployment order.
5. Add a regression test and update the clinical safety document before
   re-enabling the feature.

**User message:** “Esta información puede no ser correcta. No cambies tu dosis
por la app; sigue el plan de tu equipo de salud y busca ayuda urgente si te
sientes en peligro.”

**Verify and close:** clinical reviewer signs the copy/rule, golden tests pass,
the release evidence names the version, and support has the approved script.

## 8. Critical mobile fix or forced update

**Trigger:** a native release has a data-loss, authentication, emergency-flow,
or privacy defect that cannot wait for the normal rollout.

1. Product and clinical/security owners classify the defect and approve the
   minimum safe fix. Local capture and direct emergency calling must remain
   usable while the update is unavailable.
2. Stop the affected EAS channel and publish a reviewed update through staged
   rollout. Do not silently change clinical rules.
3. Use a clear in-app banner with the version, reason, minimum supported version,
   and a non-network emergency fallback.
4. Monitor crash-free sessions, update adoption, local-write failures, and
   emergency-flow errors without collecting health payloads.
5. Keep the previous native version compatible with the backend during the
   rollback window.

**Verify and close:** Android/iOS builds are signed and identified, update and
rollback paths are tested on physical devices, accessibility is rechecked, and
the release owner records the final rollout percentage.

## Post-incident template

```text
Incident ID / severity:
Start and end (UTC):
Environment and deployment SHA:
Owner and reviewers:
Trigger and payload-free evidence:
User-facing message:
Containment:
Recovery / rollback:
Verification commands and result:
Data, clinical, privacy, or security impact:
Follow-up issue, owner, and due date:
```

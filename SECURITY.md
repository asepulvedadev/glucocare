# Security policy

GlucoCare handles sensitive health-related information. Please do not disclose
security vulnerabilities, credentials, personal data, or patient scenarios in a
public issue.

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/asepulvedadev/glucocare/security/advisories/new)
when available. Include:

- a concise description of the affected component;
- reproducible steps or a minimal proof of concept;
- the security impact and any required permissions;
- a suggested mitigation, if known.

If private vulnerability reporting is unavailable, open a minimal issue asking
the maintainers to enable a private channel. Do not include exploit details or
health data in that issue.

## Response expectations

Maintainers will acknowledge a report within seven days and will provide a
status update as the issue is triaged. Timing for a fix depends on severity,
reproducibility, affected deployment surface, and clinical/privacy risk.

## Scope and safety boundary

The repository may include local development and staging configuration, but it
must not contain production secrets, real patient data, provider credentials,
or private keys. GlucoCare is not an emergency service and a security report
must not be used to submit a medical emergency; contact local emergency
services directly when someone is in danger.

## Supported versions

Only the default branch and the latest published release are treated as
actively supported. Older commits may contain known issues and should not be
used for handling real health data.

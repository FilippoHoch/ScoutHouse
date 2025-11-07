# Security Notes

This document summarizes the security posture of ScoutHouse and now references the M5 governance program. For full details on the beta-readiness controls, see [`docs/governance/m5_governance_readiness.md`](docs/governance/m5_governance_readiness.md).

## Authentication and Tokens

- Access tokens are JWTs with a short TTL (`ACCESS_TTL_MIN` minutes).
- Refresh tokens are stored hashed in the database and rotated on every refresh.
- Password reset tokens are stored hashed, expire after `PASSWORD_RESET_TTL_MINUTES` (default 60) and become unusable after the first reset.
- Active session inventory is designed to persist device fingerprint, MFA method, and last seen timestamp for revocation workflows.

## Multi-Factor Authentication

- MFA is mandatory for privileged roles (`platform_*`, `structure_owner`, `structure_admin`, `event_owner`, `event_admin`).
- Supported factors include TOTP, WebAuthn, and single-use backup codes. Enrollment must complete within 24 hours of invitation or the account is suspended until MFA is configured.
- Login audit events capture factor used, IP, geo-IP, and device fingerprints for 400 days.

## Rate Limiting

- `POST /api/v1/auth/login`: 5 requests per minute per IP.
- `POST /api/v1/auth/refresh`: 30 requests per minute per IP.
- `POST /api/v1/auth/forgot-password`: 5 requests per hour per IP.

## Role-Based Access Control

- Governance matrix introduces hierarchical roles with delegation:
  - **Platform**: `platform_owner`, `platform_auditor`.
  - **Structure**: `structure_owner`, `structure_admin`, `structure_viewer`.
  - **Event**: `event_owner`, `event_admin`, `event_viewer`.
- Delegations can be granted for limited periods (4–30 days) and are automatically revoked on expiry. Emergency elevation by `platform_owner` is limited to 4 hours.
- Authorization tests track privileged endpoints with dedicated coverage markers to meet the 100% target in metrics of success.

## Audit Logging

- `audit_log` captures create/update/delete operations for structures, events, event candidates, and quote creation, including actor, IP, and payload diff.
- Audit trail now also records session revocation, delegation grants/expiry, and MFA enrollment actions to support incident investigations.

## Data Protection & Retention

- Passwords use Argon2id.
- Refresh and reset tokens are hashed using SHA-256 before storage.
- GDPR retention schedule:
  - Contact profiles: 18 months after last activity (`gdpr_purge_contacts`).
  - Communications: 24 months (`gdpr_purge_messages`).
  - Attachments: 6–10 years depending on financial obligation (`gdpr_purge_attachments`).
  - Audit/session logs: 400 days (`security_log_rotation`).
- DPIA (v2024.3) and RoPA are versioned within `docs/compliance/` and updated quarterly alongside the incident response playbook run.

## Security Automation

- Dependency monitoring via Dependabot, Trivy container scans, `pip-audit`, and `npm audit --audit-level=high` with SLA tags (high: 5 days, medium: 15 days, low: 30 days).
- Findings route into the security project board with automatic escalations for overdue remediation.
- SIEM (Elastic Agent) aggregates authentication, purge jobs, and infrastructure events with pager/Slack alerting; monthly security reports are archived in `docs/reports/security/`.

For implementation progress and outstanding actions, consult the checklist at the end of the governance readiness document.

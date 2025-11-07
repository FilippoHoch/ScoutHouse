# M5 Governance, Access & Compliance Readiness

This document consolidates the controls that must be in place before opening the beta to a broader audience. It covers role design, identity requirements, GDPR operations, and security automation so the team has a single source of truth for implementation and auditing.

## 1. Identity & Access Management

### 1.1 Role hierarchy and inheritance

| Scope | Role | Parent role | Core privileges | Delegable? | Notes |
| ----- | ---- | ----------- | ---------------- | ---------- | ----- |
| Platform | `platform_owner` | — | Manage tenant provisioning, override billing, assign structure/event admins | No | Restricted to ScoutHouse ops, MFA + hardware key enforced |
| Platform | `platform_auditor` | — | Read-only access to audit trails, DPIA, incident reports | No | Access brokered through temporary delegation token |
| Structure | `structure_owner` | `platform_owner` | Create/update/delete structure, manage child events, assign structure_admin/structure_viewer | Yes (14 days max) | Delegations recorded in audit log with expiry |
| Structure | `structure_admin` | `structure_owner` | Manage structure profile, bookings, contacts, escalate issues, invite event admins | Yes (7 days max) | Requires MFA, cannot delete structure |
| Structure | `structure_viewer` | `structure_admin` | View structure profile, availability calendar, read-only contacts | No | Intended for finance/legal observers |
| Event | `event_owner` | `structure_admin` | Manage event, contracts, payments, assign event_admin/event_viewer | Yes (30 days max) | MFA hard requirement |
| Event | `event_admin` | `event_owner` | Update event schedule, manage vendor tasks, upload attachments, manage event_viewers | Yes (7 days max) | Delegations revoked automatically on expiry |
| Event | `event_viewer` | `event_admin` | Read-only event timeline, download approved documents | No | Session limited to 8h inactivity timeout |

**Inheritance rules**

* Higher-scope roles automatically include all permissions granted to child roles.
* Delegations inherit the grantee's MFA/session requirements from the source role and are stored with `granted_by`, `granted_to`, `scope_id`, `role`, `delegated_at`, `expires_at`.
* Emergency escalation path: platform_owner can temporarily assume any structure/event role for 4 hours; action must be justified in audit log.

### 1.2 Session and SSO requirements

* **SSO (SAML 2.0 + SCIM)** is optional but available to organizations with ≥3 accounts. Metadata exchange documented in `docs/infra/sso_onboarding.md` (in progress). Tenant admins may enforce SSO-only login.
* Active session tracking persists `session_id`, `user_agent`, `ip`, `mfa_method`, `last_seen_at`. Users and admins can revoke sessions individually; platform_owner can revoke across tenant.
* Session limits: 10 concurrent sessions per user; inactivity timeout 30 minutes for admins, 8 hours for viewers.
* Immediate revocation triggered when:
  * Password reset or credential rotation completes.
  * Admin role is downgraded.
  * Device is flagged in SIEM for anomaly.
* Passwordless links are disabled for privileged roles.

### 1.3 MFA & audit trail

* **Mandatory MFA** for `platform_*`, `structure_owner`, `structure_admin`, `event_owner`, `event_admin`.
* Supported factors: TOTP, WebAuthn (preferred), backup codes (one-time).
* Enrollment policy: new admins must enroll in MFA within 24h of invitation; otherwise access is suspended.
* Audit trail captures: login success/failure, device fingerprint, factor used, geo-IP, session revocations, delegation grants/expiry.
* Audit events retained for 400 days, exportable in CSV/JSON.

## 2. Compliance Operations

### 2.1 Consent workflow

1. Contacts receive onboarding email linking to consent center (multilingual).
2. Consent choices stored per processing purpose with timestamps and versioned privacy notice hash.
3. Evidence of consent (IP, user agent, language, notice version) logged and immutable.
4. Revocation triggers webhook to downstream processors within 24h.

### 2.2 Data-retention policy

| Data class | Retention | Purge mechanism | Legal basis |
| ---------- | --------- | --------------- | ----------- |
| Contact profiles (prospects) | 18 months after last activity | Nightly job `gdpr_purge_contacts` removes or anonymizes records | Legitimate interest |
| Contact communication history | 24 months | Job `gdpr_purge_messages` scrubs content, keeps metadata aggregated | Contract |
| Attachments (contracts, IDs) | 6 years (or 10 years if financial) | Quarterly job `gdpr_purge_attachments` deletes expired files and tombstones references | Legal obligation |
| Session/audit logs | 400 days | Job `security_log_rotation` archives to cold storage before deletion | Legitimate interest |
| Incident response artifacts | 5 years | Manual review during quarterly IR playbook run | Legal obligation |

* Job configuration stored in `infra/cron/` (Terraform module) with tags `gdpr:true` and retention window.
* Purge jobs emit metrics (`records_purged`, `records_retained`, `failures`) to SIEM and alert on anomalies.

### 2.3 DPIA & registers

* DPIA template version `2024.3` stored in `docs/compliance/dpia/2024Q3.md` with sign-off log.
* Record of Processing Activities (RoPA) maintained in Git with semantic versioning (`ropa/vX.Y.Z` tags). Each update includes controller/processor details and DPO approval.
* Quarterly incident response exercise scheduled first Monday of quarter; output archived under `docs/compliance/ir-exercises/` with lessons learned.

## 3. Security Automation

### 3.1 Dependency scanning

* GitHub Dependabot enabled for `frontend/package.json`, `backend/pyproject.toml`, `infra/terraform/*.tf` modules.
* Container scanning: Trivy run in CI (`ci/trivy-container.yaml`) for backend/frontend images. Fail build on HIGH severity.
* Language-specific:
  * `pip-audit` weekly on backend lockfile.
  * `npm audit --audit-level=high` weekly on frontend dependencies.
  * `cargo audit` (if/when Rust components reintroduced).
* Findings triage automation:
  * Alerts routed to Security project board column "New".
  * SLA tagging: `severity:high` → 5 days, `severity:medium` → 15 days, `severity:low` → 30 days.
  * Workflow enforces assignee within 24h; escalates to platform_owner if overdue.

### 3.2 SIEM & alerting

* Lightweight SIEM stack (Elastic Agent) collects:
  * Auth logs (MFA, delegation, session revocation).
  * Purge job metrics.
  * Infrastructure events (container scans, Terraform drift).
* Alert routing:
  * Pager rotation for HIGH severity (24/7 coverage).
  * Slack channel `#security-alerts` for medium/low with daily digest.
  * Monthly security health report auto-generated (`scripts/reporting/security_monthly.py`) and stored in `docs/reports/security/YYYY-MM.md`.

### 3.3 Testing & coverage metrics

* Authorization tests must cover 100% of privileged endpoints (`/api/v1/admin/*`, structure/event admin endpoints, delegation APIs). Coverage report exported from pytest marker `@pytest.mark.privileged`.
* MFA adoption tracked via telemetry dashboard; target ≥80% of admins enrolled within 30 days of release.
* CVE SLA compliance monitored through automation dashboard; failing SLA triggers incident ticket.

## 4. Implementation checklist

- [ ] Role/delegation API extended with inheritance model.
- [ ] Session store tracks user agents + MFA factor; revocation endpoints wired to audit trail.
- [ ] SSO (SAML/SCIM) onboarding guide published and tenant toggle shipped.
- [ ] MFA enrollment gating and enforcement for privileged roles.
- [ ] Consent center updated with versioned notices and webhook for revocations.
- [ ] Data purge jobs configured and monitored.
- [ ] DPIA/ROPA repositories updated and signed off.
- [ ] Security automation pipelines (Dependabot, Trivy, pip-audit, npm audit) integrated with SLA tracking.
- [ ] SIEM dashboards + monthly reporting automated.
- [ ] ASVS L1 check and IR playbook report archived.

Ownership and due dates are tracked in the Governance epic within Linear project `GOV-2024-Q3`.

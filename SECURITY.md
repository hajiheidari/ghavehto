# Security and privacy checklist

Current code is read-only loopback development tooling, not a secure production backend. Nest dashboard APIs fail closed; no login, OTP sending, real customer data or secrets. Initial DB schema has tenant/branch RLS for a restricted NOLOGIN role, without enabling runtime identity. Pure permission checks are tested but not a substitute for authenticated context. PostgreSQL migration execution is tracked separately.

- M1: OTP hash/expiry/send+attempt throttles, generic responses; rotating sessions/revocation; tenant and branch guards; input validation; TLS; CSRF where cookies apply; CSP/XSS defenses; parameterized SQL; least privilege; secrets excluded from repository.
- M2: claim evidence access and manual verification; unclaimed offers forbidden; correction/takedown workflow; provenance/media rights; customer PII never exported to unrelated cafés.
- M3: atomic journals/stock/token consumption; actor-scoped idempotency/request hash; replay/expired/wrong-tenant tests; referral staged uniqueness and risk rules beyond device signals; reasoned audited adjustments; reconciliation and reversal authorization.
- M4: budget/eligibility/inventory limits, configurable policies, preferences, explicit location permission and honest attribution.
- M5: approval payload hashes/expiry, source rights/rate controls, suppression lists, zero default AI budget; no unapproved spending/publication/outreach.
- M6: privacy inventory/retention/deletion/export, local legal review, dependency scan, threat review, rate/load/security tests, encrypted off-host backups and restore drill, alerts and incident runbook.

Threats: malicious staff, replay after network retry, account farms, stolen sessions, cross-tenant reads, source poisoning and prompt injection in research. Treat source content as untrusted data; it cannot grant agents permissions. Separate founder/admin privileges, log privileged access, require step-up authentication for sensitive changes. Audit retains reasons while minimizing PII.

Operational targets proposed for pilot: daily encrypted backup, RPO 24 hours/RTO 8 hours subject to founder acceptance; verify by restore, not backup-job success alone. No recovery guarantee exists yet.

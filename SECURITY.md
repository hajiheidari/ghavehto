# Security and privacy checklist

Current code is read-only loopback development tooling, not a secure production backend. Nest dashboard APIs fail closed; no login, OTP sending, real customer data or secrets. Initial DB schema has tenant/branch RLS for a restricted NOLOGIN role, without enabling runtime identity. Pure permission checks are tested but not a substitute for authenticated context. PostgreSQL migration execution is tracked separately.

Internal session service issues 256-bit opaque credentials only to already verified active users, stores SHA256 hashes, expires access in 15 minutes and refresh in 30 days, rotates atomically without extending original family expiry and revokes a family on refresh reuse. A family advisory lock serializes replay/logout against new descendants. Clients must serialize refresh requests; concurrent duplicate refreshes conservatively revoke the family and require verification again. No public issuance/authentication route exists yet; an approved OTP pipeline and least-privilege identity database role remain required. No test user or bypass credentials are exposed.

- M1: OTP hash/expiry/send+attempt throttles, generic responses; rotating sessions/revocation; tenant and branch guards; input validation; TLS; CSRF where cookies apply; CSP/XSS defenses; parameterized SQL; least privilege; secrets excluded from repository.
- M2: claim evidence access and manual verification; unclaimed offers forbidden; correction/takedown workflow; provenance/media rights; customer PII never exported to unrelated cafés.
- M3: atomic journals/stock/token consumption; actor-scoped idempotency/request hash; replay/expired/wrong-tenant tests; referral staged uniqueness and risk rules beyond device signals; reasoned audited adjustments; reconciliation and reversal authorization.
- M4: budget/eligibility/inventory limits, configurable policies, preferences, explicit location permission and honest attribution.
- M5: approval payload hashes/expiry, source rights/rate controls, suppression lists, zero default AI budget; no unapproved spending/publication/outreach.
- M6: privacy inventory/retention/deletion/export, local legal review, dependency scan, threat review, rate/load/security tests, encrypted off-host backups and restore drill, alerts and incident runbook.

Threats: malicious staff, replay after network retry, account farms, stolen sessions, cross-tenant reads, source poisoning and prompt injection in research. Treat source content as untrusted data; it cannot grant agents permissions. Separate founder/admin privileges, log privileged access, require step-up authentication for sensitive changes. Audit retains reasons while minimizing PII.

Operational targets proposed for pilot: daily encrypted backup, RPO 24 hours/RTO 8 hours subject to founder acceptance; verify by restore, not backup-job success alone. No recovery guarantee exists yet.

## OTP preparation (internal only)

`OtpCrypto` uses cryptographically random six-digit codes and a keyed HMAC-SHA256 digest bound to a random challenge UUID, login purpose and normalized phone. Provision a separate random secret of at least 32 bytes through a secret manager before integration; no default key exists. Key rotation must invalidate outstanding challenges or preserve explicit key versions for their short lifetime. A plain code hash is insufficient against offline enumeration. `DisabledOtpProvider` refuses every delivery without including code/phone in the error.

These primitives are deliberately not registered as an HTTP login flow. Before enabling any OTP route: transactional persistent challenges and single-use consumption; expiry and bounded attempts; per-identity/IP send limits and cooldown; generic responses against enumeration; encrypted phone storage and keyed lookup; provider failure/retry semantics; least-privilege database role; redacted logs; atomic verified-user/session issuance; approval for real sending. No code, destination or key belongs in analytics/audit metadata.

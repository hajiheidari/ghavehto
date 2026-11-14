# Security and privacy

Current scope is loopback development, with real transactional identity/session/tenant tests. Public initial login, SMS delivery, web login UI, production deployment and store release are disabled.

## Implemented boundaries

- OTP: random six-digit codes, keyed purpose/challenge/normalized-phone HMAC, keyed canonical phone/IP fingerprints, five-minute expiry, five attempts, 60-second resend cooldown, five reservations/phone/hour, 30/IP/hour and 20 verification calls/IP/five-minute window. Pending/failed sends count. Only acknowledged sent challenges can be consumed; no delivery receipt or real SMS arrival is inferred from tests.
- Sending: default disabled adapter refuses before DB writes. The provider contract includes cancellation; default deadline is five seconds. Timeout/failure or late completion cannot revive a failed/superseded credential. Real adapters still require approval.
- Identity: OTP consumption, encrypted phone persistence, audit and session issuance share a transaction. Failure rolls back all; deleted users cannot be resurrected. New users receive no café/admin roles.
- Phone vault: separate stable lookup HMAC and AES-256-GCM encryption keys, fresh nonce, authenticated user ID/key version, explicit key ring, no default secrets. OTP key rotation does not duplicate identities. Encryption-key rotation needs retained decryption keys; stable lookup-key migration/backfill is a separate operation.
- Sessions: 256-bit opaque credentials, hashed storage, 15-minute access/30-day family expiry, atomic rotation without extending family lifetime, family locks for replay/logout, expiry/deleted-user checks and idempotent audited revocation.
- Database: restricted NOLOGIN identity/café roles, no arbitrary audit updates/deletes or identity-role access to café memberships. Runtime logins must be non-owner, non-inheriting and non-privileged. Roles/actor context use SET LOCAL and reset at transaction end.
- Tenancy: user identity comes from the session, never an actor/role header or body. Family/identity locks precede RLS-scoped café/branch operations. Owner profile changes and owner-scoped audit append are atomic. No unrelated consumer PII is returned.
- OTP retention: a fixed argument-free SECURITY DEFINER routine has safe search_path, qualified tables, PUBLIC execution revoked, one advisory lease, SKIP LOCKED and batches of at most 1000 expired challenges older than 24h plus 1000 verification windows older than 24h. It cannot prune current hourly budgets; the identity role gets EXECUTE, not arbitrary DELETE. Counts-only audit is appended. Users/sessions/audit retention is untouched.
- HTTP: strict DTO validation, parameterized SQL, generic Persian errors with server-generated request IDs, no raw exception/SQL/credential response, no-store, Helmet baseline headers and no wildcard CORS. Bearer APIs do not accept ambient cookie authority. TS authenticated helpers omit cookies/reject redirects; Dart session helpers disable redirects and bound the complete send/read.

## Activation and release gates

An approved provider, secure key/credential provisioning and explicit real-send authorization are required for initial sign-in. Input IP must come from a trusted transport boundary and reviewed reverse-proxy policy. Secret rotation/recovery, real delivery reconciliation, transport/global abuse limits, HTTPS/TLS, request logging redaction/monitoring, web secure cookies/CSRF and mobile secure storage must be completed/reviewed before public authentication.

Physical-device Iranian reachability, publisher/region eligibility, final privacy/account deletion/export/retention/legal review, encrypted off-host backups with restore evidence, dependency/load/security review and release rollback remain release gates. Proposed pilot backup targets are not recovery guarantees.

M2 claim evidence/manual verification and source/media correction rights; M3 immutable independent journals/stock/QR replay/fraud/reconciliation; M4 budget/preferences/attribution; M5 approval/budget/provenance/worker controls remain milestone acceptance work. No imported profile implies partnership, and phone possession never proves café ownership.

Test-only capturing providers, temporary restricted database logins and synthetic fixtures are confined to disposable tests. No fixed production OTP, demo token, bypass login, real café/customer seed or secret is committed.

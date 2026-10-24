# Development status · 2026-10-25

M0 planning is documented, with external feasibility questions still open. M1 is IN PROGRESS; no production launch or completed end-user login is claimed.

Source of truth: https://github.com/hajiheidari/ghavehto, branch `codex/m1-foundation`, draft PR #1. Main has not been changed. [Live PR checks](https://github.com/hajiheidari/ghavehto/pull/1/checks) are authoritative for the current head.

## Observed execution

Code `495eaba5e112211d43d89585564ed986ae4f87c2` passed [Foundation CI 40142933728](https://github.com/hajiheidari/ghavehto/actions/runs/40142933728) in all five jobs: web/API/database, mobile source/integration, complete cloud development container, checked-in Android debug and checked-in iOS simulator debug. Logs confirmed 17 PostgreSQL tests including parent-suite accounting and 6 Flutter tests, with Flutter analyze reporting no issues. Local unit/type/contract/drift/build/SSR checks also ran successfully as recorded in TESTING.md.

This subsequent increment standardizes Persian API errors and server-generated request IDs with executed local tests; its own complete validation is visible in PR checks. Prior green results are never assigned to later executable code.

## Implemented M1 foundations

- Pinned Node 24.19.0 / pnpm 11.25.0 / Nest 11.1.17 / Next 16.4.2 / Flutter 3.47.5, frozen lockfile, package-age verification and explicit build-script allowlist.
- Persian RTL Next SSR connected to the real Nest bootstrap; honest empty/error states and protected dashboard shells. No imported commercial directory data.
- PostgreSQL/PostGIS migrations 001–007, tenant/branch RLS, checksum-verified migrations and readiness through restricted credentials.
- Persistent OTP HMACs, expiry, attempt/send budgets, cooldown, single-use consumption, resend supersession, provider cancellation/deadline and bounded expiry maintenance.
- Atomic internal OTP → encrypted phone identity → audit → opaque session issuance; stable private lookup HMAC and authenticated encryption key ring. No automatic café/admin role grant.
- Restricted identity and café roles, non-inheriting non-owner runtime login validation, transaction-local session-derived actor context.
- Authenticated café/branch reads and owner-only profile updates with atomic audit; session status, rotation and idempotent logout. Admin/agent and legacy dashboard routes still deny access.
- OpenAPI-derived validated flat TypeScript/Dart bootstrap/access/session models and narrow client helpers, with drift checks.
- Android/iOS platform sources checked into Git from checksum-verified official pinned templates; CI builds those files directly. Native names are Persian; Android HTTP exception is debug-only; release signing is unset.

## Current activation boundary

Initial public OTP/login routes and SMS delivery are NOT enabled. The only enabled delivery implementation in application defaults is the disabled adapter; capturing providers and synthetic identities exist solely in disposable tests. No fixed OTP, bypass/demo token or consumer PII seed exists.

To continue genuine sign-in: identify an approved SMS provider/account and template/sender; provide credentials through secure configuration (never chat/Git); separately authorize a narrowly scoped real test send. The founder has not authorized purchases, external account creation or unapproved sending.

After provider selection: implement/review that adapter, compose secret/key configuration, complete the actual initial login transport, web HttpOnly/Secure/SameSite cookies with CSRF protection and mobile secure token storage, then verify the full real-device flow. Public deployment still requires separate approval, TLS/ingress abuse controls and operational review.

## Other open gates

Cloud Browser could not reach the development host's localhost preview (net::ERR_CONNECTION_REFUSED). Browser visual QA is unverified. Android debug and iOS simulator builds are not physical-device or signed-store tests. Publisher/region feasibility, Iranian device reachability, final icons/store assets and operational privacy/restore review remain open.

M2 directory/provenance/claims/search, M3 independent immutable stamps/stars/tier journals, M4 experiences/referrals/founders, M5 agents/content and M6 release hardening remain milestone work. The three loyalty journals stay separate and disabled until implemented and tested. Core consumer/café features remain permanently free.

No public hosting, store submission, purchase, outreach, campaign or bulk third-party import has been performed.

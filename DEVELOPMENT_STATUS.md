# Development status · 2026-11-10

M0 planning is documented. M1 production identity activation is deferred at the founder's direction while independent M2 work proceeds. See [product delivery sequence](docs/PRODUCT_EXECUTION.md). No production launch or completed end-user login is claimed.

Source of truth: https://github.com/hajiheidari/ghavehto, branch `codex/m1-foundation`, draft PR #1. Main has not been changed. [Live PR checks](https://github.com/hajiheidari/ghavehto/pull/1/checks) are authoritative for the current head.

## Observed execution

Code `495eaba5e112211d43d89585564ed986ae4f87c2` passed [Foundation CI 40142933728](https://github.com/hajiheidari/ghavehto/actions/runs/40142933728) in all five jobs: web/API/database, mobile source/integration, complete cloud development container, checked-in Android debug and checked-in iOS simulator debug. Logs confirmed 17 PostgreSQL tests including parent-suite accounting and 6 Flutter tests, with Flutter analyze reporting no issues. Local unit/type/contract/drift/build/SSR checks also ran successfully as recorded in TESTING.md.

The subsequent Persian HTTP error/request-ID checkpoint `34221b1` passed all five jobs in Foundation CI 40143606737. The lock capture checkpoint `a2ba5bd` also passed all five jobs in CI 40143950028. Dart dependencies are now checked in and enforced alongside the pinned pnpm lock. See live PR checks for the enforcing commit's separate results.

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

The founder selected SMS.ir. Its Verify Send adapter is implemented and tested with an injected offline transport; it is not wired to startup. Genuine sign-in still needs an existing account and approved template, secure credentials (never chat/Git), and separate authorization for a narrowly scoped real test send.

Initial login HTTP handlers are available only to explicitly composed apps; the standard executable does not register them. Next: review the approved template, compose secret/key configuration, add web HttpOnly/Secure/SameSite cookies with CSRF protection and mobile secure token storage, then verify the real-device flow. Public deployment still requires separate approval, TLS/ingress abuse controls and operational review.

## Other open gates

An explicitly composed test application can exercise QR issue/consume routes with verified bearer sessions. Normal startup does not register them; no client scanner or rollout is enabled.

Migration 019 wires QR into the verified backend session transaction. The customer and awarding employee are derived server-side. There is still no public QR endpoint or UI.

Migration 018 adds a database-enforced rolling issuance limit across all branches. Public QR routes and verified-session wiring remain pending.

Migration 017 implements internal stamp QR issue/consume with hash-only storage, 90-second expiry and branch binding. No HTTP routes, QR screen or general runtime permissions are enabled; session wiring and issuance throttling remain pending.

Migration 016 adds a restricted internal one-stamp capability, operation replay protection and atomic audit. It is not granted to the web/API runtime. The QR/visit proof, rate limits, expiry and redemption are still pending before activation.

M3 storage starts in migration 015: three independent append-only journals and immutable stamp program versions. Runtime roles cannot access them yet. Transactional earning, balance checks, expiry processing, QR and redemption are pending.

Owners can edit the private café name from the panel when the HTTPS write origin is configured. This does not alter the reviewed public listing.

Staff changes can be submitted from the owner web panel when `PANEL_WRITE_ORIGIN` is configured as an exact HTTPS origin. The default remains read-only. No browser session issuance or real SMS is enabled.

The café panel includes a branch staff roster. Owner authorization remains enforced by the API; no contacts or tokens are rendered.

The read-only café web panel now consumes the authenticated scope APIs. It reads an opaque access credential only from a host-only secure cookie name and validates it with the API on every request. Genuine initial issuance, rotation, logout and CSRF-protected mutations remain activation work.

Authenticated café/branch navigation APIs now return only the actor's accessible scopes. Owner capability is derived on the server. No café ID must be guessed to start navigating.

Owners can read branch staff IDs using a paginated API (migration 014). The roster does not expose account contact details or change the underlying self-only membership policy.

Branch staff administration is available through an owner-only API (migration 013). It requires a known verified user ID; account discovery, invitations and a management UI are not included.

Ownership access now has a separate restricted operator command (migration 012). It cannot replace an existing owner or replay a revoked grant. Operational accounts and reassessment are still pending.

Ownership requests now have a private operator queue and verified/rejected decisions (migration 011). The database stores an opaque reference to a separately reviewed evidence case. Provisioning a reviewer, collecting evidence and granting or revoking operational ownership remain separate.

Claim intake is available to verified sessions against a published branch (migration 010). It is private to the claimant, bounded and audited. Evidence upload, reviewer approval, actual ownership grant and a claimant UI are separate follow-ups.

Public branch detail pages use the same visibility and provenance rules as search. They distinguish a missing listing from a temporarily unavailable directory.

Directory stewardship now has a restricted operator CLI and migration 009. Publish, correct and withdraw decisions are revision-checked and audited atomically. Operator accounts are not provisioned and there is no public or staff HTTP write endpoint yet.

M2 started with a reviewed branch projection (migration 008), bounded public search and an RTL SSR directory. Sources must be permitted; withdrawal and source denial hide records. No public phone, commercial dataset, write UI or claim flow is included yet.

Cloud Browser could not reach the development host's localhost preview (net::ERR_CONNECTION_REFUSED). Browser visual QA is unverified. Android debug and iOS simulator builds are not physical-device or signed-store tests. Publisher/region feasibility, Iranian device reachability, final icons/store assets and operational privacy/restore review remain open.

M2 directory/provenance/claims/search, M3 independent immutable stamps/stars/tier journals, M4 experiences/referrals/founders, M5 agents/content and M6 release hardening remain milestone work. The three loyalty journals stay separate and disabled until implemented and tested. Core consumer/café features remain permanently free.

No public hosting, store submission, purchase, outreach, campaign or bulk third-party import has been performed.

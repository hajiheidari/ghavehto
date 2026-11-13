# Changelog

- Added internal expiring single-use QR tokens and atomic stamp consumption.

- Added an internal single-stamp transaction that checks branch authority and returns the original receipt on an identical retry.

- Added immutable storage for café stamps, spendable platform stars and non-spendable tier points, plus versioned stamp rules. No award or redemption endpoint is enabled.

- Added owner-only café name editing to the web panel. Reviewed public listings retain their approved names.

## Staff access forms

- Added owner staff grant/revoke forms with an explicit HTTPS origin, server-side API authorization and redirect-after-submit.

## Staff roster panel

- Added a Persian owner-only staff roster view using the scoped API, with cursor navigation and explicit empty/denied states.

## Read-only café panel

- Connected Persian SSR café and branch panels to verified API scopes. No login shortcut or cookie issuance route is enabled.

## Authenticated café navigation

- Added bounded café and branch lists derived from the verified session and existing RLS policies.

## Branch staff roster

- Added a paginated, owner-only staff roster scoped to one branch. Responses expose account IDs only.

## Branch staff access

- Owners can set branch-specific staff access for an existing verified account. Repeat requests are safe, and real changes are audited.

## Owner access lifecycle

- Added an operator-only owner grant and revocation separate from evidence review, with audit and replay protection.

## Private ownership review

- Added an operator-only evidence decision, claimant status updates and transactional audit. Verification records the outcome without granting a café role.

## M2 ownership request intake

- Added verified-session claim submission, private status list and withdrawal; repeated submission is idempotent for the same café. No owner or tenant privileges are granted by intake.

## Public branch pages

- Added linkable Persian branch pages and an API read constrained to the same reviewed projection as directory search.

## M2 directory review

- Added an operator-only publish/correct/withdraw command backed by a restricted PostgreSQL capability, revision conflict detection and transactional audit.

## M2 directory discovery

- Deferred live SMS and documented the independent product delivery sequence.
- Added moderated branch snapshots, provenance and withdrawal visibility gates, bounded Persian search and the RTL directory page.

## Initial login transport preparation

- Added request and verification routes that are only registered through explicit application composition. The normal startup still exposes neither route. Extended the disposable PostgreSQL fixture to test HTTP OTP issuance, verification, replay rejection and existing tenant authorization.

## SMS.ir provider preparation

- Added an internal verification adapter and offline tests for request format, receipt validation, cancellation and sanitized failures. Application defaults remain disabled; no real message is sent.

## 2026-11-10 · Enforce the Flutter dependency lock

- Recovered the actual Flutter 3.47.5 lock from a refreshed CI artifact, verified the archive checksum, and committed the lock without local paths.
- Enforced the lock and checked for drift in Flutter source, native and cloud development validation.

## 2026-10-25 · Dart dependency reproducibility

- Verified 34221b1 / Foundation CI 40143606737 in all five jobs.
- Found the mobile dependency lock was not yet committed; added a narrow CI artifact of the actual Flutter-generated pubspec.lock so it can be recovered and enforced without invented hashes or a local SDK workaround. Frozen validation follows after recovery.

## 2026-10-25 · Verified foundation checkpoint and safe HTTP errors

- Confirmed 495eaba / Foundation CI 40142933728 successful in all five jobs: real database/HTTP checks, Flutter, complete container and checked-in Android/iOS debug/simulator builds.
- Standardized generic Persian error responses and server-generated request IDs without raw exception/SQL/credential output; local validation passed, own full CI required.
- Consolidated current status/API/security/development instructions and documented the explicit provider/real-send activation gate. M1 remains open; no purchase, initial login or SMS activation.

## 2026-10-25 · Runtime validation and HTTP test ordering

- Tightened runtime login validation to require non-inheriting role membership and no table-owner role membership.
- Corrected an HTTP test ordering expectation after intentional credential rotation/revocation; denials remain strict. Fresh CI pending.

## 2026-10-25 · Existing-session HTTP lifecycle

- Added bearer session status, strict rotating refresh and idempotent logout endpoints; no initial login or SMS route.
- Generated validated TS/Dart session contracts and client helpers; redirect/cookie behavior and full-request deadlines are explicit.
- Added real HTTP rotation/replay/logout-audit tests and canonical expiry validation. New CI pending.

## 2026-10-25 · Checked-in native sources and runtime readiness

- Recovered and checksum-verified official pinned Flutter platform source; checked in Android/iOS projects, Persian native names and debug-only Android HTTP; release signing remains unset.
- Changed CI to build the repository's native projects directly.
- Readiness checks all migration checksums through restricted runtime credentials (migration 007); no migration admin pool is used by the API health route.
- Local Node/type/client checks passed; new native/database CI pending. Browser preview could not access localhost, so visual QA remains unverified.

## 2026-10-25 · OTP operations and client fix

- Verified actual restricted-login tenant HTTP/database tests; corrected the Dart regex literal found by Flutter CI.
- Added delivery deadline/cancellation and fixed bounded expiry cleanup (migration 006), with privilege/late-delivery/live-data tests.
- Fresh local Next build/SSR smoke passed after isolating a generated cache error. New operation/Flutter results await their own CI.

## 2026-10-25 · Authenticated tenant APIs

- Verified atomic identity increment eb4e6a7 in all five CI jobs.
- Added restricted runtime login validation, session-derived transactional RLS for café/branch reads and owner-only audited profile edits; no actor header/body authority.
- Added generated validated TS/Dart scoped response contracts and real HTTP authorization tests; new results pending CI.
- Added CI archive of pinned native source for check-in; no signed build or publication.

## 2026-10-25 · Atomic internal identity

- Composed OTP consumption, encrypted phone identity, audit and session issuance atomically; no ownership/admin membership is inferred.
- Added authenticated private-phone encryption with separate lookup/key-ring secrets and dedicated restricted database role (migration 004).
- Added rollback, concurrency, deletion and least-privilege tests; local unit/type checks pass, new database CI pending. HTTP login/SMS remain closed.

## 2026-10-21 · Persistent internal OTP challenges

- Verified code 353f543 in CI 39552323784: all five jobs SUCCESS, including full development container and Android/iOS debug/simulator builds. Both real-DB runs passed all seven new OTP subtests; the runner reports 10 tests including suite accounting and existing tests. No public login/SMS enabled; remaining M1 gates are unchanged.

- Re-read PR/head and confirmed d75c471 CI fully successful.
- Added private OTP migration 003, expiry/attempts/cooldown and persisted identity/IP limits under transactional locks; single-use and resend/failure states remain internal.
- Added domain-separated keyed phone/IP fingerprints with canonical IP buckets and real-DB lifecycle/concurrency tests; no sending provider or public login enabled.
- Local unit/type checks passed; new migration/integration execution awaits its own CI. M1 remains incomplete.

## 2026-10-20 · Cloud continuation

- Re-read PR #1/head and confirmed handoff CI 39402649968 fully successful, including session DB tests and both native debug/simulator jobs.
- Reproduced frozen dependency installation in a clean cloud checkout. Added tested internal keyed OTP cryptography and a disabled delivery adapter; no public login or SMS enabled.
- Added optional pinned-version development container, shared cloud validation command and a dedicated CI job; container execution awaits its own result.
- Permanent-free commitments, empty commercial dataset and deferred independent loyalty journals are unchanged.

## 2026-10-20 · M1 foundation increment

- Added buildable pnpm workspace, NestJS API and Next.js Persian RTL SSR public site with honest empty/error states.
- Added OpenAPI export, generated validated TypeScript/Dart bootstrap clients and drift check.
- Added default-deny dashboard API guards, permission/normalization tests, initial PostgreSQL/PostGIS migration with RLS, advisory-lock/checksum migration runner and disposable database integration test.
- Added Flutter source tests, real-backend integration test and CI native scaffold/build jobs; native execution pending.
- Local builds/typechecks, 5 combined tests and live Next→Nest smoke passed. Browser visual inspection timed out. M1 remains incomplete: real authentication, database execution and mobile/native results are open.
- CI 39401295349 subsequently confirmed PostgreSQL/PostGIS, Flutter analyze and 4 tests including shared-backend communication, Android debug and iOS simulator builds successful.
- Added a separate internal session lifecycle increment: hashed opaque access/refresh tokens, atomic family rotation/replay and logout locks, expiry/deleted-user checks and audited transitions. No login or SMS endpoint enabled; new database tests await execution.

## 2026-10-19

- Founder selected hajiheidari/ghavehto; inspected existing main history and initial README before preparing foundation commit.
- Recorded founder direction that public café phone listings are in scope, retaining provenance and correction/removal handling.

- Added M0 product, feasibility, research, architecture, schema, scope and risk documentation.
- Added local read-only TypeScript API, Persian RTL connectivity harness, shared contract and HTTP tests.
- Added unbuilt Flutter source proposal and reserved Next web workspace documentation.
- No native apps, database, production authentication, provider integration or public deployment claimed.

Cloud CI 39405670299 on 945de93: web-api-database and mobile-source PASS. The development image successfully built Node/pnpm/Flutter and passed builds/unit/contract checks, then failed at Git diff inside the host-owned bind mount. Scoped Git safe.directory to the explicit workspace for that command; full container rerun pending.

Verified final code checkpoint 8ffa53c: Foundation CI 39406101771 SUCCESS in all five jobs, including the complete development-container validation and Android debug/iOS simulator builds. OTP persistence/limits/identity integration remain the next M1 increment; no real sending enabled.

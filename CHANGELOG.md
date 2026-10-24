# Changelog

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

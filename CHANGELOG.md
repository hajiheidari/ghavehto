# Changelog

## 2026-10-21 · Persistent internal OTP challenges

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

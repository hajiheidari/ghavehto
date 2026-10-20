# Development status · 2026-10-20

M0 planning delivered with unresolved external feasibility items. M1 NOT complete.

Environment: initially empty directory, no local Git repository. Node 24.19 and Git found; bundled pnpm 11.25.0 located and used successfully. Flutter/Dart/Docker/psql/Android SDK unavailable locally. Official Flutter manifest returned AccessDenied: service not available in your location. GitHub connector authenticated as hajiheidari. Main contains the M0 foundation commit b8875041aa9f35351ac0463c9b1d36288a36f264. Its connectivity-probe GitHub Actions run 39257434879 was subsequently verified successful. New work is an M1 increment, not completion of M1.

Completed: pnpm workspace and lockfile; NestJS 11.1.17 API with OpenAPI and default-deny dashboard guards; Next.js 16.4.2 Persian RTL SSR home/directory-empty/dashboard shells; generated and validated bootstrap TS/Dart clients; PostgreSQL/PostGIS migration and RLS tests supplied; source-only Flutter retry/RTL/contract/integration tests and CI native-build jobs. No account login, OTP sending, production session management or business transactions are enabled.

Execution record: `pnpm build` successfully built contracts, Nest API and production Next web. `pnpm typecheck` passed all three workspaces. Combined HTTP/domain/generated-contract suite: 5 tests passed, 0 failed. Client drift check and real Next SSR → Nest smoke passed. Browser visual inspection timed out; no visual QA claim.

Remote CI run 39401295349 for commit 56c9e4841bd03843fdd283d95904f874c2738f71 completed SUCCESS: real PostgreSQL/PostGIS migration/repeatability/RLS test; Flutter analyze (no issues), 4 Flutter tests including actual Dart→Nest HTTP; Android debug build; iOS simulator debug build. These are not store-signed release builds, device tests or publication. Native scaffolds were generated from pinned Flutter templates during CI.

Verified handoff head: 83fa9a8c06d9d4a50c2715996c42e5357587ad90. Its Foundation validation run 39402649968 completed SUCCESS in all four jobs, including both native debug/simulator builds. Read-back of web-api-database logs confirmed 2 real PostgreSQL tests passed: migration/RLS and session lifecycle (rotation, reuse, concurrency, logout, expiry and deletion). This evidence covers that head only.

Cloud continuation: clean checkout and frozen pnpm installation succeeded on Node 24.19.0/pnpm 11.25.0 without the previous machine's caches. Added internal OTP cryptography (random six-digit codes; HMAC-SHA256 bound to challenge, purpose and normalized phone; timing-safe comparison) and a default-disabled provider interface. This is not a completed OTP flow: no persistence, throttling, verification endpoint, SMS credentials or login UI is enabled. Added an optional Docker/Dev Container recipe and complete cloud validation script; Docker/Flutter are absent in this execution host, so container execution requires its own CI result.

Blockers/open work: Flutter SDK location denial and missing Android/macOS toolchains locally; local PostgreSQL/Docker absent; production identity/session and OTP integration; native platform generation exists as a reproducible pinned CI step, not checked-in generated projects; publisher eligibility and approved providers. No customer/café data imported. Public café contact numbers are in scope and are not treated as a legal blocker; consumer contact data remains protected. Temporary local tarball cache recovered interrupted official Next/SWC downloads with lockfile SHA512 verification; it is not committed or a production dependency.

Next increment: execute remote PostgreSQL/mobile/native CI, fix failures, complete real identity/session/tenant pipeline, check in generated native projects from an eligible environment and complete remaining M1 gates. No public release or paid service is authorized.

Risk register: R1 critical store/region eligibility (founder/support); R2 high Iranian service reachability (physical tests); R3 high reward fraud/tenant escape (transactional invariants); R4 high source rights (permission review); R5 high reward funding (disabled until approved inventory); R6 medium operational load (bounded workers/manual oversight); R7 high incomplete toolchains (M1 build gates).

Cloud host verification for this increment: `pnpm typecheck`, `pnpm build`, generated-contract test, client drift check, OpenAPI export/no-diff and real Next→Nest smoke all PASS. No local database/native/container execution is implied.

Cloud CI 39405670299 on 945de93: web-api-database and mobile-source PASS. The development image successfully built Node/pnpm/Flutter and passed builds/unit/contract checks, then failed at Git diff inside the host-owned bind mount. Scoped Git safe.directory to the explicit workspace for that command; full container rerun pending.

## Verified cloud checkpoint · 2026-10-20

Code commit `8ffa53c279fc011fd5138bdf70ff781eacbb6ad7` passed Foundation validation [39406101771](https://github.com/hajiheidari/ghavehto/actions/runs/39406101771) in ALL FIVE jobs: web-api-database, mobile-source, cloud-development, Android debug build and iOS simulator debug build. Read-back of cloud-development logs confirmed the development image was built from its recipe, the pinned Node/pnpm/Flutter checks passed, frozen install/build/typecheck/7 Node tests/2 real PostgreSQL tests/client drift/OpenAPI/Next→Nest smoke passed, Flutter analyze found no issues and all 4 Flutter tests passed including actual Nest communication. The mount-specific Git fix was validated by this complete rerun. No physical-device, signed-store, browser visual or production-readiness claim is made.

This final documentation update changes no executable code. The exact tested code commit is recorded above; later CI outcomes must be checked independently. Main remains at the reviewed M0 baseline and PR #1 stays draft.

Next bounded increment: persistent OTP challenges with expiry, attempts, send cooldown and per-identity/IP limits; atomic single-use consumption and verified-user/session issuance; least-privilege identity DB role; then authenticated server-side tenant/branch API integration. Keep delivery disabled and HTTP login closed until these gates pass. Checked-in native platform projects and browser visual QA also remain M1 work. M1 is NOT complete.

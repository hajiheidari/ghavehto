# Test plan and execution

## Persistent OTP increment · 2026-10-21

Baseline head d75c471: Foundation CI 39406739601 and probe 39406739563 read back as SUCCESS. Local `pnpm test` passed 7 selected tests including canonical IP/phone fingerprint tests; workspace typecheck passed. New real-PostgreSQL OTP tests are wired into `test:db` and the existing full cloud validator; execution is pending this increment's own CI. Coverage includes disabled-provider zero writes, hash-only storage, café-role denial, wrong identity/code, concurrent single-use consumption, persistent attempt exhaustion, expiry, concurrent cooldown, resend invalidation, phone caps across IPs, IP caps across identities, verification budgets, provider failure and pending/late delivery. No real SMS is sent. This is not completed login or atomic user/session issuance.

Run `node --test apps/api/test/*.test.ts`. The local suite checks actual HTTP bootstrap contract, method/path rejection and RTL harness. Native TypeScript stripping executes code but is not static typechecking.

Executed 2026-10-19 on Node 24.19.0: `node --test apps/api/test/server.test.ts` → 1 passed, 0 failed. The test opened a real ephemeral loopback server. No native, database, browser visual, production-security or remote CI result is implied.

## M1 increment execution record · 2026-10-19/20

- `pnpm build`: contracts, Nest API TypeScript and optimized Next.js build PASS.
- `pnpm typecheck`: all three workspaces PASS.
- Combined Node suite across Nest HTTP, domain normalization/permissions, generated-contract validation and historical probe: 5 passed, 0 failed. `pnpm test` selects 4 of these; generated client test runs separately in CI.
- `node scripts/generate-clients.mjs --check`: PASS.
- `node scripts/smoke-web.mjs`: PASS against two actual processes; Next SSR successfully consumes Nest API, RTL/noindex/empty directory/protected placeholders/404/robots verified.
- M0 remote Actions run 39257434879: success confirmed. New M1 CI outcomes are pending until read back.
- Browser visual inspection: tool timed out; NOT verified. No screenshot or visual-quality claim.

CI run [39401295349](https://github.com/hajiheidari/ghavehto/actions/runs/39401295349) for 56c9e484: SUCCESS. Logs verified PostgreSQL/PostGIS migration repeatability/RLS test PASS, Flutter analyze with no issues and 4 Flutter tests PASS (including actual Dart→Nest request), Android debug build PASS, iOS simulator debug build PASS. No signed store releases or physical-device execution is implied.

Handoff run [39402649968](https://github.com/hajiheidari/ghavehto/actions/runs/39402649968) for 83fa9a8c: all four jobs SUCCESS, including Android debug/iOS simulator. Read-back of job 118560890417 logs confirmed 2 PostgreSQL tests PASS (migration/RLS and session lifecycle with replay/concurrency/logout/expiry/deleted-user checks).

Cloud continuation: frozen dependency installation PASS; `pnpm test` PASS (6 tests, including 2 new OTP tests). OTP tests cover challenge/identity/key binding, normalized numbers, malformed codes, private key copying and disabled delivery. The synthetic code used in the disabled-provider test is a test input only, never a login credential or application fallback. `bash -n scripts/validate-cloud.sh` PASS. Docker/Flutter are not installed on this host; new cloud container execution is pending CI and no claim is made yet. OTP verification and full authenticated API tenant authorization remain unfinished; permission tests/deny-all guards do not demonstrate completed login. Visual browser QA remains unverified.

M2–6 acceptance includes: unrelated café read/write denial; unclaimed café offers forbidden; consumed/expired/wrong-tenant QR denial; same request returns original operation; changed payload conflicts; concurrent stock never negative; referrals rewarded once; spending stars does not change tier points; period reset leaves stars untouched; reversals reconcile; agent pause/approval/budget controls; RTL web e2e and mobile widgets; deletion/privacy, restore and load tests. Implement tests with actual transactional storage rather than counters or mocked concurrency.

Cloud host verification for this increment: `pnpm typecheck`, `pnpm build`, generated-contract test, client drift check, OpenAPI export/no-diff and real Next→Nest smoke all PASS. No local database/native/container execution is implied.

Cloud CI 39405670299 on 945de93: web-api-database and mobile-source PASS. The development image successfully built Node/pnpm/Flutter and passed builds/unit/contract checks, then failed at Git diff inside the host-owned bind mount. Scoped Git safe.directory to the explicit workspace for that command; full container rerun pending.

## Verified cloud checkpoint · 2026-10-20

Code commit `8ffa53c279fc011fd5138bdf70ff781eacbb6ad7` passed Foundation validation [39406101771](https://github.com/hajiheidari/ghavehto/actions/runs/39406101771) in ALL FIVE jobs: web-api-database, mobile-source, cloud-development, Android debug build and iOS simulator debug build. Read-back of cloud-development logs confirmed the development image was built from its recipe, the pinned Node/pnpm/Flutter checks passed, frozen install/build/typecheck/7 Node tests/2 real PostgreSQL tests/client drift/OpenAPI/Next→Nest smoke passed, Flutter analyze found no issues and all 4 Flutter tests passed including actual Nest communication. The mount-specific Git fix was validated by this complete rerun. No physical-device, signed-store, browser visual or production-readiness claim is made.

This final documentation update changes no executable code. The exact tested code commit is recorded above; later CI outcomes must be checked independently. Main remains at the reviewed M0 baseline and PR #1 stays draft.

Next bounded increment: persistent OTP challenges with expiry, attempts, send cooldown and per-identity/IP limits; atomic single-use consumption and verified-user/session issuance; least-privilege identity DB role; then authenticated server-side tenant/branch API integration. Keep delivery disabled and HTTP login closed until these gates pass. Checked-in native platform projects and browser visual QA also remain M1 work. M1 is NOT complete.

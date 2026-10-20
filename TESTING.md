# Test plan and execution

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

Follow-up session service/migration tests are separate from this run and await their own database CI. OTP verification and full authenticated API tenant authorization remain unfinished; permission tests/deny-all guards do not demonstrate completed login. Visual browser QA remains unverified.

M2–6 acceptance includes: unrelated café read/write denial; unclaimed café offers forbidden; consumed/expired/wrong-tenant QR denial; same request returns original operation; changed payload conflicts; concurrent stock never negative; referrals rewarded once; spending stars does not change tier points; period reset leaves stars untouched; reversals reconcile; agent pause/approval/budget controls; RTL web e2e and mobile widgets; deletion/privacy, restore and load tests. Implement tests with actual transactional storage rather than counters or mocked concurrency.

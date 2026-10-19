# Test plan and execution

Run `node --test apps/api/test/*.test.ts`. The local suite checks actual HTTP bootstrap contract, method/path rejection and RTL harness. Native TypeScript stripping executes code but is not static typechecking.

Executed 2026-10-19 on Node 24.19.0: `node --test apps/api/test/server.test.ts` → 1 passed, 0 failed. The test opened a real ephemeral loopback server. No native, database, browser visual, production-security or remote CI result is implied.

M1 required, currently NOT RUN: TypeScript compilation, Nest/Next builds, DB clean+upgrade migrations, OTP/session/authorization tests, generated-client drift, Flutter analyze/widget tests, Android debug build and iOS simulator build on macOS. No browser visual QA has run.

M2–6 acceptance includes: unrelated café read/write denial; unclaimed café offers forbidden; consumed/expired/wrong-tenant QR denial; same request returns original operation; changed payload conflicts; concurrent stock never negative; referrals rewarded once; spending stars does not change tier points; period reset leaves stars untouched; reversals reconcile; agent pause/approval/budget controls; RTL web e2e and mobile widgets; deletion/privacy, restore and load tests. Implement tests with actual transactional storage rather than counters or mocked concurrency.

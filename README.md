# قهوه‌تو · Ghahvehto

دنیای قهوه، به سلیقه تو

Milestone 0 research and an executable, dependency-free connectivity foundation. This is not a launch-ready application. No production data, accounts, messages, spending, or public deployment.

Start with [development status](DEVELOPMENT_STATUS.md), [architecture](ARCHITECTURE.md), [requirements](REQUIREMENTS.md), and [research](docs/RESEARCH.md).

## Run locally

Requires Node 24.19 or newer (native TypeScript stripping).

```powershell
node --test apps/api/test/*.test.ts
node apps/api/src/server.ts
```

Open http://127.0.0.1:4100 for the Persian RTL connectivity harness. `/v1/bootstrap` is the shared read-only API. `/health` is process liveness, not database readiness. Nothing persists. The listener binds loopback only.

Target structure: `apps/api`, `apps/web`, `apps/mobile`, `packages/contracts`, `infra`, `docs`. Next.js and Flutter remain pending toolchain installation; see the explicit build gates in TESTING.md.

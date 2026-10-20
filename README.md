# قهوه‌تو · Ghahvehto

دنیای قهوه، به سلیقه تو

Milestone 0 research and incremental Milestone 1 foundation: NestJS API, Next.js Persian RTL web, OpenAPI-derived TypeScript/Dart bootstrap clients and an initial PostgreSQL/PostGIS migration. This is not a launch-ready application. No production data, accounts, messages, spending, or public deployment.

Start with [development status](DEVELOPMENT_STATUS.md), [architecture](ARCHITECTURE.md), [requirements](REQUIREMENTS.md), and [research](docs/RESEARCH.md).

## Run locally

Requires Node 24.19+ and pnpm 11.25.0. The supplied runtime includes pnpm even when npm is not in PATH.

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm dev:api
# Separate terminal:
pnpm dev:web
```

Open http://127.0.0.1:3000 for Next.js. Nest listens at http://127.0.0.1:4101; `/docs` exposes OpenAPI, `/v1/bootstrap` is the shared read-only API, `/health/live` is liveness and `/health/ready` requires the migrated database. SSR calls Nest server-side; no permissive browser CORS is needed. Both development listeners bind loopback. Dashboard API routes reject all access while real authentication is unfinished.

`node scripts/smoke-web.mjs` checks built Next → Nest communication. `pnpm contracts:export` then `node scripts/generate-clients.mjs` refreshes clients; `--check` detects drift. The generator deliberately supports only this flat read-only bootstrap contract and rejects unsupported schema shapes. Extend it or adopt a full generator before business endpoints.

For the database, set LOCAL_DB_PASSWORD, run `docker compose -f infra/compose.yaml up -d`, then set DATABASE_URL and run `pnpm db:migrate`. Migration administration requires extension/role privileges; the migration credential must not become the runtime application credential. `pnpm --filter @ghahvehto/api test:db` requires a disposable database, not production.

The original dependency-free M0 probe remains available through `node apps/api/src/server.ts` at port 4100 for diagnostics. Flutter SDK/Android toolchain are absent and the official Flutter download returned a location denial. Native project generation/build remains open; see TESTING.md and DEVELOPMENT_STATUS.md.

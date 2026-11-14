# قهوه‌تو · Ghahvehto

دنیای قهوه، به سلیقه تو

Incremental Milestone 1 foundation: Persian RTL Next/Nest/Flutter, validated TypeScript/Dart contracts, PostgreSQL/PostGIS migrations, atomic internal OTP/identity/session issuance, restricted tenant APIs and checked-in Android/iOS projects. M1 and end-user login are not complete. No real sending provider, commercial data, spending or public deployment is enabled.

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

Open http://127.0.0.1:3000 for Next.js. Nest listens at http://127.0.0.1:4101; `/docs` exposes OpenAPI and `/v1/bootstrap` is shared bootstrap. `/health/live` is liveness; `/health/ready` needs a restricted runtime pool and all migration checksums. Both listeners bind loopback. Legacy dashboard/admin/agent routes deny all requests. Existing-session and café/branch APIs require actual opaque credentials plus restricted runtime configuration; see API_SPEC.md. Initial OTP/login routes and SMS remain closed.

`node scripts/smoke-web.mjs` checks built Next → Nest communication. `pnpm contracts:export` then `node scripts/generate-clients.mjs` refreshes validated flat bootstrap/access/session models and reviewed request helpers; `--check` detects drift. Nested business APIs need explicit generator extension. Run `node --test packages/contracts/client.test.ts packages/contracts/access-client.test.ts` for contract checks.

For the database, set LOCAL_DB_PASSWORD, run `docker compose -f infra/compose.yaml up -d`, then set DATABASE_URL and run `pnpm db:migrate`. Migration administration requires extension/role privileges; the migration credential must not become the runtime application credential. `pnpm --filter @ghahvehto/api test:db` requires a disposable database, not production.

Set IDENTITY_DATABASE_URL only to a distinct restricted non-owner login as described in infra/README.md; privileged/inherited credentials are rejected. No identity keys or runtime passwords have defaults. Environment variables must be supplied through the shell or the development container, not committed secrets.

The original M0 probe remains at port 4100 for diagnostics. Optional Dev Container/Compose tooling and the full cloud validator are documented in infra/README.md. Native sources are checked in; pinned CI executes Android debug and iOS simulator debug builds. Signing, device checks and initial sign-in remain gated. The next external input is documented in docs/AUTH_ACTIVATION_GATE.md.

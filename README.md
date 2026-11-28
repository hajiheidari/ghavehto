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

Private dashboards share `/dashboard/session` for logout of an existing browser credential. Configure `PANEL_WRITE_ORIGIN` as the exact HTTPS origin to accept same-origin form writes. Logout uses the existing restricted session API, revokes that family and only clears the host-only secure cookie after confirmation (or an unauthorized response). Backend failure is retryable. This does not issue a browser credential or enable initial login.

Notification preferences require `PRIVATE_PREFERENCES_VIEW=1` and an explicitly composed API `preferencesPool` using a dedicated non-inheriting login whose only membership is `ghahvehto_preferences`. Standard startup does not register this capability. The page is `/dashboard/preferences`; all categories default off. The stored daily limit is a consent ceiling, not a delivery service. No provider or notification dispatcher is activated.

Private loyalty history requires `PRIVATE_LOYALTY_HISTORY_VIEW=1` and an explicitly composed API `loyaltyReaderPool` with a dedicated non-inheriting login whose only membership is `ghahvehto_loyalty_reader`. `/dashboard/loyalty` reads the current member's stamp, star or tier history separately, with bounded chronological pages. Internal reasons and operation IDs are omitted. History entries, including expired awards, are not a calculated available balance. No earning, spending or payout capability is granted to this reader.

The same read capability exposes `/v1/internal/loyalty-history/summary`: existing funded-lot accounting calculates available stars at server time, returning `null` for unsupported history. Tier qualification is separate, by UTC calendar year (optional `year=2000` through `9999`, current year by default). Counts use decimal strings. The private star/tier views show the timestamp and respective summary. Reading a balance does not activate redemption or restore expired stars.

`/v1/internal/loyalty-history/stamp-summary` requires `cafeId`, `programId` and `version`, and only reveals program metadata when the member already has history in that exact scope. Reconciled lot movements determine valid stamp units; unsupported or inconsistent allocation history returns `null`. Other users, cafes and program versions cannot contribute to the balance. The private history links to each program's reader; program cost does not guarantee current reward stock or fulfillment.

For that exact program's history, pass all three scope parameters with `ledger=stamp` to `/v1/internal/loyalty-history`, with optional `after`. Partial scope or another ledger is rejected; an unseen scope returns 404 and a foreign/cross-program cursor returns 400. The private program page links to `/dashboard/loyalty/stamp/history`. Unscoped history remains compatible, and neither history reader returns internal reasons or operation IDs.

The same private reader can list reward reservation receipts with `/v1/internal/loyalty-history/reservations?ledger=stamp|star&after=<receiptId>` or recover one with `/reservation?ledger=stamp|star&operationId=<originalOperationId>`. Pages contain at most 20 own-account receipts; recovery never re-executes the reservation. `/dashboard/loyalty/reservations` uses the existing private loyalty flag. Historical units come from the immutable debit; current reward prices/stock and internal cancellation reasons are omitted. A reservation receipt does not confirm delivery or real payment, and cancellation does not extend expired stars.

`PRIVATE_OWNERSHIP_CLAIMS_VIEW=1` enables the private claimant page and reviewed-branch handoff. `/dashboard/ownership` reads claims in 50-item history pages through the existing restricted session/tenant API. Submission and withdrawal require `PANEL_WRITE_ORIGIN` and a verified live session. The server checks published branch provenance, quotas and claimant ownership. Claim/evidence decisions do not grant operational ownership; evidence collection and the operator's grant/revoke workflow remain separate. Initial login remains disabled.

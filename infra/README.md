# Local database foundation

Identity runtime access: migrations 004/005 introduce NOLOGIN restricted roles. Provision a distinct non-owner `NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE` login through your secret/DB administration workflow, grant it membership in `ghahvehto_identity` and `ghahvehto_app`, and supply its credential as IDENTITY_DATABASE_URL. Never reuse the migration/database-owner credential; startup rejects it. There is no default runtime password. Public login and sending remain closed. Test suites create and drop their own disposable restricted login automatically.

OTP cleanup: `pnpm --filter @ghahvehto/api auth:cleanup` requires that restricted runtime URL and runs a single bounded batch (1000 challenge rows + 1000 verification windows maximum, older than 24h). It prints counts only and does not delete users, sessions or audit. Schedule only in an explicitly configured development/approved operational environment; no cloud scheduler or paid service is created by this repository.

`compose.yaml` proposes a loopback-only PostgreSQL/PostGIS 17 service with mandatory LOCAL_DB_PASSWORD. `migrations/001_foundation.sql` installs extensions, identity/directory/branch/membership/session/source/audit tables, indexes and default-deny tenant RLS. The application role has no login or privileged bypass; runtime role/password provisioning remains separate. No production credential is supplied. Docker is absent locally, so execution evidence must be recorded separately from file presence.

The transactional migration runner serializes with advisory locks, records checksum/version and rejects edited applied migrations. Use new numbered migrations after the first one has been released. Tests use synthetic fixtures rolled back in a disposable database.

## Cloud development container

The optional `tools` Compose profile and `.devcontainer/devcontainer.json` provide Node 24.19.0, pnpm 11.25.0 and Flutter 3.47.5 (official Git tag), plus the existing PostgreSQL/PostGIS service. No hosting or external account is provisioned. On a Docker-enabled development host, from the repository root:

```bash
# Use a random local password containing URL-safe characters (DATABASE_URL embeds it).
export LOCAL_DB_PASSWORD="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
docker compose -f infra/compose.yaml --profile tools run --build --rm dev bash scripts/validate-cloud.sh
```

This executes frozen install, builds/typechecks, HTTP/contract/OTP/database/session checks, Next→Nest smoke, Flutter analyze and Flutter→Nest tests. It requires outbound access to official SDK/package/image sources. The DB credential is development migration administration only; it must never be used in production. Tests use disposable synthetic identities, never real phone delivery. Do not point the validator at a production database. Run `docker compose -f infra/compose.yaml --profile tools down` when finished; add `--volumes` only to deliberately discard development data and caches.

VS Code Dev Containers can open the same service after exporting LOCAL_DB_PASSWORD before launching the editor. Ports are forwarded for development only; no public tunnel is configured. Android SDK and Xcode are intentionally outside this Linux image: native builds still run in the existing Android/Linux and iOS/macOS CI jobs. Container build/execution evidence is tracked in TESTING.md; the recipe alone is not execution evidence. OS image tags/apt packages are versioned upstream inputs, not a bit-for-bit archived toolchain.

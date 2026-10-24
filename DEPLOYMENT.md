# Development environment and release gates

Use Node 24.19.0 and pnpm 11.25.0 with the frozen lockfile. Nest listens on 127.0.0.1:4101; Next development/production-preview scripts bind 127.0.0.1:3000. No domain, DNS, public tunnel, TLS hosting or cloud account is provisioned.

The optional Compose tools profile / Dev Container reproduces Node, pnpm, Flutter 3.47.5 and PostgreSQL/PostGIS. Its full validator has executed successfully in GitHub CI; exact observed commits/runs are in TESTING.md. Package-age verification and the build-script allowlist remain enabled. No previous machine's .tools/.pnpm-store cache is required.

Android and iOS sources are checked in. Android debug builds run on Linux and iOS simulator debug builds on macOS. Native release signing is unconfigured, launcher artwork is provisional, and no signed-store or physical-device success is claimed.

Migration credentials belong only to migration administration/disposable tests. Provision a separate restricted runtime login as described in infra/README.md and set IDENTITY_DATABASE_URL. Never set it to the DB owner; startup rejects privileged/inherited authority. No default runtime password or identity encryption key exists. Readiness requires matching checksums for all known migrations through that restricted pool.

Before public activation: approved SMS provider/sender/template and bounded real-send authorization, secure identity keys, complete web/mobile sign-in transport and secret storage, trusted client-IP policy, global ingress abuse controls and TLS. Before release: publisher feasibility, real-device connectivity, privacy/deletion/retention, restore/monitoring evidence, migration compatibility/rollback, native signatures/assets and founder release approval. None of these approvals is implied by development authorization.

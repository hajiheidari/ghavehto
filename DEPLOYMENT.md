# Local development and deployment gates

Run commands in README with Node 24.19+ and pnpm 11.25.0. Nest binds 127.0.0.1:4101 and Next defaults to 127.0.0.1:3000 through the supplied scripts. The historical probe binds 4100. No domain/DNS/TLS/hosting configured.

pnpm was located in the bundled runtime. Dependencies are pinned by pnpm-lock.yaml with package-age checks and explicit build-script allowlist; no paid service is enabled. M1 still needs Flutter/Dart, Android SDK/JDK, PostgreSQL/PostGIS or Docker, macOS/Xcode runner for iOS. Official Flutter SDK download returned a location denial. Use an eligible development environment; do not promise a native build from source presence.

Before any authorized production deployment: reproducible builds and migrations, real auth/tenant guards, provider contracts, secrets injection, TLS, release rollback and migration compatibility plan, backups/restore, alerts, privacy URLs, native signatures, platform availability and founder release signoff. A future Docker/CI template is not evidence of successful deployment.

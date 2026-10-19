# Local development and deployment gates

Run commands in README with Node 24.19+. Probe listens only on 127.0.0.1:4100; tests use ephemeral loopback ports. No domain/DNS/TLS/hosting configured.

M1 prerequisites: npm-compatible package manager, Flutter/Dart, Android SDK/JDK, PostgreSQL/PostGIS or Docker, macOS/Xcode runner for iOS. Select versioned images and locked packages after registry verification. Do not silently install external tooling or provision hosting here.

Before any authorized production deployment: reproducible builds and migrations, real auth/tenant guards, provider contracts, secrets injection, TLS, release rollback and migration compatibility plan, backups/restore, alerts, privacy URLs, native signatures, platform availability and founder release signoff. A future Docker/CI template is not evidence of successful deployment.

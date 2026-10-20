# Local database foundation

`compose.yaml` proposes a loopback-only PostgreSQL/PostGIS 17 service with mandatory LOCAL_DB_PASSWORD. `migrations/001_foundation.sql` installs extensions, identity/directory/branch/membership/session/source/audit tables, indexes and default-deny tenant RLS. The application role has no login or privileged bypass; runtime role/password provisioning remains separate. No production credential is supplied. Docker is absent locally, so execution evidence must be recorded separately from file presence.

The transactional migration runner serializes with advisory locks, records checksum/version and rejects edited applied migrations. Use new numbered migrations after the first one has been released. Tests use synthetic fixtures rolled back in a disposable database.

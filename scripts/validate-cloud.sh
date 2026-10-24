#!/usr/bin/env bash
# Run only against the disposable development database, never production.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?Set DATABASE_URL to a disposable development database}"
node -e 'if (process.versions.node !== "24.19.0") throw new Error("Expected Node 24.19.0")'
[[ "$(pnpm --version)" == '11.25.0' ]]
flutter --version --machine | node -e '
let data=""; process.stdin.on("data", chunk => data+=chunk);
process.stdin.on("end", () => { if(JSON.parse(data).frameworkVersion !== "3.47.5") throw new Error("Expected Flutter 3.47.5"); });'
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
node --test packages/contracts/client.test.ts packages/contracts/access-client.test.ts
pnpm contracts:export
node scripts/generate-clients.mjs --check
# The checkout belongs to the host user when bind-mounted into this container.
# Trust only this explicit workspace for this command, never all repositories.
git -c safe.directory="$PWD" diff --exit-code -- packages/contracts/openapi.json
pnpm --filter @ghahvehto/api test:db
node scripts/smoke-web.mjs
# Flutter's integration test calls an actual Nest process.
node apps/api/dist/nest/main.js &
cloud_api_pid=$!
trap 'kill "$cloud_api_pid" 2>/dev/null || true' EXIT
node --input-type=module - <<'JS'
import { setTimeout } from 'node:timers/promises';
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:4101/health/live', { signal: AbortSignal.timeout(1000) });
    if (response.ok) process.exit(0);
  } catch {}
  await setTimeout(200);
}
throw new Error('Nest failed to become ready');
JS
cd apps/mobile
flutter pub get
flutter analyze
flutter test --dart-define=RUN_API_INTEGRATION=true --dart-define=API_BASE_URL=http://127.0.0.1:4101

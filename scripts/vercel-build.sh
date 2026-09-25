#!/usr/bin/env bash
set -euo pipefail
# Apply DB schema (sessions/users/CRM tables) using Production DATABASE_URL.
pnpm --filter @workspace/db run push-force
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/crm run build
ROOT="$(pnpm --silent -w exec pwd)"
rm -rf public
cp -r "$ROOT/artifacts/crm/dist/public" public

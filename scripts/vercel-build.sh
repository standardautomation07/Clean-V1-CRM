#!/usr/bin/env bash
set -euo pipefail
# Create/update CRM tables using Production DATABASE_URL.
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/ensure-schema.mjs
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/crm run build
ROOT="$(pnpm --silent -w exec pwd)"
rm -rf public
cp -r "$ROOT/artifacts/crm/dist/public" public

#!/usr/bin/env bash
set -euo pipefail
# Create/update CRM tables using Production DATABASE_URL.
ROOT="$(pnpm --silent -w exec pwd)"
NODE_TLS_REJECT_UNAUTHORIZED=0 node "$ROOT/scripts/ensure-schema.mjs"
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/crm run build
OUTPUT_DIR="$ROOT/artifacts/crm/public"
rm -rf "$OUTPUT_DIR"
cp -r "$ROOT/artifacts/crm/dist/public" "$OUTPUT_DIR"

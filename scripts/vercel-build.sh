#!/usr/bin/env bash
set -euo pipefail
ROOT="$(pnpm --silent -w exec pwd)"
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Applying database schema for this deployment."
  NODE_TLS_REJECT_UNAUTHORIZED=0 node "$ROOT/scripts/ensure-schema.mjs"
else
  echo "DATABASE_URL is not configured; skipping deployment-time schema setup."
fi
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/crm run build
OUTPUT_DIR="$ROOT/artifacts/crm/public"
rm -rf "$OUTPUT_DIR"
cp -r "$ROOT/artifacts/crm/dist/public" "$OUTPUT_DIR"

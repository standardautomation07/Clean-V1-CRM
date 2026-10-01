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
# vercel.json lives at the repository root and declares the api/index.mjs
# function there, so the Vercel project must be rooted at the repository root
# too; the static output therefore belongs in <repo>/public.
OUTPUT_DIR="$ROOT/public"
rm -rf "$OUTPUT_DIR"
cp -r "$ROOT/artifacts/crm/dist/public" "$OUTPUT_DIR"

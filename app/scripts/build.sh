#!/usr/bin/env sh
set -eu

APP_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$APP_ROOT"

pnpm exec vite build
pnpm exec tsc --project tsconfig.server.json
cp NOTICE pnpm-lock.yaml dist/
jq '.scripts = {start: "node index.js"}' package.json >dist/package.json

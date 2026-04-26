#!/usr/bin/env bash
# Build production assets and pack a folder you can copy to a machine, unzip, `yarn install --production`, then `node server.js`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Building production bundle…"
yarn build

OUT="${ROOT}/re-entanglement-portable.zip"
rm -f "$OUT"

ZIP_ARGS=(
  dist
  server.js
  package.json
  yarn.lock
  readme.md
  .env.example
)

if [[ -f data/videos.json ]]; then
  ZIP_ARGS+=(data/videos.json)
fi
if [[ -d src/images-publication ]]; then
  ZIP_ARGS+=(src/images-publication)
fi

echo "==> Writing $(basename "$OUT")…"
zip -q -r "$OUT" "${ZIP_ARGS[@]}"

echo "==> Done: $OUT ($(du -h "$OUT" | awk '{print $1}'))"
echo "    Unzip, copy .env from .env.example, run: yarn install --production && node server.js"

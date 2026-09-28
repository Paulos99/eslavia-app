#!/usr/bin/env bash
# Copy the built Mini App into the main site as /app/ (eslavia-site/public/app -> dist/app).
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
DST="${1:-/workspace/eslavia-site/public/app}"
rm -rf "$DST"
mkdir -p "$DST/brand"
cp -a "$APP/index.html" "$APP/styles.css" "$APP/app.js" "$APP/data" "$APP/img" "$DST/"
cp -a "$APP/brand/logo.svg" "$DST/brand/logo.svg"
echo "synced to $DST: $(find "$DST" -type f | wc -l) files, $(du -sh "$DST" | cut -f1)"

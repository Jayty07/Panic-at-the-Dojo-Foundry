#!/usr/bin/env bash
# Rebuilds the installable zips in dist/. Bump "version" in system.json / module.json first.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/panic-at-the-dojo.zip dist/patd-hero-builder.zip
zip -qr dist/panic-at-the-dojo.zip panic-at-the-dojo
zip -qr dist/patd-hero-builder.zip patd-hero-builder
echo "Built dist/panic-at-the-dojo.zip and dist/patd-hero-builder.zip"

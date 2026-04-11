#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/build"
OUT_DIR="$ROOT/website/downloads/v0.1.0/linux"

cmake -S "$ROOT" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" -j

mkdir -p "$OUT_DIR"
cp "$BUILD_DIR/arc-ide" "$OUT_DIR/arc-ide"
cp "$ROOT/README.md" "$OUT_DIR/README.txt"

tar -czf "$ROOT/website/downloads/arc-ide-v0.1.0-linux-x86_64.tar.gz" -C "$OUT_DIR" arc-ide README.txt
sha256sum "$ROOT/website/downloads/arc-ide-v0.1.0-linux-x86_64.tar.gz" > "$ROOT/website/downloads/arc-ide-v0.1.0-linux-x86_64.tar.gz.sha256"

echo "Linux release artifact prepared:"
echo " - website/downloads/arc-ide-v0.1.0-linux-x86_64.tar.gz"

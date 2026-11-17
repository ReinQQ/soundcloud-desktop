#!/usr/bin/env bash
# ==============================================================================
# Builds, signs, and generates latest.json updater manifest for SoundCloud Desktop.
# Prepares a ready-to-upload 'release-dist' directory for Nginx hosting at:
# https://buster.gripe/scdesktop/
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo -e "\033[36m==> Preparing SoundCloud Desktop Signed Release Build...\033[0m"

# 1. Check or load private key
KEY_FILE="$ROOT_DIR/.keys/scdesktop.key"
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  if [ -f "$KEY_FILE" ]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
    echo -e "\033[32m==> Loaded private key from .keys/scdesktop.key\033[0m"
  else
    echo -e "\033[33mWarning: .keys/scdesktop.key not found and TAURI_SIGNING_PRIVATE_KEY unset.\033[0m"
  fi
fi

# 2. Build injection script bundle
echo -e "\033[36m==> Compiling injected frontend assets...\033[0m"
npm run build

# 3. Read app version from tauri.conf.json
VERSION=$(node -e "console.log(require('./src-tauri/tauri.conf.json').version)")
echo -e "\033[36m==> Building SoundCloud Desktop release version v${VERSION}...\033[0m"

# 4. Run Tauri production build
npx tauri build

# 5. Prepare release-dist directory
OUT_DIR="$ROOT_DIR/release-dist"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle"
PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Look for Windows artifacts (nsis)
if [ -d "$BUNDLE_DIR/nsis" ]; then
  cp -f "$BUNDLE_DIR/nsis"/* "$OUT_DIR/" 2>/dev/null || true
  ZIP_FILE=$(find "$BUNDLE_DIR/nsis" -name "*.zip" | head -n 1)
  if [ -n "$ZIP_FILE" ]; then
    ZIP_NAME=$(basename "$ZIP_FILE")
    SIG_FILE="${ZIP_FILE}.sig"
    REPO_USER="${GITHUB_REPOSITORY_OWNER:-reinqq}"
    REPO_NAME="${GITHUB_REPOSITORY_NAME:-scdesktop}"
    if [ -f "$SIG_FILE" ]; then
      SIG_CONTENT=$(cat "$SIG_FILE")
      cat <<EOF > "$OUT_DIR/latest.json"
{
  "version": "v${VERSION}",
  "notes": "SoundCloud Native Desktop v${VERSION} release",
  "pub_date": "${PUB_DATE}",
  "platforms": {
    "windows-x86_64": {
      "signature": "${SIG_CONTENT}",
      "url": "https://github.com/${REPO_USER}/${REPO_NAME}/releases/download/v${VERSION}/${ZIP_NAME}"
    }
  }
}
EOF
    fi
  fi
fi

echo -e "\033[32m==> Signed release package generated in 'release-dist/':\033[0m"
ls -la "$OUT_DIR"

echo -e "\033[33m"
echo "Upload instructions for Nginx static hosting (https://buster.gripe/scdesktop/):"
echo "  rsync -avzP release-dist/ user@buster.gripe:/var/www/scdesktop/"
echo -e "\033[0m"

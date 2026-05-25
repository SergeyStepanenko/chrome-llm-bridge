#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <extension-id>"
  exit 1
fi

EXTENSION_ID="$1"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/com.stepanenko.llm_bridge.json"
SOURCE_MANIFEST="$(cd "$(dirname "$0")" && pwd)/host-manifest.json"

mkdir -p "$MANIFEST_DIR"
sed "s|<EXTENSION_ID>|$EXTENSION_ID|g" "$SOURCE_MANIFEST" > "$MANIFEST_PATH"

echo "Installed native host manifest to: $MANIFEST_PATH"

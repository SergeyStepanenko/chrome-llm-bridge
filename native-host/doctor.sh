#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ID="${1:-}"
HOST="${LLM_BRIDGE_HOST:-127.0.0.1}"
PORT="${LLM_BRIDGE_PORT:-8765}"
MANIFEST="$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts/com.stepanenko.llm_bridge.json"

echo "LLM Bridge Doctor (macOS / Chrome Canary)"
echo

echo "1) Manifest file"
if [[ -f "$MANIFEST" ]]; then
  echo "   ok: $MANIFEST"
else
  echo "   fail: manifest not found"
  echo "   hint: native-host/install-macos.sh <extension-id>"
fi
echo

if [[ -n "$EXTENSION_ID" ]]; then
  echo "2) allowed_origins contains extension id"
  if grep -q "$EXTENSION_ID" "$MANIFEST" 2>/dev/null; then
    echo "   ok: $EXTENSION_ID"
  else
    echo "   fail: extension id not found in manifest"
    echo "   hint: reinstall manifest with correct extension id"
  fi
  echo
fi

echo "3) node binary"
if command -v node >/dev/null 2>&1; then
  echo "   ok: $(command -v node)"
else
  echo "   fail: node not found in PATH"
  echo "   hint: set absolute node path in native-host/host.js or update PATH for Chrome Canary"
fi
echo

echo "4) bridge health endpoint"
if command -v curl >/dev/null 2>&1; then
  if curl -s --max-time 2 "http://${HOST}:${PORT}/health" >/dev/null; then
    echo "   ok: http://${HOST}:${PORT}/health"
  else
    echo "   fail: cannot reach bridge"
    echo "   hint: ensure Chrome Canary is open and extension is enabled, then reload extension"
  fi
else
  echo "   skip: curl not found"
fi
echo

echo "5) sample command (requires active tab)"
if command -v node >/dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if node "$SCRIPT_DIR/bridge-cli.js" '{"type":"dom.text","selector":"h1"}' >/dev/null 2>&1; then
    echo "   ok: command executed"
  else
    echo "   fail: command error"
    echo "   hint: open a tab in Chrome Canary and try again"
  fi
else
  echo "   skip: node not found"
fi

# LLM Bridge — Chrome Canary

Chrome extension + native messaging host that lets an LLM agent control Chrome Canary tabs via an HTTP API at `localhost:8765`.

## Problem

LLM agents need a way to interact with a real browser — read page content, click elements, type text, navigate URLs. This bridge exposes Chrome's tab control as a simple HTTP API, so any agent or script can drive the browser with `curl` or a plain HTTP call.

## Architecture

```
CLI/Agent (curl :8765)
    ↓ HTTP POST /command
host.js (Node, native messaging host)
    ↓ stdio (4-byte length prefix + JSON)
background.js (MV3 service worker)
    ↓ chrome.tabs.sendMessage
content.js (DOM commands in the target tab)
```

## Installation

1. Open Chrome Canary → `chrome://extensions` → Developer mode → Load unpacked → this folder
2. Copy the **Extension ID**
3. Install the native host manifest:

```bash
bash native-host/install-macos.sh <EXTENSION_ID>
```

4. Reload the extension in `chrome://extensions`

## Verify

```bash
curl -s http://127.0.0.1:8765/health
```

Diagnostics:

```bash
bash native-host/doctor.sh [EXTENSION_ID]
```

## Commands

### DOM

| Command | Description |
|---------|-------------|
| `dom.click` | Click an element |
| `dom.type` | Type text into an element |
| `dom.focus` | Focus an element |
| `dom.text` | Get element text |
| `dom.textAll` | Get text of all matching elements |
| `dom.html` | Get element HTML |
| `dom.attr` | Get element attribute |
| `dom.value` | Get input value |
| `dom.exists` | Check element existence |
| `dom.scrollTo` | Scroll to position |
| `dom.scrollBy` | Scroll by offset |

### Page

| Command | Description |
|---------|-------------|
| `page.snapshot` | Full page snapshot |
| `page.resources` | Resource Timing API entries |
| `page.fetch` | Fetch URL using page cookies |

### Tab

| Command | Description |
|---------|-------------|
| `tab.remember` | Save the active tab |
| `tab.use` | Switch to tab by ID |
| `tab.clear` | Clear the remembered tab |
| `tab.info` | Get current tab info |
| `tab.navigate` | Navigate to URL |
| `tab.waitForLoad` | Wait for page load |

## Environment variables

- `LLM_BRIDGE_HOST` — default `127.0.0.1`
- `LLM_BRIDGE_PORT` — default `8765`
- `LLM_BRIDGE_TIMEOUT_MS` — default `15000`

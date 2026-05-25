#!/Users/sergeystepanenko/.nvm/versions/node/v22.19.0/bin/node
import http from "http"

const stdin = process.stdin
const stdout = process.stdout

const HOST = process.env.LLM_BRIDGE_HOST || "127.0.0.1"
const PORT = Number(process.env.LLM_BRIDGE_PORT || 8765)
const DEFAULT_TIMEOUT_MS = Number(
  process.env.LLM_BRIDGE_TIMEOUT_MS || 15000
)

let buffer = Buffer.alloc(0)
let requestSeq = 0
const pending = new Map()

function logError(...args) {
  console.error(...args)
}

function createId() {
  requestSeq += 1
  return `req-${Date.now()}-${requestSeq}`
}

function sendNative(payload) {
  const json = JSON.stringify(payload)
  const length = Buffer.byteLength(json)
  const header = Buffer.alloc(4)
  header.writeUInt32LE(length, 0)
  stdout.write(Buffer.concat([header, Buffer.from(json)]))
}

function sendRequestToChrome(payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const id = payload.id ?? createId()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve({
        id,
        ok: false,
        error: "Timeout waiting for Chrome response",
      })
    }, timeoutMs)

    pending.set(id, (response) => {
      clearTimeout(timer)
      pending.delete(id)
      resolve(response)
    })

    sendNative({ ...payload, id })
  })
}

function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return
  }

  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    return
  }

  if (message.type === "ping") {
    sendNative({ id: message.id ?? null, type: "pong" })
    return
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || HOST}`)

    if (req.method === "GET" && url.pathname === "/health") {
      const response = {
        ok: true,
        connected: true,
        pending: pending.size,
      }
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(response))
      return
    }

    if (req.method === "POST" && url.pathname === "/command") {
      const body = await readRequestBody(req)
      let payload = null

      try {
        payload = body ? JSON.parse(body) : null
      } catch (error) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            ok: false,
            error: "Invalid JSON body",
          })
        )
        return
      }

      if (!payload || typeof payload !== "object" || !payload.type) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(
          JSON.stringify({
            ok: false,
            error: "Missing command type",
          })
        )
        return
      }

      const timeoutMs =
        typeof payload.timeoutMs === "number"
          ? payload.timeoutMs
          : DEFAULT_TIMEOUT_MS
      const response = await sendRequestToChrome(payload, timeoutMs)

      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(response))
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: false, error: "Not found" }))
  } catch (error) {
    logError("HTTP handler error:", error)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ ok: false, error: "Server error" }))
  }
})

server.listen(PORT, HOST, () => {
  logError(`LLM bridge listening on http://${HOST}:${PORT}`)
})

stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  while (buffer.length >= 4) {
    const messageLength = buffer.readUInt32LE(0)

    if (buffer.length < messageLength + 4) {
      break
    }

    const messageBuffer = buffer.slice(4, 4 + messageLength)
    buffer = buffer.slice(4 + messageLength)

    try {
      const message = JSON.parse(messageBuffer.toString("utf8"))
      handleMessage(message)
    } catch (error) {
      sendNative({
        type: "error",
        ok: false,
        error: error?.message ?? "Failed to parse message",
      })
    }
  }
})

stdin.on("end", () => {
  logError("Native messaging disconnected. Exiting.")
  process.exit(0)
})

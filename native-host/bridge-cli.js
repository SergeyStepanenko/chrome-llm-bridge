#!/usr/bin/env node
import http from "http"

const args = process.argv.slice(2)

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage:",
      "  node native-host/bridge-cli.js '{\"type\":\"page.snapshot\"}'",
      "  echo '{\"type\":\"dom.text\",\"selector\":\"h1\"}' | node native-host/bridge-cli.js",
      "",
      "Environment:",
      "  LLM_BRIDGE_HOST (default: 127.0.0.1)",
      "  LLM_BRIDGE_PORT (default: 8765)",
    ].join("\n")
  )
  process.exit(0)
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      data += chunk
    })
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", reject)
  })
}

const host = process.env.LLM_BRIDGE_HOST || "127.0.0.1"
const port = Number(process.env.LLM_BRIDGE_PORT || 8765)

async function main() {
  let input = ""

  if (args.length > 0) {
    input = args.join(" ")
  } else {
    input = await readStdin()
  }

  if (!input.trim()) {
    console.error("No JSON input provided.")
    process.exit(1)
  }

  let payload
  try {
    payload = JSON.parse(input)
  } catch (error) {
    console.error("Invalid JSON input.")
    process.exit(1)
  }

  const request = http.request(
    {
      host,
      port,
      path: "/command",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    },
    (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk) => {
        body += chunk
      })
      response.on("end", () => {
        if (!body.trim()) {
          console.error("Empty response from bridge.")
          process.exit(1)
        }
        process.stdout.write(body)
      })
    }
  )

  request.on("error", (error) => {
    console.error("Bridge request failed:", error?.message ?? error)
    process.exit(1)
  })

  request.write(JSON.stringify(payload))
  request.end()
}

main()

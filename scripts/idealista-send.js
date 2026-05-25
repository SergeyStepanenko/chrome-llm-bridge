#!/usr/bin/env node
import http from "http"

const HOST = process.env.LLM_BRIDGE_HOST || "127.0.0.1"
const PORT = Number(process.env.LLM_BRIDGE_PORT || 8765)

const MESSAGE_TEXT = `Hola, ¿qué tal?
He visto tu anuncio y me ha interesado mucho. Estoy buscando vivienda en la zona para un alquiler de larga duración (contrato anual) y me gustaría saber si sigue disponible.
Puedo aportar toda la documentación necesaria: acreditación de residencia legal y documentos financieros.
Si te parece, podemos coordinar una visita. ¡Gracias!`

const AD_IDS = [
  "110746241",
  "110738782",
  "102862901",
  "102115812",
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sendCommand(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)

    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: "/command",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.setEncoding("utf8")
        res.on("data", (chunk) => { data += chunk })
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`Invalid JSON response: ${data}`))
          }
        })
      }
    )

    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

function log(adId, ...args) {
  const prefix = adId ? `[${adId}]` : "[main]"
  console.log(prefix, ...args)
}

async function navigateTo(url) {
  const result = await sendCommand({
    type: "tab.navigate",
    url,
    timeoutMs: 30000,
  })

  if (!result.ok) {
    throw new Error(`Navigation failed: ${result.error}`)
  }

  // Extra wait for dynamic content to render
  await sleep(3000)
}

async function getPageText() {
  const result = await sendCommand({ type: "dom.text" })

  if (!result.ok) {
    throw new Error(`Failed to get page text: ${result.error}`)
  }

  return result.result?.text ?? ""
}

async function elementExists(selector) {
  const result = await sendCommand({ type: "dom.exists", selector })
  return result.ok && result.result?.exists === true
}

async function typeText(selector, text) {
  const result = await sendCommand({ type: "dom.type", selector, text })

  if (!result.ok) {
    throw new Error(`Failed to type into ${selector}: ${result.error}`)
  }
}

async function clickElement(selector, index) {
  const payload = { type: "dom.click", selector }

  if (typeof index === "number") {
    payload.index = index
  }

  const result = await sendCommand(payload)

  if (!result.ok) {
    throw new Error(`Failed to click ${selector}: ${result.error}`)
  }
}

async function scrollToElement(selector) {
  // Use dom.exists to verify element, then scroll into view via a small script trick:
  // We'll click to focus area. If that fails, try scrolling down.
  const exists = await elementExists(selector)

  if (!exists) {
    // Scroll down a bit and retry
    await sendCommand({ type: "dom.scrollBy", x: 0, y: 500 })
    await sleep(1000)
  }
}

async function waitForText(text, maxWaitMs = 15000) {
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const pageText = await getPageText()

    if (pageText.includes(text)) {
      return true
    }

    await sleep(1500)
  }

  return false
}

async function processAd(adId) {
  const url = `https://www.idealista.com/inmueble/${adId}/`
  log(adId, `Opening ${url}`)

  await navigateTo(url)

  // Check page loaded correctly
  const pageText = await getPageText()

  if (pageText.includes("captcha") || pageText.includes("CAPTCHA") || pageText.includes("robot")) {
    log(adId, "⚠ CAPTCHA detected! Please solve it manually, then press Enter.")
    await waitForUserInput()
    // Re-read page after user solved captcha
    await sleep(2000)
  }

  // Check if already sent today
  if (pageText.includes("Last message sent today") || pageText.includes("Último mensaje enviado hoy")) {
    log(adId, "Already sent today — skipping message.")
  } else {
    // Find and fill the contact form
    log(adId, "Filling contact form...")

    // Try to scroll to contact section
    await scrollToElement('textarea[name="contact-message"]')
    await sleep(500)

    const hasTextarea = await elementExists('textarea[name="contact-message"]')

    if (!hasTextarea) {
      // Try alternative selectors
      const altTextarea = await elementExists("textarea.textarea-contact")

      if (!altTextarea) {
        // Try clicking "Contact" button first
        const hasContactBtn = await elementExists('a[href="#contact-form"], button.contact-button, [data-toggle="contact"]')

        if (hasContactBtn) {
          await clickElement('a[href="#contact-form"], button.contact-button, [data-toggle="contact"]')
          await sleep(1500)
        }
      }
    }

    // Try multiple textarea selectors
    const textareaSelectors = [
      'textarea[name="contact-message"]',
      'textarea[name="message"]',
      "textarea.textarea-contact",
      "#contact-form textarea",
      "form textarea",
    ]

    let typed = false

    for (const sel of textareaSelectors) {
      if (await elementExists(sel)) {
        await typeText(sel, MESSAGE_TEXT)
        typed = true
        log(adId, `Typed message into ${sel}`)
        break
      }
    }

    if (!typed) {
      log(adId, "⚠ Could not find textarea! Taking snapshot for debug...")
      const snapshot = await sendCommand({
        type: "page.snapshot",
        maxHtmlChars: 5000,
        maxTextChars: 5000,
      })
      log(adId, "Page title:", snapshot.result?.title)
      log(adId, "Skipping this ad — no textarea found.")
      return { adId, sent: false, reason: "no textarea" }
    }

    // Check for required checkboxes (privacy policy, etc.)
    const checkboxSelectors = [
      'input[type="checkbox"][name*="policy"]',
      'input[type="checkbox"][name*="privacy"]',
      'input[type="checkbox"][name*="accept"]',
      'input[type="checkbox"][name*="legal"]',
      'input[type="checkbox"][name*="condicion"]',
    ]

    for (const sel of checkboxSelectors) {
      if (await elementExists(sel)) {
        await clickElement(sel)
        log(adId, `Checked checkbox: ${sel}`)
        await sleep(300)
      }
    }

    // Click send button
    const sendSelectors = [
      'button[type="submit"].contact-button',
      'input[type="submit"]',
      'button[type="submit"]',
      "button.submitButton",
      "#contact-form button",
    ]

    let clicked = false

    for (const sel of sendSelectors) {
      if (await elementExists(sel)) {
        await clickElement(sel)
        clicked = true
        log(adId, `Clicked send button: ${sel}`)
        break
      }
    }

    if (!clicked) {
      log(adId, "⚠ Could not find send button!")
      return { adId, sent: false, reason: "no send button" }
    }

    // Wait for confirmation
    await sleep(2000)

    const afterText = await getPageText()

    if (afterText.includes("captcha") || afterText.includes("CAPTCHA") || afterText.includes("robot")) {
      log(adId, "⚠ CAPTCHA appeared after submit! Please solve it, then press Enter.")
      await waitForUserInput()
      await sleep(2000)
    }

    const confirmed = await waitForText("Last message sent today", 10000) ||
      await waitForText("Último mensaje enviado hoy", 5000)

    if (confirmed) {
      log(adId, "Message sent successfully!")
    } else {
      log(adId, "⚠ Could not confirm message was sent. Check manually.")
    }
  }

  // Add to favourites
  log(adId, "Adding to favourites...")
  const favSelectors = [
    'button[data-testid="favorite-button"]',
    "button.icon-fav",
    ".icon-heart",
    'a[title="Favourite"]',
    'a[title="Guardar"]',
    ".actions-save",
    ".favorite-button",
  ]

  for (const sel of favSelectors) {
    if (await elementExists(sel)) {
      await clickElement(sel)
      log(adId, `Clicked favourite: ${sel}`)
      break
    }
  }

  await sleep(1000)

  return { adId, sent: true }
}

function waitForUserInput() {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false)
    process.stdin.resume()
    process.stdin.once("data", () => {
      resolve()
    })
  })
}

async function main() {
  log(null, `Starting Idealista messaging for ${AD_IDS.length} ads`)
  log(null, `Bridge: http://${HOST}:${PORT}`)
  log(null, "")

  // Verify bridge is alive
  try {
    const health = await sendCommand({ type: "ping" })
    log(null, "Bridge connected:", health.type === "pong" ? "OK" : "unexpected response")
  } catch (error) {
    log(null, `ERROR: Cannot connect to bridge at http://${HOST}:${PORT}`)
    log(null, "Make sure the Chrome extension is running.")
    process.exit(1)
  }

  // Remember the active tab
  await sendCommand({ type: "tab.remember" })
  log(null, "Remembered active tab")
  log(null, "")

  const results = []

  for (const adId of AD_IDS) {
    try {
      const result = await processAd(adId)
      results.push(result)
    } catch (error) {
      log(adId, `ERROR: ${error.message}`)
      results.push({ adId, sent: false, reason: error.message })
    }

    // Pause between ads to avoid rate limiting
    log(null, "Waiting 5s before next ad...")
    await sleep(5000)
  }

  log(null, "")
  log(null, "=== RESULTS ===")

  for (const r of results) {
    if (!r) continue
    const status = r.sent ? "SENT" : `SKIPPED (${r.reason || "already sent"})`
    log(r.adId, status)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})

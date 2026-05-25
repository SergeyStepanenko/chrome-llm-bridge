#!/usr/bin/env node
import http from "http"

const HOST = process.env.LLM_BRIDGE_HOST || "127.0.0.1"
const PORT = Number(process.env.LLM_BRIDGE_PORT || 8765)
const MAX_PRICE = 1500
const PAUSE_BETWEEN_ADS_MS = 5000

const CONTACT_NAME = "Sergei"
const CONTACT_PHONE = "655245652"
const CONTACT_MESSAGE = `Hola! He visto tu anuncio y me interesa mucho. Busco alquiler de larga duración (contrato anual). Puedo aportar documentación (residencia legal y financiera). ¿Sigue disponible? ¿Podemos coordinar una visita? Gracias!`

// Pre-collected listings ≤ 1500€ from all 13 pages (2026-02-26)
const HARDCODED_LISTINGS = [
  { id: "2622004379467", price: 1500, url: "https://english.habitaclia.com/rent-flat-nucli_urba-argentona-i2622004379467.htm" },
  { id: "12617004382926", price: 1200, url: "https://english.habitaclia.com/rent-flat-in-caldes_d_estrac-i12617004382926.htm" },
  { id: "2904004019982", price: 1300, url: "https://english.habitaclia.com/rent-penthouse-mont_del_58_centre-vilassar_de_mar-i2904004019982.htm" },
  { id: "2904004020063", price: 1400, url: "https://english.habitaclia.com/rent-semi_detached_house-centre-masnou-i2904004020063.htm" },
  { id: "55551000004162", price: 1150, url: "https://english.habitaclia.com/rent-flat-eixample-mataro-i55551000004162.htm" },
  { id: "55551000001590", price: 1040, url: "https://english.habitaclia.com/rent-flat-havana-mataro-i55551000001590.htm" },
  { id: "12557004376958", price: 1100, url: "https://english.habitaclia.com/rent-ground_floor-vista_alegre-mataro-i12557004376958.htm" },
  { id: "55551000002359", price: 980, url: "https://english.habitaclia.com/rent-flat-in-caldes_d_estrac-i55551000002359.htm" },
  { id: "55551000003765", price: 1250, url: "https://english.habitaclia.com/rent-flat-el_palau_escorxador-mataro-i55551000003765.htm" },
  { id: "44863000000271", price: 1500, url: "https://english.habitaclia.com/rent-flat-urbanitzacions-sant_pol_de_mar-i44863000000271.htm" },
  { id: "26883000000505", price: 1500, url: "https://english.habitaclia.com/rent-house-centre_nucli_antic-premia_de_mar-i26883000000505.htm" },
  { id: "1190004437085", price: 1500, url: "https://english.habitaclia.com/rent-duplex-in-calella-i1190004437085.htm" },
  { id: "681004423489", price: 1000, url: "https://english.habitaclia.com/rent-flat-street_sant_valenti_45_pla_d_en_boet-mataro-i681004423489.htm" },
  { id: "12504003873769", price: 1480, url: "https://english.habitaclia.com/rent-flat-centre-sant_andreu_de_llavaneres-i12504003873769.htm" },
  { id: "48240000000071", price: 1200, url: "https://english.habitaclia.com/rent-flat-centre-sant_pol_de_mar-i48240000000071.htm" },
  { id: "3226003818169", price: 1300, url: "https://english.habitaclia.com/rent-flat-can_more_santa_anna_can_feliu_de_merola-pineda_de_mar-i3226003818169.htm" },
  { id: "26393000000903", price: 1470, url: "https://english.habitaclia.com/rent-flat-in-alella-i26393000000903.htm" },
  { id: "39611000003243", price: 1395, url: "https://english.habitaclia.com/rent-house-centre-sant_andreu_de_llavaneres-i39611000003243.htm" },
  { id: "55551000004270", price: 1000, url: "https://english.habitaclia.com/rent-flat-centre-masnou-i55551000004270.htm" },
  { id: "9564004392381", price: 1300, url: "https://english.habitaclia.com/rent-flat-sant_vicens_platja-sant_vicens_de_montalt-i9564004392381.htm" },
  { id: "2030002747211", price: 1400, url: "https://english.habitaclia.com/rent-flat-street_de_minerva_7_centre-sant_andreu_de_llavaneres-i2030002747211.htm" },
  { id: "14975000000427", price: 950, url: "https://english.habitaclia.com/rent-ground_floor-in-alella-i14975000000427.htm" },
  { id: "21962000000941", price: 1350, url: "https://english.habitaclia.com/rent-flat-centre-sant_andreu_de_llavaneres-i21962000000941.htm" },
  { id: "1735004434058", price: 980, url: "https://english.habitaclia.com/rent-duplex-tordera-tordera-i1735004434058.htm" },
  { id: "12748002690980", price: 1190, url: "https://english.habitaclia.com/rent-flat-centre-mataro-i12748002690980.htm" },
  { id: "739004431765", price: 1269, url: "https://english.habitaclia.com/rent-flat-via_europa_parc_central-mataro-i739004431765.htm" },
  { id: "5781004385164", price: 850, url: "https://english.habitaclia.com/rent-flat-centre_nucli_antic-premia_de_mar-i5781004385164.htm" },
  { id: "4151003983540", price: 1500, url: "https://english.habitaclia.com/rent-duplex-nucli_urba-argentona-i4151003983540.htm" },
  { id: "33272000000099", price: 1100, url: "https://english.habitaclia.com/rent-ground_floor-centre-masnou-i33272000000099.htm" },
  { id: "668003578476", price: 1247, url: "https://english.habitaclia.com/rent-flat-victoria_les_villes_canyadell-arenys_de_mar-i668003578476.htm" },
  { id: "15471000069683", price: 1450, url: "https://english.habitaclia.com/rent-flat-muralla_de_la_preso_no_1_1_1_centre-mataro-i15471000069683.htm" },
  { id: "11169004427304", price: 1170, url: "https://english.habitaclia.com/rent-flat-centre-mataro-i11169004427304.htm" },
  { id: "36555000000775", price: 1000, url: "https://english.habitaclia.com/rent-ground_floor-tordera-tordera-i36555000000775.htm" },
  { id: "18943003952373", price: 1300, url: "https://english.habitaclia.com/rent-apartment-sant_vicens_platja-sant_vicens_de_montalt-i18943003952373.htm" },
  { id: "43365000000057", price: 1200, url: "https://english.habitaclia.com/rent-semi_detached_house-sant_vicens_centre-sant_vicens_de_montalt-i43365000000057.htm" },
  { id: "13685000000628", price: 1144, url: "https://english.habitaclia.com/rent-flat-in-canet_de_mar-i13685000000628.htm" },
  { id: "1627004327762", price: 1500, url: "https://english.habitaclia.com/rent-house-in-arenys_de_munt-i1627004327762.htm" },
  { id: "44863000000125", price: 550, url: "https://english.habitaclia.com/rent-flat-centre-pineda_de_mar-i44863000000125.htm" },
  { id: "16113004437640", price: 900, url: "https://english.habitaclia.com/rent-flat-centre-pineda_de_mar-i16113004437640.htm" },
  { id: "55551000002063", price: 1000, url: "https://english.habitaclia.com/rent-flat-in-calella-i55551000002063.htm" },
  { id: "500004522166", price: 700, url: "https://english.habitaclia.com/rent-country_house-cami_de_can_vidal_51-sant_iscle_de_vallalta-i500004522166.htm" },
  { id: "37163000000172", price: 1060, url: "https://english.habitaclia.com/rent-flat-centre-arenys_de_mar-i37163000000172.htm" },
  { id: "36555000000780", price: 650, url: "https://english.habitaclia.com/rent-flat-sant_pere-tordera-i36555000000780.htm" },
  { id: "500006015795", price: 1350, url: "https://english.habitaclia.com/rent-flat-street_del_rosari_54_centre-vilassar_de_mar-i500006015795.htm" },
  { id: "55551000004009", price: 1450, url: "https://english.habitaclia.com/rent-flat-centre-mataro-i55551000004009.htm" },
  { id: "37163000000174", price: 1200, url: "https://english.habitaclia.com/rent-apartment-santa_maria_balis_can_riera_can_jordi-sant_vicens_de_montalt-i37163000000174.htm" },
  { id: "500006040329", price: 1500, url: "https://english.habitaclia.com/rent-duplex-street_santa_maria_29-tiana-i500006040329.htm" },
  { id: "500006033095", price: 850, url: "https://english.habitaclia.com/rent-penthouse-street_nou_2_canyamars-dosrius-i500006033095.htm" },
  { id: "500006028296", price: 900, url: "https://english.habitaclia.com/rent-apartment-eivissa_0-malgrat_de_mar-i500006028296.htm" },
  { id: "500006038912", price: 1000, url: "https://english.habitaclia.com/rent-semi_detached_house-orsavinya_44_centre-pineda_de_mar-i500006038912.htm" },
  { id: "500006041171", price: 926, url: "https://english.habitaclia.com/rent-flat-miguel_hernandez_1_sant_pere-tordera-i500006041171.htm" },
  { id: "9963002754391", price: 890, url: "https://english.habitaclia.com/rent-duplex-in-canet_de_mar-i9963002754391.htm" },
  { id: "39000000000135", price: 790, url: "https://english.habitaclia.com/rent-flat-tordera-tordera-i39000000000135.htm" },
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

function log(id, ...args) {
  const prefix = id ? `[${id}]` : "[main]"
  console.log(prefix, ...args)
}

async function fetchPageHtml(url) {
  const result = await sendCommand({
    type: "page.fetch",
    url,
    maxChars: 200000,
  })
  return result.text || ""
}

function parseListings(html) {
  const listings = []
  const blocks = html.split('<article class="list-item-price"')

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]
    const priceMatch = block.match(/itemprop="price"[^>]*>([\d.]+)\s*€/)
    if (!priceMatch) continue

    const price = parseInt(priceMatch[1].replace(/\./g, ""), 10)

    const prevBlock = blocks[i - 1]
    const linkMatches = [
      ...prevBlock.matchAll(
        /href="((?:https?:)?\/\/english\.habitaclia\.com\/rent-[^"]+?-i(\d+)\.htm[^"]*)"/g
      ),
    ]
    if (!linkMatches.length) continue

    const lastMatch = linkMatches[linkMatches.length - 1]
    let url = lastMatch[1]
    const adId = lastMatch[2]

    // Fix URL: ensure proper format
    if (url.startsWith("//")) {
      url = "https:" + url
    }
    // Remove query params for cleaner navigation
    url = url.split("?")[0]
    // Decode HTML entities
    url = url.replace(/&amp;/g, "&")

    listings.push({ id: adId, url, price })
  }

  return listings
}

async function collectListings() {
  const all = []

  for (const pageUrl of LIST_PAGES) {
    log(null, `Scanning: ${pageUrl}`)
    const html = await fetchPageHtml(pageUrl)

    if (html.length < 1000) {
      log(null, `  WARNING: short response (${html.length} chars), skipping`)
      continue
    }

    const listings = parseListings(html)
    const cheap = listings.filter((l) => l.price <= MAX_PRICE)
    log(null, `  Found ${listings.length} listings, ${cheap.length} ≤ ${MAX_PRICE}€`)
    all.push(...cheap)
  }

  // Deduplicate by ID
  const seen = new Set()
  return all.filter((l) => {
    if (seen.has(l.id)) return false
    seen.add(l.id)
    return true
  })
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

  await sleep(3000)
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

async function clickElement(selector) {
  const result = await sendCommand({ type: "dom.click", selector })
  if (!result.ok) {
    throw new Error(`Failed to click ${selector}: ${result.error}`)
  }
}

async function getPageText() {
  const result = await sendCommand({ type: "dom.text" })
  if (!result.ok) {
    throw new Error(`Failed to get page text: ${result.error}`)
  }
  return result.result?.text ?? ""
}

async function processListing(listing) {
  log(listing.id, `Opening ${listing.url} (${listing.price}€)`)
  await navigateTo(listing.url)

  const pageText = await getPageText()

  // Check for already-contacted indicator
  if (
    pageText.includes("Ya has contactado") ||
    pageText.includes("You have already contacted") ||
    pageText.includes("Solicitud enviada")
  ) {
    log(listing.id, "Already contacted — skipping.")
    return { id: listing.id, price: listing.price, sent: false, reason: "already contacted" }
  }

  // Check contact form exists
  const hasForm = await elementExists("#solicitudesForm")
  if (!hasForm) {
    log(listing.id, "No contact form found — skipping.")
    return { id: listing.id, price: listing.price, sent: false, reason: "no form" }
  }

  // Fill name
  log(listing.id, "Filling contact form...")
  if (await elementExists("#Nombre")) {
    await typeText("#Nombre", CONTACT_NAME)
  }

  // Fill phone
  if (await elementExists("#Telefono")) {
    await typeText("#Telefono", CONTACT_PHONE)
  }

  // Fill message
  if (await elementExists("#Mensaje")) {
    await typeText("#Mensaje", CONTACT_MESSAGE)
  }

  await sleep(500)

  // Check the legal/privacy checkbox
  // Must set value="1" via dom.type first, then click to toggle checked state
  if (await elementExists("#idCheckLegalContactar")) {
    await typeText("#idCheckLegalContactar", "1")
    await clickElement("#idCheckLegalContactar")
    log(listing.id, "Checked legal checkbox (value=1)")
  }

  await sleep(500)

  // Submit
  if (await elementExists("#submitSolicitudes")) {
    await clickElement("#submitSolicitudes")
    log(listing.id, "Clicked submit")
  } else {
    log(listing.id, "Submit button not found — skipping.")
    return { id: listing.id, price: listing.price, sent: false, reason: "no submit button" }
  }

  // Wait for response
  await sleep(3000)

  // Check the response area specifically
  const responseResult = await sendCommand({
    type: "dom.text",
    selector: "#respuestaSolicitud",
  })
  const responseText = responseResult.result?.text ?? ""

  if (responseText.includes("Contact sent") || responseText.includes("Solicitud enviada")) {
    log(listing.id, "Message sent successfully!")
    return { id: listing.id, price: listing.price, sent: true }
  }

  const afterText = await getPageText()

  // Check for errors
  if (afterText.includes("captcha") || afterText.includes("CAPTCHA")) {
    log(listing.id, "CAPTCHA detected! Please solve manually, then press Enter.")
    await waitForUserInput()
    await sleep(2000)
    return { id: listing.id, price: listing.price, sent: true, reason: "captcha - manual" }
  }

  // Check for other success indicators in full page
  if (
    afterText.includes("Contact sent") ||
    afterText.includes("Solicitud enviada") ||
    afterText.includes("contact has been sent") ||
    afterText.includes("Gracias por contactar")
  ) {
    log(listing.id, "Message sent successfully!")
    return { id: listing.id, price: listing.price, sent: true }
  }

  log(listing.id, "Could not confirm send. Check manually.")
  return { id: listing.id, price: listing.price, sent: false, reason: "unconfirmed" }
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
  log(null, "=== Habitaclia Auto-Messenger ===")
  log(null, `Bridge: http://${HOST}:${PORT}`)
  log(null, `Max price: ${MAX_PRICE}€`)
  log(null, "")

  // Verify bridge
  try {
    const health = await sendCommand({ type: "ping" })
    log(null, "Bridge connected:", health.type === "pong" ? "OK" : "unexpected response")
  } catch {
    log(null, `ERROR: Cannot connect to bridge at http://${HOST}:${PORT}`)
    process.exit(1)
  }

  // Remember the active tab
  await sendCommand({ type: "tab.remember" })
  log(null, "Remembered active tab")
  log(null, "")

  // Use pre-collected listings
  const listings = HARDCODED_LISTINGS
  log(null, `Using ${listings.length} pre-collected listings ≤ ${MAX_PRICE}€`)

  if (listings.length === 0) {
    log(null, "No listings to process. Exiting.")
    process.exit(0)
  }

  for (const l of listings) {
    log(null, `  ${l.id}: ${l.price}€ — ${l.url}`)
  }
  log(null, "")

  // Phase 2: Process each listing
  log(null, "Phase 2: Sending messages...")
  log(null, "")

  const results = []

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    log(null, `--- [${i + 1}/${listings.length}] ---`)

    try {
      const result = await processListing(listing)
      results.push(result)
    } catch (error) {
      log(listing.id, `ERROR: ${error.message}`)
      results.push({ id: listing.id, price: listing.price, sent: false, reason: error.message })
    }

    if (i < listings.length - 1) {
      log(null, `Waiting ${PAUSE_BETWEEN_ADS_MS / 1000}s before next...`)
      await sleep(PAUSE_BETWEEN_ADS_MS)
    }
  }

  // Summary
  log(null, "")
  log(null, "=== RESULTS ===")

  const sent = results.filter((r) => r.sent)
  const skipped = results.filter((r) => !r.sent)

  log(null, `Sent: ${sent.length}, Skipped: ${skipped.length}`)
  log(null, "")

  for (const r of results) {
    const status = r.sent ? "SENT" : `SKIPPED (${r.reason})`
    log(r.id, `${r.price}€ — ${status}`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})

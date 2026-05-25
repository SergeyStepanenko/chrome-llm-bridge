function findElement(selector, index) {
  if (!selector) {
    return null
  }

  if (typeof index === "number") {
    const nodes = document.querySelectorAll(selector)
    return nodes[index] || null
  }

  return document.querySelector(selector)
}

function setInputValue(element, value) {
  element.focus()
  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
  element.dispatchEvent(new Event("change", { bubbles: true }))
}

function makeResponse(ok, result, error) {
  if (ok) {
    return { ok: true, result }
  }

  return { ok: false, error }
}

function limitText(value, maxChars) {
  if (typeof value !== "string") {
    return ""
  }

  if (typeof maxChars !== "number" || maxChars < 0) {
    return value
  }

  return value.length > maxChars ? value.slice(0, maxChars) : value
}

function limitArray(items, maxItems) {
  if (!Array.isArray(items)) {
    return []
  }

  if (typeof maxItems !== "number" || maxItems < 0) {
    return items
  }

  return items.slice(0, maxItems)
}

function buildSnapshot(options) {
  const maxHtmlChars = options?.maxHtmlChars ?? 200000
  const maxTextChars = options?.maxTextChars ?? 200000
  const maxInlineScriptChars = options?.maxInlineScriptChars ?? 20000
  const maxInlineStyleChars = options?.maxInlineStyleChars ?? 20000
  const maxItems = options?.maxItems ?? 2000
  const maxLinkTextChars = options?.maxLinkTextChars ?? 200

  const html = limitText(
    document.documentElement?.outerHTML ?? "",
    maxHtmlChars
  )
  const text = limitText(document.body?.innerText ?? "", maxTextChars)

  const meta = limitArray(
    Array.from(document.querySelectorAll("meta")).map((tag) => ({
      name: tag.getAttribute("name"),
      property: tag.getAttribute("property"),
      charset: tag.getAttribute("charset"),
      content: tag.getAttribute("content"),
    })),
    maxItems
  )

  const links = limitArray(
    Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
      href: anchor.href,
      text: limitText(anchor.innerText?.trim() ?? "", maxLinkTextChars),
      rel: anchor.rel || null,
      target: anchor.target || null,
    })),
    maxItems
  )

  const stylesheets = limitArray(
    Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]')).map(
      (link) => ({
        href: link.href,
        media: link.media || null,
        title: link.title || null,
      })
    ),
    maxItems
  )

  const styleTags = limitArray(
    Array.from(document.querySelectorAll("style")).map((style) => ({
      text: limitText(style.textContent ?? "", maxInlineStyleChars),
    })),
    maxItems
  )

  const scripts = []
  const inlineScripts = []

  Array.from(document.querySelectorAll("script")).forEach((script) => {
    const src = script.src || null
    scripts.push({
      src,
      type: script.type || null,
      async: Boolean(script.async),
      defer: Boolean(script.defer),
      nomodule: Boolean(script.noModule),
    })

    if (!src) {
      inlineScripts.push({
        text: limitText(script.textContent ?? "", maxInlineScriptChars),
      })
    }
  })

  const images = limitArray(
    Array.from(document.querySelectorAll("img")).map((img) => ({
      src: img.currentSrc || img.src || null,
      alt: img.alt || null,
      width: img.naturalWidth || null,
      height: img.naturalHeight || null,
    })),
    maxItems
  )

  const media = limitArray(
    Array.from(document.querySelectorAll("video, audio, source")).map(
      (node) => ({
        tag: node.tagName.toLowerCase(),
        src: node.currentSrc || node.src || null,
        type: node.type || null,
      })
    ),
    maxItems
  )

  const assetLinks = limitArray(
    Array.from(document.querySelectorAll("link[href]")).map((link) => ({
      rel: link.rel || null,
      href: link.href,
      as: link.as || null,
      type: link.type || null,
    })),
    maxItems
  )

  const resources = limitArray(
    performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      })),
    maxItems
  )

  return {
    url: window.location.href,
    title: document.title || "",
    html,
    text,
    meta,
    links,
    stylesheets,
    styleTags,
    scripts: limitArray(scripts, maxItems),
    inlineScripts: limitArray(inlineScripts, maxItems),
    images,
    media,
    assetLinks,
    resources,
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || typeof message !== "object") {
      sendResponse(makeResponse(false, null, "Invalid message"))
      return false
    }

    const { type } = message

    if (!type || typeof type !== "string") {
      sendResponse(makeResponse(false, null, "Missing message type"))
      return false
    }

    switch (type) {
      case "dom.click": {
        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        element.click()
        sendResponse(makeResponse(true, { clicked: true }))
        return false
      }

      case "dom.type": {
        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        setInputValue(element, String(message.text ?? ""))
        sendResponse(makeResponse(true, { typed: true }))
        return false
      }

      case "dom.focus": {
        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        element.focus()
        sendResponse(makeResponse(true, { focused: true }))
        return false
      }

      case "dom.exists": {
        const element = findElement(message.selector, message.index)
        sendResponse(makeResponse(true, { exists: Boolean(element) }))
        return false
      }

      case "dom.text": {
        if (!message.selector) {
          sendResponse(makeResponse(true, { text: document.body?.innerText ?? "" }))
          return false
        }

        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        sendResponse(makeResponse(true, { text: element.textContent ?? "" }))
        return false
      }

      case "dom.textAll": {
        if (!message.selector) {
          sendResponse(makeResponse(false, null, "Missing selector"))
          return false
        }

        const nodes = Array.from(document.querySelectorAll(message.selector))
        const texts = nodes.map((node) => (node.textContent ?? "").trim())
        sendResponse(makeResponse(true, { texts }))
        return false
      }

      case "dom.html": {
        if (!message.selector) {
          sendResponse(makeResponse(true, { html: document.documentElement?.outerHTML ?? "" }))
          return false
        }

        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        sendResponse(makeResponse(true, { html: element.innerHTML ?? "" }))
        return false
      }

      case "dom.attr": {
        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        if (!message.name) {
          sendResponse(makeResponse(false, null, "Missing attribute name"))
          return false
        }

        sendResponse(makeResponse(true, { value: element.getAttribute(message.name) }))
        return false
      }

      case "dom.value": {
        const element = findElement(message.selector, message.index)

        if (!element) {
          sendResponse(makeResponse(false, null, "Element not found"))
          return false
        }

        sendResponse(makeResponse(true, { value: element.value ?? "" }))
        return false
      }

      case "dom.scrollTo": {
        const x = Number(message.x ?? 0)
        const y = Number(message.y ?? 0)
        window.scrollTo({ left: x, top: y, behavior: "auto" })
        sendResponse(makeResponse(true, { scrolled: true }))
        return false
      }

      case "dom.scrollBy": {
        const x = Number(message.x ?? 0)
        const y = Number(message.y ?? 0)
        window.scrollBy({ left: x, top: y, behavior: "auto" })
        sendResponse(makeResponse(true, { scrolled: true }))
        return false
      }

      case "page.snapshot": {
        const snapshot = buildSnapshot(message.options ?? message)
        sendResponse(makeResponse(true, snapshot))
        return false
      }

      case "page.resources": {
        const maxItems = message?.maxItems ?? 2000
        const resources = limitArray(
          performance
            .getEntriesByType("resource")
            .map((entry) => ({
              name: entry.name,
              initiatorType: entry.initiatorType,
              duration: entry.duration,
              transferSize: entry.transferSize,
              encodedBodySize: entry.encodedBodySize,
              decodedBodySize: entry.decodedBodySize,
            })),
          maxItems
        )
        sendResponse(makeResponse(true, { resources }))
        return false
      }

      default: {
        sendResponse(makeResponse(false, null, `Unknown command: ${type}`))
        return false
      }
    }
  } catch (error) {
    sendResponse(makeResponse(false, null, error?.message ?? "Unhandled error"))
    return false
  }
})

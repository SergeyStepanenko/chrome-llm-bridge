const NATIVE_HOST_NAME = "com.stepanenko.llm_bridge"

let nativePort = null
let reconnectTimer = null
let rememberedTabId = undefined

function connectNative() {
  if (nativePort) {
    return
  }

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME)
  } catch (error) {
    console.error("Native host connection failed:", error)
    scheduleReconnect()
    return
  }

  nativePort.onMessage.addListener(handleNativeMessage)
  nativePort.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message
    console.warn("Native host disconnected:", reason || "unknown reason")
    nativePort = null
    scheduleReconnect()
  })
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectNative()
  }, 1000)
}

function sendToNative(message) {
  if (!nativePort) {
    connectNative()
  }

  if (!nativePort) {
    return
  }

  nativePort.postMessage(message)
}

function getStorage() {
  if (chrome.storage?.session) {
    return chrome.storage.session
  }

  return chrome.storage?.local ?? null
}

async function loadRememberedTabId() {
  if (rememberedTabId !== undefined) {
    return
  }

  const storage = getStorage()

  if (!storage) {
    rememberedTabId = null
    return
  }

  const data = await storage.get({ rememberedTabId: null })
  rememberedTabId =
    typeof data.rememberedTabId === "number" ? data.rememberedTabId : null
}

async function setRememberedTabId(tabId) {
  rememberedTabId = tabId
  const storage = getStorage()

  if (storage) {
    await storage.set({ rememberedTabId: tabId })
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    })
    return true
  } catch (error) {
    console.warn("Failed to inject content script:", error)
    return false
  }
}

function sendMessageToTab(tabId, frameId, request) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, request, { frameId }, (response) => {
      const error = chrome.runtime.lastError

      if (error) {
        reject(error)
        return
      }

      resolve(response)
    })
  })
}

async function getTargetTabId(request) {
  if (request.tabId) {
    return request.tabId
  }

  await loadRememberedTabId()

  if (typeof rememberedTabId === "number") {
    return rememberedTabId
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0]?.id ?? null
}

async function dispatchToTab(request) {
  const tabId = await getTargetTabId(request)
  const frameId = typeof request.frameId === "number" ? request.frameId : 0

  if (!tabId) {
    sendToNative({
      id: request.id ?? null,
      ok: false,
      error: "No active tab found",
    })
    return
  }

  try {
    const response = await sendMessageToTab(tabId, frameId, request)
    sendToNative({
      id: request.id ?? null,
      tabId,
      ...(response || { ok: false, error: "Empty response from content script" }),
    })
  } catch (error) {
    const message = error?.message || "Failed to send message to tab"

    if (message.includes("Receiving end does not exist")) {
      const injected = await ensureContentScript(tabId)

      if (injected) {
        try {
          const response = await sendMessageToTab(tabId, frameId, request)
          sendToNative({
            id: request.id ?? null,
            tabId,
            ...(response || {
              ok: false,
              error: "Empty response from content script",
            }),
          })
          return
        } catch (retryError) {
          const retryMessage =
            retryError?.message || "Failed to send message to tab"
          sendToNative({
            id: request.id ?? null,
            ok: false,
            error: retryMessage,
          })
          return
        }
      }
    }

    sendToNative({
      id: request.id ?? null,
      ok: false,
      error: message,
    })
  }
}

async function dispatchFetchInPage(request) {
  const tabId = await getTargetTabId(request)

  if (!tabId) {
    sendToNative({
      id: request.id ?? null,
      ok: false,
      error: "No active tab found",
    })
    return
  }

  if (!request.url) {
    sendToNative({
      id: request.id ?? null,
      ok: false,
      error: "Missing url for page.fetch",
    })
    return
  }

  chrome.scripting.executeScript(
    {
      target: { tabId },
      world: "MAIN",
      args: [
        request.url,
        request.options ?? {},
        request.maxChars ?? 200000,
        request.timeoutMs ?? 15000,
      ],
      func: async (url, options, maxChars, timeoutMs) => {
        const normalizedMaxChars =
          typeof maxChars === "number" && maxChars >= 0 ? maxChars : 200000
        const normalizedTimeout =
          typeof timeoutMs === "number" && timeoutMs >= 0 ? timeoutMs : 15000

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), normalizedTimeout)

        try {
          const response = await fetch(url, {
            ...(options || {}),
            credentials: "include",
            signal: controller.signal,
          })
          const text = await response.text()
          const truncated = text.length > normalizedMaxChars
          const limitedText = truncated ? text.slice(0, normalizedMaxChars) : text
          const headers = []
          response.headers.forEach((value, key) => {
            headers.push([key, value])
          })

          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            headers,
            text: limitedText,
            truncated,
          }
        } catch (error) {
          return {
            ok: false,
            error: error?.message ?? "Fetch failed",
          }
        } finally {
          clearTimeout(timer)
        }
      },
    },
    (results) => {
      const error = chrome.runtime.lastError

      if (error) {
        sendToNative({
          id: request.id ?? null,
          ok: false,
          error: error.message || "Failed to execute page.fetch",
        })
        return
      }

      const result = results?.[0]?.result

      sendToNative({
        id: request.id ?? null,
        tabId,
        ...(result || { ok: false, error: "No result from page.fetch" }),
      })
    }
  )
}

function handleNativeMessage(message) {
  if (!message || typeof message !== "object") {
    return
  }

  if (message.type === "ping") {
    sendToNative({ id: message.id ?? null, type: "pong" })
    return
  }

  if (message.type === "tab.remember") {
    rememberActiveTab(message)
    return
  }

  if (message.type === "tab.use") {
    useTabById(message)
    return
  }

  if (message.type === "tab.clear") {
    clearRememberedTab(message)
    return
  }

  if (message.type === "tab.info") {
    sendTabInfo(message)
    return
  }

  if (message.type === "tab.navigate") {
    navigateTab(message)
    return
  }

  if (message.type === "tab.waitForLoad") {
    waitForTabLoad(message)
    return
  }

  if (typeof message.type === "string") {
    if (message.type === "page.fetch") {
      dispatchFetchInPage(message)
      return
    }

    if (message.type.startsWith("dom.") || message.type.startsWith("page.")) {
      dispatchToTab(message)
      return
    }
  }

  chrome.runtime.sendMessage({
    ...message,
    fromNative: true,
  })
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message !== "object") {
    return
  }

  if (message.forwardToNative) {
    sendToNative({
      ...message,
      tabId: sender?.tab?.id ?? message.tabId ?? null,
    })
  }
})

const KEEP_ALIVE_ALARM = "llm-bridge-keepalive"

chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.4 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEP_ALIVE_ALARM) {
    return
  }

  if (!nativePort) {
    connectNative()
  }
})

async function rememberActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  const tabId = tabs[0]?.id ?? null

  if (!tabId) {
    sendToNative({
      id: message.id ?? null,
      ok: false,
      error: "No active tab found to remember",
    })
    return
  }

  await setRememberedTabId(tabId)
  await ensureContentScript(tabId)

  sendToNative({
    id: message.id ?? null,
    ok: true,
    rememberedTabId: tabId,
  })
}

async function useTabById(message) {
  const tabId = typeof message.tabId === "number" ? message.tabId : null

  if (!tabId) {
    sendToNative({
      id: message.id ?? null,
      ok: false,
      error: "Missing tabId",
    })
    return
  }

  await setRememberedTabId(tabId)
  await ensureContentScript(tabId)

  sendToNative({
    id: message.id ?? null,
    ok: true,
    rememberedTabId: tabId,
  })
}

async function clearRememberedTab(message) {
  await setRememberedTabId(null)
  sendToNative({
    id: message.id ?? null,
    ok: true,
    rememberedTabId: null,
  })
}

async function sendTabInfo(message) {
  await loadRememberedTabId()
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  sendToNative({
    id: message.id ?? null,
    ok: true,
    rememberedTabId,
    activeTabId: tabs[0]?.id ?? null,
  })
}

async function navigateTab(message) {
  const tabId = await getTargetTabId(message)

  if (!tabId) {
    sendToNative({ id: message.id ?? null, ok: false, error: "No active tab found" })
    return
  }

  if (!message.url) {
    sendToNative({ id: message.id ?? null, ok: false, error: "Missing url" })
    return
  }

  const timeoutMs = typeof message.timeoutMs === "number" ? message.timeoutMs : 30000

  try {
    const loaded = new Promise((resolve, reject) => {
      let started = false
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener)
        reject(new Error("Navigation timeout"))
      }, timeoutMs)

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId !== tabId) return
        if (changeInfo.status === "loading") started = true
        if (started && changeInfo.status === "complete") {
          clearTimeout(timer)
          chrome.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      }

      chrome.tabs.onUpdated.addListener(listener)
    })

    await chrome.tabs.update(tabId, { url: message.url })
    await loaded

    sendToNative({ id: message.id ?? null, ok: true, tabId, url: message.url })
  } catch (error) {
    sendToNative({ id: message.id ?? null, ok: false, error: error?.message ?? "Navigation failed" })
  }
}

async function waitForTabLoad(message) {
  const tabId = await getTargetTabId(message)

  if (!tabId) {
    sendToNative({ id: message.id ?? null, ok: false, error: "No active tab found" })
    return
  }

  const timeoutMs = typeof message.timeoutMs === "number" ? message.timeoutMs : 30000

  try {
    const tab = await chrome.tabs.get(tabId)

    if (tab.status === "complete") {
      sendToNative({ id: message.id ?? null, ok: true, tabId, status: "complete" })
      return
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener)
        reject(new Error("Wait timeout"))
      }, timeoutMs)

      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          clearTimeout(timer)
          chrome.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      }

      chrome.tabs.onUpdated.addListener(listener)
    })

    sendToNative({ id: message.id ?? null, ok: true, tabId, status: "complete" })
  } catch (error) {
    sendToNative({ id: message.id ?? null, ok: false, error: error?.message ?? "Wait failed" })
  }
}

connectNative()

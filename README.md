# LLM Bridge — Chrome Canary

Chrome extension + native messaging host. Позволяет LLM-агенту управлять вкладками Chrome Canary через HTTP API на `localhost:8765`.

## Архитектура

```
CLI/Agent (curl :8765)
    ↓ HTTP POST /command
host.js (Node, native messaging host)
    ↓ stdio (4-byte length prefix + JSON)
background.js (MV3 service worker)
    ↓ chrome.tabs.sendMessage
content.js (DOM-команды в целевой вкладке)
```

## Установка

1. Открыть Chrome Canary → `chrome://extensions` → Developer mode → Load unpacked → эта папка
2. Скопировать **Extension ID**
3. Установить native host manifest:

```bash
bash native-host/install-macos.sh <EXTENSION_ID>
```

4. Перезагрузить расширение в `chrome://extensions`

## Проверка

```bash
curl -s http://127.0.0.1:8765/health
```

Диагностика:

```bash
bash native-host/doctor.sh [EXTENSION_ID]
```

## Команды

### DOM

| Команда | Описание |
|---------|----------|
| `dom.click` | Клик по элементу |
| `dom.type` | Ввод текста |
| `dom.focus` | Фокус на элемент |
| `dom.text` | Текст элемента |
| `dom.textAll` | Текст всех matching элементов |
| `dom.html` | HTML элемента |
| `dom.attr` | Атрибут элемента |
| `dom.value` | Значение input |
| `dom.exists` | Проверка существования |
| `dom.scrollTo` | Скролл к позиции |
| `dom.scrollBy` | Скролл на offset |

### Page

| Команда | Описание |
|---------|----------|
| `page.snapshot` | Полный снимок страницы |
| `page.resources` | Resource Timing API entries |
| `page.fetch` | Fetch URL с cookies страницы |

### Tab

| Команда | Описание |
|---------|----------|
| `tab.remember` | Запомнить активную вкладку |
| `tab.use` | Переключиться на вкладку по ID |
| `tab.clear` | Сбросить запомненную вкладку |
| `tab.info` | Информация о текущей вкладке |
| `tab.navigate` | Навигация по URL |
| `tab.waitForLoad` | Ждать загрузки страницы |

## Переменные окружения

- `LLM_BRIDGE_HOST` — default `127.0.0.1`
- `LLM_BRIDGE_PORT` — default `8765`
- `LLM_BRIDGE_TIMEOUT_MS` — default `15000`

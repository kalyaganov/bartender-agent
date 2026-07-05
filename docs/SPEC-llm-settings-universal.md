# SPEC — Универсальные LLM-настройки для OpenAI-совместимых провайдеров

> Исправление багов и расширение адаптера `OpenAIProvider` для корректной работы с максимально широким кругом OpenAI-compat эндпоинтов (OpenRouter, DeepSeek, Groq, xAI, Together, локальные endpoint'ы и др.).

- [SPEC-primitive-setup.md](./SPEC-primitive-setup.md) — архитектура `Preferences` / `createProvider`
- [SPEC-provider-layer.md](./SPEC-provider-layer.md) — контракт `StreamPart` / `LLMProvider` (исторический)
- [BACKLOG.md](./BACKLOG.md) — техдолг

---

## Проблема

Адаптер `OpenAIProvider` (`src/agent/providers/openai.ts`) содержит баги и пробелы, из-за которых часть OpenAI-совместимых провайдеров не работают или работают некорректно. Пользовательский тумблер `thinking` не оказывает влияния на API-запрос.

Конкретные дефекты, обнаруженные при аудите цепочки **SetupScreen → Preferences → createProvider → OpenAIProvider.streamTurn → OpenAI SDK**:

1. **`thinking` toggle — no-op.** `loop.ts` строит `GenerationConfig` с полем `reasoning: {budgetTokens: 2048}`, но `OpenAIProvider.streamTurn` нигде не читает `opts.generation?.reasoning` и не отправляет reasoning-параметры в API. Тумблер влияет только на `capabilities.supportsReasoning` (которое нигде не проверяется).

2. **`temperature` несовместим с reasoning-моделями.** Адаптер всегда отправляет `temperature: 0.8`. OpenAI o-series (o1, o3, o4-mini), DeepSeek-R1 и другие reasoning-модели режектят этот параметр. Пользователь с reasoning-моделью получает ошибку.

3. **`max_tokens` не универсален.** OpenAI o-series требуют `max_completion_tokens` вместо `max_tokens`. Адаптер всегда шлёт `max_tokens`.

4. **Нет маппинга reasoning-параметров.** Контракт `GenerationConfig.reasoning` имеет `effort` и `budgetTokens`, но разные провайдеры ожидают reasoning в разных полях:
   - OpenRouter: `reasoning: {effort, max_tokens}` на верхнем уровне запроса
   - Некоторые прокси: `thinking: {type: "enabled", budget_tokens: N}`
   - OpenAI o-series: обрабатывают reasoning автоматически (параметр не требуется)

5. **Нет поддержки `extra_headers`.** Некоторые OpenAI-compat эндпоинты требуют дополнительные заголовки (Anthropic: `x-api-key` вместо `Authorization: Bearer`; прокси: `HTTP-Referer`, `X-Title`; кастомные: версионные заголовки).

6. **Нет обработки `object: "error"` в потоке.** OpenAI API может прислать `{object: "error", error: {...}}` внутри SSE-потока при ошибке (например, content filter). Адаптер не ловит такие события.

7. **Поле `reasoning` в дельте дублируется.** Адаптер проверяет и `reasoning_content`, и `reasoning` — но некоторые провайдеры (например, через прокси) могут присылать оба поля или поле с другим именем (`thinking`).

---

## Цели

1. **`thinking` работает.** Тумблер в SetupScreen реально влияет на API-запрос: отправляет reasoning-параметры в формате, совместимом с OpenRouter (де-факто стандарт для прокси).
2. **Совместимость с reasoning-моделями.** Не отправлять `temperature` при включённом thinking; использовать `max_completion_tokens` вместо `max_tokens`.
3. **Поддержка `extra_headers`.** Пользователь может указать произвольные заголовки в `Preferences` / `ProviderConfig`, они пробрасываются в HTTP-запросы OpenAI SDK.
4. **Обработка ошибок в потоке.** Ловить `object: "error"` в SSE-чанках.

---

## Функциональные требования

### FR1. Передача reasoning-параметров в API

- **FR1.1.** При `thinking: true` в `Preferences` адаптер отправляет в API-запрос поле `reasoning` с содержимым:
  ```json
  { "effort": "medium", "max_tokens": 2048 }
  ```
  (OpenRouter-совместимый формат — де-факто стандарт для прокси).
- **FR1.2.** Значение `effort` берётся из `GenerationConfig.reasoning.effort` с fallback `"medium"`.
- **FR1.3.** Значение `max_tokens` берётся из `GenerationConfig.reasoning.budgetTokens`.
- **FR1.4.** При `thinking: false` поле `reasoning` не отправляется.
- **FR1.5.** Если эндпоинт не поддерживает `reasoning` и режектит запрос — пользователь получает читаемую ошибку и может отключить тумблер.

### FR2. Совместимость temperature с reasoning-моделями

- **FR2.1.** При `thinking: true` параметр `temperature` **не отправляется** в API-запрос.
- **FR2.2.** При `thinking: false` `temperature` отправляется как `config.generation.temperature` (0.8).

### FR3. Универсальный max_tokens

- **FR3.1.** При `thinking: true` адаптер отправляет `max_completion_tokens` вместо `max_tokens`.
- **FR3.2.** При `thinking: false` адаптер отправляет `max_tokens`.
- **FR3.3.** Значение в обоих случаях — `config.generation.maxOutputTokens` (4096).

### FR4. Поддержка extra_headers

- **FR4.1.** В интерфейс `Preferences` добавляется опциональное поле `extraHeaders?: Record<string, string>`.
- **FR4.2.** В `ProviderConfig` добавляется опциональное поле `extraHeaders?: Record<string, string>`.
- **FR4.3.** `createProvider` пробрасывает `extraHeaders` в конструктор `OpenAIProvider`.
- **FR4.4.** `OpenAIProvider` передаёт `extraHeaders` в `defaultHeaders` клиента OpenAI SDK (опция `defaultHeaders` в конструкторе `new OpenAI({...})`).
- **FR4.5.** `extraHeaders` сохраняется/загружается через `persistence.ts` в `preferences.json`.

### FR5. Обработка ошибок в SSE-потоке

- **FR5.1.** Адаптер проверяет каждый чанк стрима на наличие `object === "error"`.
- **FR5.2.** При обнаружении ошибки в чанке — выбрасывается `ProviderError` с kind `"badRequest"` (если 4xx) или `"network"` (если 5xx) на основе `error.code` или `error.status` из тела ошибки.
- **FR5.3.** При отсутствии статуса используется kind `"unknown"` с retryable `false`.

---

## Нефункциональные требования

### NFR1. Производительность

- **NFR1.1.** Проверка `object === "error"` на каждый чанк не должна добавлять измеримых накладных расходов (< 0.1 мс на чанк).
- **NFR1.2.** Размер `preferences.json` с `extraHeaders` не должен превышать 2 КБ в типичном случае.

### NFR2. Безопасность

- **NFR2.1.** `extraHeaders` никогда не логируются и не отображаются в UI (могут содержать API-ключи).
- **NFR2.2.** Файл `preferences.json` сохраняется с маской `0o600` (уже реализовано в `persistence.ts`).
- **NFR2.3.** `extraHeaders` не передаются в system prompt и не утекают в историю диалога.

### NFR3. Надёжность

- **NFR3.1.** Если провайдер режектит `reasoning` в теле запроса — ошибка классифицируется как `badRequest` (400) и не ретраится. Пользователь видит fallback-реплику и сообщение об ошибке.
- **NFR3.2.** Если провайдер режектит `max_completion_tokens` (требует `max_tokens`) — ошибка 400, не ретраится.
- **NFR3.3.** `extraHeaders` с ключами, конфликтующими с задаваемыми SDK (`Authorization`, `Content-Type`), не переопределяют SDK-заголовки (OpenAI SDK сам управляет приоритетом).

### NFR4. Тестируемость

- **NFR4.1.** Все функциональные требования покрываются модульными тестами в `src/tests/providers.test.ts`.
- **NFR4.2.** Тесты используют мок SDK (`vi.mock("openai", ...)`) и проверяют тело запроса через `createMock.mock.calls`.
- **NFR4.3.** Добавляются тесты на:
  - reasoning-параметры в теле запроса при `thinking: true`
  - отсутствие `temperature` при `thinking: true`
  - `max_completion_tokens` вместо `max_tokens` при `thinking: true`
  - `extraHeaders` в конструкторе OpenAI
  - обработку `{object: "error"}` в потоке

### NFR5. Документированность

- **NFR5.1.** В README или SetupScreen добавляется подсказка о том, что `thinking` включает OpenRouter-совместимый reasoning (не все эндпоинты поддерживают).
- **NFR5.2.** В комментарии к `reasoning` в `types.ts` указывается, что маппинг — на OpenRouter-формат.

---

## Входит в scope

| Что | Где |
|-----|-----|
| Исправить `OpenAIProvider.streamTurn`: отправка `reasoning` в API | `src/agent/providers/openai.ts:48-62` |
| Условное исключение `temperature` при `thinking: true` | `src/agent/providers/openai.ts:48-62` |
| `max_completion_tokens` вместо `max_tokens` при `thinking: true` | `src/agent/providers/openai.ts:48-62` |
| Добавить `extraHeaders` в `Preferences`, `ProviderConfig`, `OpenAIProvider` | `src/persistence.ts`, `src/agent/providers/index.ts`, `src/agent/providers/openai.ts` |
| Обработка `object: "error"` в SSE-чанках | `src/agent/providers/openai.ts:80-120` |
| Новые тесты в `providers.test.ts` | `src/tests/providers.test.ts` |
| Обновить `createProvider` для проброса `extraHeaders` | `src/agent/providers/index.ts` |

## Не входит в scope

| Что | Почему |
|-----|--------|
| UI для `extraHeaders` в SetupScreen | Отдельная задача — поле редко меняется, правится руками в JSON. Может быть добавлено позже как «расширенные настройки». |
| Поддержка native Anthropic/Google/Groq SDK | Проект сознательно ограничен OpenAI-compat (см. `SPEC-primitive-setup.md`). |
| Автоопределение формата reasoning по эндпоинту | Слишком сложно и хрупко. Используем единый OpenRouter-формат. Если эндпоинт не поддерживает — пользователь отключает тумблер. |
| `frequency_penalty` / `presence_penalty` / `seed` / `response_format` | Не требуются для character-агента. Могут быть добавлены в `GenerationConfig` позже при необходимости. |
| Обработка `thinking` в дельтах (поле `thinking` как альтернатива `reasoning_content`) | Текущая обработка `reasoning_content` + `reasoning` покрывает DeepSeek и большинство прокси. Поле `thinking` в дельтах — редкий случай, не подтверждён на практике. Добавим при появлении баг-репорта. |
| Динамический выбор `max_tokens` vs `max_completion_tokens` на основе `model` name | Слишком хрупко (имена моделей меняются). Используем `thinking` как прокси. |

## Затронутые файлы

| Файл | Изменения |
|------|-----------|
| `src/agent/providers/openai.ts` | Основные правки: reasoning, temperature, max_tokens, error chunk, extraHeaders |
| `src/agent/providers/index.ts` | `ProviderConfig.extraHeaders`, проброс в `OpenAIProvider` |
| `src/agent/providers/types.ts` | Без изменений (контракт `GenerationConfig.reasoning` уже есть) |
| `src/persistence.ts` | `Preferences.extraHeaders` опционально, сохранение/загрузка |
| `src/tests/providers.test.ts` | Новые тесты (5+ кейсов) |
| `src/config.ts` | Без изменений |
| `src/agent/loop.ts` | Без изменений |
| `src/ui/SetupScreen.tsx` | Без изменений |

## Оценка усилия

**S** — 4 файла с правками + тесты.

| Часть | Оценка |
|-------|--------|
| Правки `openai.ts` (FR1–FR3, FR5) | S |
| `extraHeaders` (FR4: persistence + index + openai) | S |
| Тесты (5+ кейсов) | S |
| Проверка typecheck + прогон всех тестов | S |

## Риски

1. **OpenRouter-формат reasoning не универсален.** Некоторые эндпоинты (Anthropic напрямую) ожидают `thinking: {type: "enabled"}`. Если пользователь настраивает такой эндпоинт — получит 400. Решение: отключить thinking в UI. В будущем можно добавить выбор формата reasoning в расширенных настройках.
2. **`max_completion_tokens` rejected некоторыми прокси.** Старые прокси могут не поддерживать это поле. Риск низкий: большинство современных эндпоинтов (OpenRouter, Groq, Together) принимают оба варианта. При ошибке 400 пользователь отключает thinking.
3. **`extraHeaders` в `preferences.json` — plaintext.** Файл уже с маской `0o600`, но заголовки могут содержать чувствительные данные. Пользователь должен понимать, что `preferences.json` хранит секреты в открытом виде (как и `token`).

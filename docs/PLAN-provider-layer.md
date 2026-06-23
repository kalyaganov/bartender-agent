# PLAN — Переработка слоя LLM-провайдеров

> Пошаговый план реализации [SPEC-provider-layer.md](./SPEC-provider-layer.md). Фазы независимы и поставляются инкрементально; Фаза 1 — атомарна (контракт каскадит, частичная сборка невозможна).
>
> Каждая задача: файлы → действия → критерии готовности (чекбоксы). Перед закрытием фазы — `npm run typecheck && npm test`.

- [SPEC-provider-layer.md](./SPEC-provider-layer.md) · [SPEC-providers.md](./SPEC-providers.md) · [BACKLOG.md](./BACKLOG.md)

---

## Соглашения

- **Без комментариев** в исходниках (AGENTS.md), кроме явно запрошенных.
- **Русский** в пользовательском тексте, **английский** в идентификаторах/логах/комментариях тестов.
- Один логический шаг → один коммит. Фаза 1 — единым PR (иначе не собирается).
- Критерии готовности задачи = чекбоксы в соответствующем шаге. Фаза закрыта, когда `npm run typecheck && npm test` зелёные и все чекбоксы отмечены.

---

## Фаза 1 — Контракт стриминга (атомарно)

> SPEC §4.1, §4.2, §4.3, §4.4. Снимает проблемы 3/4/9. Меняет `StreamEvent`→`StreamPart`, расширяет `Message`, добавляет ошибки и `usage`. **Нельзя расщепить** — всё каскадит.

### 1.1 `errors.ts` — типизированные ошибки
**Файлы:** `src/agent/providers/errors.ts` (новый), `src/tests/errors.test.ts` (новый).
**Действия:** `ProviderError` (`kind`, `retryable`, `retryAfterMs?`, `cause?`); `ProviderErrorKind = auth|rateLimit|network|badRequest|abort|unknown`; `toProviderError(err)` — нормализация сырых ошибок OpenAI/Anthropic SDK по статусу (401/403→auth, 429→rateLimit+retry-after, ≥500→network, 400/422→badRequest, `AbortError`/name===`AbortError`→abort).
**Готово:**
- [ ] класс компилируется в strict-режиме, `kind`/`retryable` readonly.
- [ ] `toProviderError` покрывает 5 веток + fallback `unknown`(retryable:true).
- [ ] 429 парсит `retry-after` заголовок/поле → `retryAfterMs`.

### 1.2 `provider-utils.ts` — хелпер отмены
**Файлы:** `src/agent/providers/provider-utils.ts` (новый).
**Действия:** `withSignal<T>(promise, signal?): Promise<T>` — `Promise.race` с rejection `ProviderError(kind:"abort")` при `signal.aborted`/`abort`-событии.
**Готово:**
- [ ] без signal — возвращает promise как есть.
- [ ] при abort rejects `ProviderError(kind:"abort")`; нижележащий промис дорешает фоном (документировано в SPEC риски §3).

### 1.3 `types.ts` — новый контракт
**Файлы:** `src/agent/providers/types.ts` (переписать).
**Действия:** SPEC §4.1 — `ContentPart` (`text|reasoning|tool-call`), `ToolResultPart`, `Message` (`user|assistant|tool`), `GenerationConfig`, `ReasoningConfig`, `ToolChoice`, `FinishReason`, `Usage`, `StreamPart` (`text-delta|reasoning-delta|tool-call-delta|tool-call|finish|error`), `ProviderCapabilities`, `LLMProvider` (`provider`, `modelId`, `capabilities`, `streamTurn`). `system` остаётся полем `StreamTurnOptions`.
**Готово:**
- [ ] `StreamPart` — дискриминированное объединение (exhaustive switch работает).
- [ ] `done` удалён; `finish` несёт `finishReason` + опц. `usage`.
- [ ] `Message` различает `assistant.content: ContentPart[]` и `tool.content: ToolResultPart[]`.
- [ ] `tsc --noEmit` падает ожидаемо на адаптерах/loop/тестах (это сигнал для 1.4–1.8).

### 1.4 `OpenAIProvider` — мульти tool-call + delta + choice
**Файлы:** `src/agent/providers/openai.ts` (переписать), `src/tests/providers.test.ts` (обновить).
**Действия:** SPEC §4.3 — аккумулировать `tool_calls` по индексу в `Map<number, ToolCallAcc>`; эмитить `tool-call-delta` на каждую порцию `arguments`; в конце — по entry: `JSON.parse` + `tool-call` (с `toolCallId`). `mapToolChoice(c?)`: `auto|none|required` → как есть; `{type:"tool",toolName}` → `{type:"function",function:{name}}`. Reasoning: проверять и `delta.reasoning_content`, и `delta.reasoning`. Ошибки — через `toProviderError`. `max_tokens`/`temperature` из `opts.generation`. В конце — `finish` (из `chunk.usage` → `Usage`, `finish_reason` → `FinishReason`).
**Готово:**
- [ ] стрим с двумя `tool_calls` → два события `tool-call` (ни один не теряется).
- [ ] `tool-call-delta` аккумулирует args; итоговый `args` распарсен.
- [ ] `toolChoice:"required"` и forced-форма маппятся корректно (тест).
- [ ] reasoning ловится из обоих полей (тест на фейк-дельту с `reasoning`).
- [ ] `finish` несёт `usage` когда чанк содержит `usage`.

### 1.5 `AnthropicProvider` — generation из opts + signal
**Файлы:** `src/agent/providers/anthropic.ts` (переписать), `src/tests/anthropic.test.ts` (новый).
**Действия:** SPEC §4.4 — убрать `import { config }`. `thinking`/`max_tokens` из `opts.generation`, гейтится `capabilities.supportsReasoning`. `thinking_delta`→`reasoning-delta`, `text_delta`→`text-delta`. `finalMessage` обернуть в `withSignal(..., opts.signal)`. `tool_use` блоки → `tool-call` (`toolCallId: block.id`, `toolName: block.name`, `args: block.input`). В конце — `finish` (`message.usage` → `Usage`, `stop_reason` → `FinishReason`). Ошибки — `toProviderError`.
**Готово:**
- [ ] нет импорта `config` в файле.
- [ ] thinking включается только при `supportsReasoning && opts.generation.reasoning`.
- [ ] abort signal → `ProviderError(kind:"abort")` (тест с фейк-стримом + abort).
- [ ] `tool-call` несёт корректный `toolCallId` из `block.id`.

### 1.6 `loop.ts` — потребитель нового контракта
**Файлы:** `src/agent/loop.ts` (обновить), `src/tests/loop.test.ts` (обновить моки).
**Действия:** SPEC §4.9 (без forced/retry — это Фаза 3) — обработчик событий: `text-delta`→`appendStreamingToken`, `reasoning-delta`→`appendReasoning`, `tool-call`→`toolInput = ev.args`, `finish`→`store.recordUsage(ev.usage)` (новый метод-заглушка в сторе, см. 1.7), `error`→бросить. Retry оставить прежним (всё кроме `AbortError`), но обёртка `done` убрана. Мок-провайдеры в тестах отдают `text-delta`/`finish`/`tool-call`.
**Готово:**
- [ ] все существующие сценарии `loop.test.ts` зелёные (стрим, tool-flow, reasoning, forced-refuse, call_taxi).
- [ ] `recordUsage` вызывается на `finish`.
- [ ] `error`-событие стрима пробрасывается как ошибка хода.

### 1.7 Стор: `recordUsage`
**Файлы:** `src/state/store.ts` (обновить).
**Действия:** добавить поле `lastUsage?: Usage` и метод `recordUsage(u?: Usage)`; в `/state` (`agent/commands.ts`) опционально показывать `tokens in/out`. Без персистентности — только последний ход.
**Готово:**
- [ ] `recordUsage(undefined)` не падает.
- [ ] (опц.) `/state` печатает токены последнего хода, если есть.

### 1.8 Адаптеры конструируются с `capabilities`
**Файлы:** `src/agent/providers/index.ts`, `src/agent/providers/openai.ts`, `src/agent/providers/anthropic.ts` (минимально).
**Действия:** конструкторы провайдеров принимают/вычисляют `capabilities` (из `ModelDef.canReason`/`contextWindow` каталога) и выставляют readonly-поля `provider`/`modelId`/`capabilities`. `createProvider` пока сохраняет старую сигнатуру `(id, model?)` — полный DI в Фазе 2.
**Готово:**
- [ ] `provider.capabilities.supportsReasoning === true` для `o4-mini`/`deepseek-reasoner`/`claude-sonnet-4`.
- [ ] `provider.modelId` совпадает с переданным.

### 1.9 Smoke-скрипты
**Файлы:** `scripts/smoke.ts`, `scripts/smoke-turn.ts`.
**Действия:** печатать полный `StreamPart`-поток (`text-delta` накапливается, `tool-call.args`, `finish` с usage). `smoke.ts` адаптировать под новый контракт адаптеров.
**Готово:**
- [ ] `npx tsx scripts/smoke.ts` проходит с реальным ключом (ручная проверка).
- [ ] выводит `usage` при наличии.

### 1.10 Фаза 1 — приёмка
**Готово:**
- [ ] `npm run typecheck` зелёно.
- [ ] `npm test` зелёно.
- [ ] ни один файл не импортирует `config` из адаптеров (`rg "from \"../../config\"" src/agent/providers` пусто).
- [ ] `StreamEvent`/`done` не осталось в коде (`rg "type: \"done\"" src` пусто).

---

## Фаза 2 — Дедупликация + DI

> SPEC §4.5, §4.6, §4.7, §4.8. Снимает 1/2/10/11/12. Убирает `prefsCache`-глобал, дубль `build()`, хак `providerVersion`, хардкод-карты в config.

### 2.1 `credentials.ts` — без глобала
**Файлы:** `src/agent/providers/credentials.ts`, `src/tests/credentials.test.ts` (обновить).
**Действия:** удалить `prefsCache`/`setPreferencesCache`/`getPreferencesCache`. Оставить чистую `resolveCredentialsFrom(id, src: CredentialSources)`. `resolveCredentials(id, prefs)` — обёртка, берёт env из config + prefs аргументом. `saveCredentials(id, cred, prefs)` — принимает prefs, возвращает обновлённые (не мутирует глобал).
**Готово:**
- [ ] `rg "setPreferencesCache" src` пусто.
- [ ] тесты credentials передают prefs аргументом, без прогрева глобала.

### 2.2 Единая фабрика + карта адаптеров
**Файлы:** `src/agent/providers/index.ts`, `src/agent/providers/registry.ts`.
**Действия:** SPEC §4.7 — `ADAPTERS: Record<ProviderKind, AdapterFactory>`; `createProvider(id, model?, prefs)` — единственное место сборки, выбирает адаптер по `kind`. `registry.ts`: удалить `ALL_PROVIDERS`/`PROVIDERS`/`ProviderDef.build`/`getProviderDef`/`refreshConfigured`/`configuredProviderIds` (если остались потребители — заменить на 2.3). Оставить `providerViews(prefs): ProviderView[]` и `isConfigured(id, prefs): boolean`.
**Готово:**
- [ ] `rg "ProviderDef|ALL_PROVIDERS|refreshConfigured" src` пусто.
- [ ] ровно одна функция строит `LLMProvider` (`createProvider`).

### 2.3 config.ts — env-карта из каталога
**Файлы:** `src/config.ts`.
**Действия:** SPEC §4.8 — `apiKeys` строится из `PROVIDER_CATALOG.map(e => [e.id, parsed[e.apiKeyEnv]])`. `baseURLs` — только custom (как сейчас). Zod-схема env остаётся (ключи берутся из `apiKeyEnv` каталога).
**Готово:**
- [ ] добавление провайдера в каталог автоматически подхватывает его env-ключ (без правки config-карты).
- [ ] `OPENCODE_GO_*` и миграция `opencode-go`→`custom` сохранены.

### 2.4 app.ts + loop.ts — без `providerVersion`, prefs по требованию
**Файлы:** `src/state/app.ts`, `src/agent/loop.ts`, `src/state/store.ts` (если нужно).
**Действия:** SPEC §4.8 — убрать `providerVersion`. `loop.getProvider()` строит `LLMProvider` на ход (Вариант A): читает `providerId`/`model` из `useAppStore`, prefs — через `loadPreferences()` (или app-store держит snapshot, обновляемый в `saveCredentials`). Если замер покажет потерю — `invalidateProvider()` (Вариант B, без счётчика).
**Готово:**
- [ ] `rg "providerVersion" src` пусто.
- [ ] модульный `let cached` в `loop.ts` убран.
- [ ] первый ход после смены провайдера использует новый провайдер.

### 2.5 UI и bootstrap — prefs явно
**Файлы:** `src/bootstrap.ts`, `src/ui/ProviderSetup.tsx`, `src/ui/OpencodeImport.tsx`.
**Действия:** `bootstrap.ts` передаёт prefs в `createProvider`/resolver явно, без `setPreferencesCache`. `ProviderSetup`/`OpencodeImport` получают prefs из `useAppStore` (новое поле или чтение) и зовут `providerViews(prefs)`/`isConfigured(id, prefs)`; сохранение — через `saveCredentials(id, cred, prefs)` с обновлением store-snapshot.
**Готово:**
- [ ] `ProviderSetup` показывает `[настроен]`/`[текущий]` корректно после смены/добавления ключа (без `refreshConfigured()`).
- [ ] `OpencodeImport` пишет creds и UI сразу видит импортированных провайдеров.

### 2.6 Фаза 2 — приёмка
**Готово:**
- [ ] `npm run typecheck && npm test` зелёно.
- [ ] `rg "prefsCache|setPreferencesCache|providerVersion|ALL_PROVIDERS|refreshConfigured" src` пусто.
- [ ] `src/tests/registry.test.ts` (новый) проверяет `providerViews`/`isConfigured`.

---

## Фаза 3 — Forced tool + capabilities + умный retry

> SPEC §4.9, §4.2 (применение). Снимает 5/6/7/8. Поведение становится одинаковым на всех провайдерах; retry перестаёт жечь попытки на 401/400.

### 3.1 Forced `toolChoice`
**Файлы:** `src/agent/loop.ts`.
**Действия:** передавать `toolChoice: { type: "tool", toolName: "bartender_action" }`. Проверить, что fallback «reply машинкой» (`loop.ts:124-134`) теперь срабатывает только для genuinely-reasoning моделей (content пуст, reply в tool) — а не из-за того, что модель не вызвала инструмент.
**Готово:**
- [ ] на OpenAI/Groq модель обязана вернуть `bartender_action` (тест с моком, проверяющим `toolChoice` в аргументах стрима).
- [ ] fallback-ветка остаётся только для reasoning-моделей.

### 3.2 `GenerationConfig` из capabilities
**Файлы:** `src/agent/loop.ts`, `src/config.ts` (значения по умолчанию).
**Действия:** SPEC §4.9 — собрать `generation` (`temperature`, `maxOutputTokens`, `reasoning`) из config + `provider.capabilities.supportsReasoning`. `reasoning.budgetTokens` из `config.reasoning.anthropicThinkingBudget` (переименовать в `reasoningBudgetTokens`, отвязать от «anthropic»).
**Готово:**
- [ ] модель без `canReason` не получает `reasoning` в запросе (адаптер игнорирует + warn).
- [ ] `maxOutputTokens` настраивается через config.

### 3.3 Умный retry
**Файлы:** `src/agent/loop.ts`, `src/tests/loop.test.ts`.
**Действия:** SPEC §4.2/§4.9 — `withRetry`: ловить ошибку → `toProviderError`; если `kind==="abort"` или `!retryable` — пробросить немедленно; иначе backoff = `retryAfterMs ?? retryBackoffMs*(attempt+1)`. Удалить старое «всё кроме AbortError».
**Готово:**
- [ ] 401 (`auth`) — 0 ретраев (тест).
- [ ] 429 (`rateLimit`) — ретраит, уважает `retryAfterMs` (тест с замоканным таймером).
- [ ] 500 (`network`) — ретраит до `retryAttempts`.
- [ ] abort — проброс без fallback-маскировки.

### 3.4 Фаза 3 — приёмка
**Готово:**
- [ ] `npm run typecheck && npm test` зелёно.
- [ ] ручной smoke на 2 провайдерах (один reasoning, один нет) — оба возвращают `bartender_action` каждый ход.
- [ ] `src/tests/errors.test.ts` зелёный (создан в 1.1, актуализирован).

---

## Сквозные критерии готовости (все фазы)

- [ ] `npm run typecheck` зелёно.
- [ ] `npm test` зелёно; новые тесты: `errors`, `provider-utils`(если есть), `anthropic`, `registry`; обновлены: `providers`, `loop`, `credentials`, `bootstrap`.
- [ ] `rg "StreamEvent|type: \"done\"|prefsCache|setPreferencesCache|providerVersion|ALL_PROVIDERS|refreshConfigured|ProviderDef" src` — пусто.
- [ ] адаптеры не импортируют `config` (`rg "from \"../../config\"" src/agent/providers` — пусто).
- [ ] `docs/SPEC-provider-layer.md` отмечена реализованной (ссылки на коммиты по фазам).

## Риски (из SPEC)

- Фаза 1 нерасщепима — единый PR (контракт каскадит).
- `finalMessage()` Anthropic: `withSignal`race — нижележащий промис дорешает фоном; принять и задокументировать.
- per-turn строительство провайдера (Фаза 2 Вариант A): проверить замером; при потере — Вариант B.
- o-series reasoning: только оба дельта-поля; нативный OpenAI-reasoning API — вне scope.

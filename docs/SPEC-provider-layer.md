# SPEC — Переработка слоя LLM-провайдеров (контракт + дедупликация)

> Рефакторинг подсистемы подключения LLM к агенту: богатый стриминг-контракт по образцу AI SDK Language Model V3, устранение дублирования логики построения провайдера, инъекция зависимостей вместо мутабельных глобалов, типизированные ошибки и осмысленный retry.
>
> Идеи переносятся из **AI SDK V3** ([spec](https://ai-sdk.dev/providers/community-providers/custom-providers)) и устройства **opencode** (`internal/llm`), но **пакет `ai` НЕ добавляется как зависимость** — для TUI-агента это оверкилл. Контракт остаётся собственным, просто приводится к индустриальному стандарту.

- [SPEC-providers.md](./SPEC-providers.md) — предыдущая итерация (интерактивная настройка + каталог). Эта SPEC — её наследник по слою адаптеров.
- [BACKLOG.md](./BACKLOG.md) — снимает блокеры для T1 (отмена), T2 (контекст), готовит почву для многошагового tool-use.

---

## Проблема

Слой провайдеров реализован верно по задумке (каталог → креды → 2 адаптера → единый `streamTurn`), но реализация дублирует логику, тащит скрытые глобалы и держит слишком узкий контракт, который уже сейчас мешает. Конкретно:

1. **Дублирование построения провайдера.** `registry.ts:20-31` (`build()`) и `index.ts:7-20` (`createProvider`) — почти идентичный код (catalog lookup → `resolveCredentials` → switch по `kind` → конструктор). SPEC-providers §4.7 обещал «тонкую обёртку», но registry остался полнофункциональным двойником. Любое изменение — в двух местах.
2. **Мутабельный глобал `prefsCache`.** `credentials.ts:12` мутируется через `setPreferencesCache` из `bootstrap.ts:83`, `OpencodeImport.tsx:44`, UI. Порядок вызовов решает, что вернёт `resolveCredentials`; UI лезёт в глобал напрямую — сильная связанность и боль для тестов.
3. **`Message` слишком узкий.** `types.ts:14` — `{ role: "user"|"assistant"; content: string }`. Нет роли `tool`, нет tool-call в assistant-сообщении, нет `toolCallId`. **Намертво блокирует** многошаговый tool-use и контекст с результатами вызовов.
4. **OpenAI-адаптер теряет tool-calls.** `openai.ts:55-64` копит только `tool_calls[0]`. Несколько вызовов — молча теряются; `JSON.parse` в голом try/catch, без проверки что инструмент наш.
5. **`tool_choice` расходится.** `openai.ts:31` — `"auto"` (модель **может не вызвать** инструмент), `anthropic.ts:35` — `{type:"any"}` (принудительно). Для character-агента, где `bartender_action` обязателен каждый ход, OpenAI-ветка ведёт в fallback «reply машинкой» (`loop.ts:124-134`). Должно быть forced.
6. **Anthropic лезет в глобальный конфиг.** `anthropic.ts:2,21` импортирует `config.reasoning.*`. Нарушает принцип «loop не знает провайдера». Плюс `max_tokens: 512` хардкод.
7. **Параметры генерации не настраиваются.** Ни `temperature`, ни `maxOutputTokens`, ни reasoning-настройки не пробрасываются. Каталог знает `canReason`/`contextWindow` (`catalog.ts:6-7`), но адаптеры **их не используют** — мёртвые метаданные. У o4-mini reasoning идёт через другое поле, не `reasoning_content`.
8. **Нет типизации ошибок → тупой retry.** `loop.ts:32-61` ретраит всё кроме AbortError, до `retryAttempts`. 401 (битый ключ) ретраится 3 раза впустую.
9. **`StreamEvent` бедный, без usage.** `types.ts:25-29` — `token|reasoning|toolCall|done`. Нет `finish` (с cause), нет `usage` (input/output tokens), нет `error`. Невозможно считать стоимость или следить за контекстом. `done` — избыточен (итератор и так завершается).
10. **Кеш провайдера в loop — хак с `providerVersion`.** `loop.ts:8-17` + `app.ts:38-47` — ручной счётчик инвалидации. Конструкторы SDK дешёвые, кешировать на уровне модуля с ручным bust — лишняя сложность.
11. **Два источника правды для «настроен».** `registry.ts:19` считает `configured` при построении массива → `refreshConfigured()` пересчитывает; UI дёргает `isProviderConfigured()` напрямую (`ProviderSetup.tsx:53,90`). Значения расходятся.
12. **`config.ts` дублирует каталог.** `config.ts:43-55` — хардкод-карта `apiKeys`/`baseURLs`. Это знание уже есть в `catalog.ts:apiKeyEnv`. Новый провайдер = правка двух файлов.
13. **AbortSignal в Anthropic не доделан.** `anthropic.ts:50` — `await stream.finalMessage()` игнорирует `signal`; при отмене может зависнуть. `done` эмитится безусловно даже на обрыве.
14. **`kind` бинарный, расширять некуда.** `catalog.ts:1` — `"anthropic" | "openai-compat"`. Gemini/Bedrock/Ollama валится в одну ветку тернарника (`index.ts:17`); нативные адаптеры не вписываются без переделки диспетчеризации.

## Цели

1. **Богатый контракт стриминга** по образцу AI SDK V3: части контента (`text`/`reasoning`/`tool-call`), роль `tool` для результатов, инкрементальная дельта аргументов, `finish` с `usage` и `finishReason`, типизированный `error`. Снимает блокеры 3/4/9.
2. **Единая фабрика провайдеров.** Один `createProvider`, registry — тонкий view над каталогом для UI. Снимает 1/10/11.
3. **Инъекция зависимостей вместо глобалов.** Credentials resolver принимает `Preferences` аргументом; `prefsCache` убирается. Снимает 2.
4. **Параметры генерации в CallOptions.** `temperature`, `maxOutputTokens`, `reasoning`, `toolChoice` пробрасываются явно; каталоговое `canReason`/`contextWindow` реально используется адаптерами. Снимает 5/6/7.
5. **Типизированные ошибки и умный retry.** `ProviderError` с `kind`/`retryable`/`retryAfter`; `withRetry` уважает их. Снимает 8.
6. **Generation params и capabilities — first-class.** Каталог описывает возможности, адаптеры по ним живут. Снимает 5/6/7 и готовит почву под нативный Gemini/Ollama (14).

## Текущее состояние (ссылки)

| Что | Где | Суть |
|---|---|---|
| Контракт | `src/agent/providers/types.ts:14-40` | `Message` узкий, `StreamEvent` без usage/finish/error |
| Каталог | `src/agent/providers/catalog.ts` | декларативный, но `canReason`/`contextWindow` не используются |
| Креды (глобал) | `src/agent/providers/credentials.ts:12` | `let prefsCache` мутируется снаружи |
| Фабрика №1 | `src/agent/providers/index.ts:7-20` | `createProvider` |
| Фабрика №2 (дубль) | `src/agent/providers/registry.ts:15-32` | `ALL_PROVIDERS[].build()` — копия №1 |
| OpenAI-адаптер | `src/agent/providers/openai.ts` | только `tool_calls[0]`, `tool_choice:"auto"`, хардкод max_tokens |
| Anthropic-адаптер | `src/agent/providers/anthropic.ts` | импорт `config.reasoning`, `finalMessage()` без signal |
| Кеш в loop | `src/agent/loop.ts:8-17` | модульный `cached` по `providerVersion` |
| Retry | `src/agent/loop.ts:32-61` | ретраит всё, без классификации |
| config-карты | `src/config.ts:43-58` | дубль `apiKeyEnv` из каталога |
| История → messages | `src/agent/loop.ts:91` + `selectHistory` | плоский `{role,content:string}` |

## Дизайн

### 4.1. Новый контракт `types.ts`

По образцу AI SDK V3, но облегчённый (без file/multimodal/provider-options — вне scope). `system` остаётся отдельным параметром (Anthropic требует его отдельно; текущий код уже так).

```ts
// src/agent/providers/types.ts
export type ProviderId =
  | "anthropic" | "openai" | "gemini" | "groq"
  | "openrouter" | "xai" | "deepseek" | "mistral"
  | "zai" | "minimax" | "custom";

// --- Content parts (что генерит/хранит модель) ---
export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string };
export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;     // корреляция результата с вызовом
  toolName: string;
  args: unknown;          // распарсенный JSON
}
export type ContentPart = TextPart | ReasoningPart | ToolCallPart;

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
}

// system — отдельным параметром (см. StreamTurnOptions)
export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: ContentPart[] }
  | { role: "tool"; content: ToolResultPart[] };

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// --- Параметры генерации (явно, не из глобала) ---
export interface ReasoningConfig {
  effort?: "low" | "medium" | "high";
  budgetTokens?: number;   // Anthropic thinking.budget_tokens
}
export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  stopSequences?: string[];
  reasoning?: ReasoningConfig;
}

export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "tool"; toolName: string };

// --- Стриминг: typed parts ---
export type FinishReason =
  | "stop" | "length" | "tool-calls"
  | "content-filter" | "error";

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage }
  | { type: "error"; error: ProviderError };

export interface StreamTurnOptions {
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  toolChoice?: ToolChoice;
  generation?: GenerationConfig;
  signal?: AbortSignal;
}

// --- Возможности модели (из каталога, используются адаптером) ---
export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsReasoning: boolean;
  contextWindow?: number;
}

export interface LLMProvider {
  readonly provider: string;
  readonly modelId: string;
  readonly capabilities: ProviderCapabilities;
  streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamPart>;
}
```

Ключевые отличия от нынешнего `StreamEvent`:
- `token` → `text-delta`, `reasoning` → `reasoning-delta` (явно «дельта», как в V3).
- Появился `tool-call-delta` — инкремент args (нужно для будущего UI «печатается вызов» и для аккуратной сборки).
- `toolCall` → `tool-call` с `toolCallId`.
- `done` убран — заменён на `finish` (с cause + usage). Завершение итератора = конец стрима.
- Появился `error` — стрим может закончиться ошибкой, не только исключением.

### 4.2. Типизированные ошибки (`errors.ts`, новый)

```ts
// src/agent/providers/errors.ts
export type ProviderErrorKind =
  | "auth"        // 401/403 — ключ плохой, НЕ ретраить
  | "rateLimit"   // 429 — ретраить с retryAfter
  | "network"     // таймаут/ECONNRESET — ретраить
  | "badRequest"  // 400/422 — схема/модель, НЕ ретраить
  | "abort"       // AbortSignal
  | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// Адаптеры нормализуют сыррые ошибки SDK в ProviderError:
//   OpenAI: status === 401 → auth; 429 → rateLimit (читать retry-after); >=500 → network(retryable)
//   Anthropic: аналогично по error.status/error.error.type
```

### 4.3. OpenAI-адаптер: несколько tool-calls + forced choice

```ts
// src/agent/providers/openai.ts — ядро обработки дельт
interface ToolCallAcc {
  id: string;
  name: string;
  argsText: string;
}

// внутри streamTurn, по дельте tool_calls:
const acc = new Map<number, ToolCallAcc>();
// ...
const tc = delta.tool_calls?.[0];          // пример одной дельты
if (tc) {
  const idx = tc.index ?? 0;
  const entry = acc.get(idx) ?? { id: "", name: "", argsText: "" };
  if (tc.id) entry.id = tc.id;
  if (tc.function?.name) entry.name = tc.function.name;
  if (tc.function?.arguments) {
    entry.argsText += tc.function.arguments;
    yield {
      type: "tool-call-delta",
      toolCallId: entry.id || String(idx),
      argsTextDelta: tc.function.arguments,
    };
  }
  acc.set(idx, entry);
}
// в конце — по каждому entry: yield { type:"tool-call", toolCallId, toolName, args: JSON.parse(...) }

// tool_choice:
function mapToolChoice(c?: ToolChoice): unknown {
  if (!c) return undefined;
  if (c === "auto" || c === "none" || c === "required") return c;
  return { type: "function", function: { name: c.toolName } };   // forced
}
```

Reasoning: `delta.reasoning_content` (DeepSeek/xAI) **и** `delta.reasoning` (некоторые OpenAI-совместимые) — оба проверяем. Каталоговое `canReason` гейтит `reasoning` в generation.

### 4.4. Anthropic-адаптер: без глобала, с signal на finalMessage

```ts
// src/agent/providers/anthropic.ts
// thinking/max_tokens берём из opts.generation, не из config:
const wantThinking = capabilities.supportsReasoning && !!opts.generation?.reasoning;
max_tokens: opts.generation?.maxOutputTokens ?? 1024,
thinking: wantThinking ? { type: "enabled", budget_tokens: opts.generation.reasoning!.budgetTokens ?? 1024 } : undefined,

// finalMessage с signal: оборачиваем в race с abort
const final = await withSignal(stream.finalMessage(), opts.signal);
// tool_use блоки → { type:"tool-call", toolCallId: block.id, toolName: block.name, args: block.input }
```

`withSignal(promise, signal)` — хелпер в `provider-utils.ts`: отвергает `ProviderError(kind:"abort")` при abort; иначе возвращает результат.

### 4.5. Инъекция зависимостей: credentials без глобала

`resolveCredentialsFrom` уже чистая (`credentials.ts:33`). Оставляем её, убираем глобальный `prefsCache`:

```ts
// src/agent/providers/credentials.ts
export interface CredentialSources {
  env: ApiKeyMap;          // из config (только чтение)
  prefs: Preferences;      // аргумент, не глобал
  baseURLs?: BaseURLMap;
}

export function resolveCredentialsFrom(id, src): Credentials | null;   // уже есть, чистая

// createProvider принимает prefs снаружи:
export function createProvider(
  id: ProviderId,
  model: string | undefined,
  prefs: Preferences,
): LLMProvider;
```

Где брать `prefs`:
- `loop.ts` — из `useAppStore`/прямого `loadPreferences()` (он уже читает файл). Кеш — на уровне `app.ts`/`loop.ts`, не модуля credentials.
- `bootstrap.ts` — локально, как сейчас.
- Тесты — передают мок-`Preferences` напрямую, без `setPreferencesCache`/`refreshConfigured`.

### 4.6. Единая фабрика; registry → тонкий view

```ts
// src/agent/providers/index.ts — единственное место сборки
export function createProvider(id, model, prefs): LLMProvider { ... по kind/adapter ... }
```

```ts
// src/agent/providers/registry.ts — только UI-метаданные, НЕТ build()
export interface ProviderView {
  id: ProviderId; label: string; defaultModel: string;
  models: ModelDef[]; kind: ProviderKind;
}
export function providerViews(prefs: Preferences): ProviderView[];   // configured считается на лету
export function isConfigured(id, prefs): boolean;                    // одна функция правды
```

`ProviderSetup.tsx` получает `prefs` из `useAppStore` (новое поле, см. 4.8) и дёргает `providerViews(prefs)` / `isConfigured(id, prefs)`. Уходят: `ALL_PROVIDERS`, `PROVIDERS`, `refreshConfigured`, дубль `build()`.

### 4.7. Адаптеры реестрируются (готовим почву под Gemini/Ollama)

Вместо тернарника `kind === "anthropic" ? ... : ...` — карта фабрик:

```ts
type AdapterFactory = (args: {
  apiKey: string; baseURL?: string; model: string;
  capabilities: ProviderCapabilities;
}) => LLMProvider;

const ADAPTERS: Record<ProviderKind, AdapterFactory> = {
  anthropic: (a) => new AnthropicProvider(a),
  "openai-compat": (a) => new OpenAIProvider(a),
  // будущее: "gemini": (a) => new GeminiProvider(a),
  // будущее: "ollama": (a) => new OllamaProvider(a),
};
```

`ProviderKind` расширяется без правки `createProvider`.

### 4.8. config.ts генерируется из каталога; loop без хака

```ts
// config.ts: env-карта строится из каталога, без хардкода
const envKeys = Object.fromEntries(
  PROVIDER_CATALOG.map((e) => [e.id, process.env[e.apiKeyEnv]]),
);
// baseURLs — только для custom (из CUSTOM_BASE_URL/OPENCODE_GO_BASE_URL) — как сейчас
```

Кеш провайдера в `loop.ts`:
- Вариант A (рекомендую): строить `LLMProvider` на каждый ход. Конструкторы SDK дешёвые (не открывают сокеты), а ход — это секунды стрима. Убираем `cached`/`providerVersion` целиком. Простота > микро-оптимизация.
- Вариант B (если измеримая потеря): явный `invalidateProvider()` в `setProvider`, без счётчика.

`app.ts` теряет `providerVersion`; `setProvider` хранит `prefs` в сторе (или loop читает `loadPreferences()` сам).

### 4.9. loop.ts: новый контракт + умный retry + forced tool

```ts
const generation: GenerationConfig = {
  temperature: 0.8,
  maxOutputTokens: 1024,
  reasoning: provider.capabilities.supportsReasoning
    ? { budgetTokens: config.reasoning.anthropicThinkingBudget }
    : undefined,
};

await withRetry(
  (signal) => provider.streamTurn({
    system, messages,
    tools: [BARTENDER_TOOL],
    toolChoice: { type: "tool", toolName: "bartender_action" },   // forced!
    generation, signal,
  }),
  (ev) => {
    if (ev.type === "text-delta") store.appendStreamingToken(ev.text);
    else if (ev.type === "reasoning-delta") store.appendReasoning(ev.text);
    else if (ev.type === "tool-call") toolInput = ev.args;         // args уже распарсены
    else if (ev.type === "finish") store.recordUsage(ev.usage);    // новое: для контекст-менеджмента
  },
);

// withRetry:
//   catch (err) {
//     const pe = toProviderError(err);
//     if (pe.kind === "abort" || !pe.retryable) throw pe;
//     backoff = pe.retryAfterMs ?? retryBackoffMs * (attempt + 1);
//   }
```

История `selectHistory` теперь строит `Message[]` с parts:
- user-реплики → `{ role:"user", content }`.
- assistant-реплики → `{ role:"assistant", content: [{type:"text",text}, ...toolCall?] }`. Последний `bartender_action` сохраняется в сторе и подставляется как `tool-call` part (готовит почву под loop с tool-result).

> **Scope-замечание:** многошаговый loop (выполнение tool → досылка `tool`-сообщения → продолжение) — **отдельная будущая SPEC**. Здесь лишь готовим контракт чтобы он был возможен.

## Затронутые файлы

**Новые:**
- `src/agent/providers/errors.ts` — `ProviderError`, `toProviderError`, классификация по статусам SDK.
- `src/agent/providers/provider-utils.ts` — `withSignal()`, хелперы маппинга (при необходимости).

**Существенно переписываемые:**
- `src/agent/providers/types.ts` — новый контракт (4.1).
- `src/agent/providers/openai.ts` — мульти tool-call, `tool-call-delta`, `mapToolChoice`, reasoning variants, нормализация ошибок.
- `src/agent/providers/anthropic.ts` — generation из opts, `finalMessage` с signal, `tool-call` с `toolCallId`, без импорта config.
- `src/agent/providers/index.ts` — единый `createProvider(id, model, prefs)`, карта адаптеров (4.7).
- `src/agent/providers/registry.ts` — тонкий `providerViews(prefs)` / `isConfigured(id,prefs)`; убрать `ALL_PROVIDERS`/`build()`/`refreshConfigured`.
- `src/agent/providers/credentials.ts` — убрать `prefsCache`/`setPreferencesCache`; resolver чистый по `CredentialSources`.
- `src/agent/loop.ts` — `text-delta`/`finish`/forced `toolChoice`, `recordUsage`, новый retry по `ProviderError`, убрать модульный кеш `cached`.
- `src/config.ts` — env-карта из каталога (4.8).
- `src/state/app.ts` — убрать `providerVersion`; хранить/читать prefs для resolver (или loop читает сам).
- `src/bootstrap.ts` — передаёт prefs явно, без `setPreferencesCache`.
- `src/ui/ProviderSetup.tsx` + `OpencodeImport.tsx` — `providerViews(prefs)`/`isConfigured(id,prefs)`, без мутации глобала.
- `src/agent/tools.ts` — без изменений по контракту (инструмент тот же), но `parseBartenderAction` зовётся на `tool-call.args`.

**Затрагиваемые минимально:**
- `scripts/smoke.ts`, `scripts/smoke-turn.ts` — адаптация под новый `StreamPart` и сигнатуру `createProvider`.

## Тесты

Витeст, рядом с кодом (`src/tests/`):

- **`types.test.ts`** (новый, ts-dossier) — контракт: `Message`/`StreamPart` дискриминированы корректно; `finish` несёт `usage`/`finishReason`.
- **`providers.test.ts`** (обновить) — OpenAI: мульти tool-call (2 вызова в одном стриме → 2 события `tool-call`); `tool-call-delta` аккумулируется; `tool_choice` forced маппится в `{type:"function",function:{name}}`; reasoning из обоих полей.
- **`anthropic.test.ts`** (новый/расширить) — thinking берётся из `opts.generation`, не из config; `finalMessage` отменяется по signal (`ProviderError kind:"abort"`); tool_use → `tool-call` с корректным `toolCallId`.
- **`errors.test.ts`** (новый) — `toProviderError`: 401→auth(not retryable), 429→rateLimit(retryAfter из заголовка), 500→network(retryable), 400→badRequest(not retryable), AbortError→abort.
- **`loop.test.ts`** (обновить) — моки отдают `text-delta`/`finish`/`tool-call`; `withRetry` НЕ ретраит auth/badRequest, ретраит rateLimit с `retryAfterMs`; forced `toolChoice` передаётся в мок; `recordUsage` вызывается.
- **`credentials.test.ts`** (обновить) — `resolveCredentialsFrom` чистая, prefs аргументом; **нет** `setPreferencesCache` в тестах.
- **`registry.test.ts`** (новый) — `providerViews(prefs)` строит список; `isConfigured(id,prefs)` единая правда; `build()` отсутствует.
- **`bootstrap.test.ts`** (обновить) — prefs передаётся, не греет глобал.

Ручная проверка: `npx tsx scripts/smoke.ts` для реального провайдера — проверяет полный `StreamPart`-поток (`text-delta` + `tool-call` + `finish` с usage).

## Оценка усилия

**L** — глубокий рефакторинг слоя, но с обратной совместимостью поведения для пользователя (образ/UX не меняются).

| Часть | Оценка |
|---|---|
| `types.ts` новый контракт + capabilities | M |
| `errors.ts` + нормализация в адаптерах | S–M |
| OpenAI-адаптер (мульти-call, delta, choice, reasoning) | M |
| Anthropic-адаптер (generation из opts, signal, toolCallId) | S–M |
| registry → view; credentials DI; убрать глобал | S |
| `createProvider` единый + карта адаптеров | S |
| loop.ts (новый контракт, retry, forced choice, usage) | M |
| config.ts из каталога; app.ts без providerVersion | S |
| UI-правки (prefs в ProviderSetup/OpencodeImport) | S |
| Тесты (2 новых + 5 обновляемых) | M |

Рекомендуемый порядок (фазы независимы, можно поставлять инкрементально):
1. **Фаза 1 — Контракт:** `types.ts` + `errors.ts` + адаптеры под новый `StreamPart`. Снимает блокеры 3/4/9.
2. **Фаза 2 — Дедупликация + DI:** единый `createProvider`, registry-view, убрать `prefsCache`, config из каталога. Снимает 1/2/10/11/12.
3. **Фаза 3 — Forced tool + capabilities + retry:** `toolChoice` forced, `canReason`/`contextWindow` в деле, умный retry. Снимает 5/6/7/8.

## Риски и открытые вопросы

1. **Обратная совместимость `StreamEvent` → `StreamPart`.** Внешних потребителей контракта нет (всё внутри репо), но `loop.ts`, smoke-скрипты и мок-провайдеры в тестах меняются одновременно. Миграция — атомарным коммитом по слою, иначе не собирается. Решение: Фаза 1 целиком за один PR.
2. **Кеш провайдера per-turn.** Вариант A (строить на ход) проверяется замером: если `npm run dev` отвечает медленнее первого хода — откатиться на явный `invalidateProvider()` (Вариант B). Гипотеза: разница в пределах шума, т.к. стрим — секунды.
3. **`finalMessage()` Anthropic и signal.** SDK `@anthropic-ai/sdk` не принимает signal в `finalMessage()`. `withSignal` реализуется через `Promise.race` с rejection по abort — но нижележащий промис всё равно дорешает (нетривиально отменить HTTP-запрос SDK). Принять: abort означает «перестать ждать», дорешающее — фоново. Документировать.
4. **Reasoning у OpenAI o-series.** o1/o3/o4-mini возвращают reasoning иначе (через `response`/спец-поля, не `reasoning_content`). В scope Фазы 3 — только проверка обоих дельта-полей; полноценная поддержка native-reasoning API OpenAI — отдельная задача, если выберут o-модель по умолчанию.
5. **`canReason` гейтит thinking.** Если юзер выставит `reasoning` в generation, но модель не умеет (хаика) — адаптер игнорирует (warn в `stream-start`-аналоге). Не падать.
6. **Где хранить prefs для resolver.** Либо `app.ts` держит snapshot prefs и обновляет при `saveCredentials`, либо `loop.ts` читает `loadPreferences()` перед ходом (асинхронно). Второе проще и всегда свежее, но +1 read файла на ход (дёшево). Решить на Фазе 2.
7. **Scope многошагового loop.** Эта SPEC только готовит контракт (роль `tool`, `tool-result`, `toolCallId`). Сам цикл «вызвал инструмент → выполнил → дослал результат → продолжил» — **отдельная SPEC-loop**, иначе разрастается.

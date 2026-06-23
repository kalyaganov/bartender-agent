# SPEC — Интерактивная настройка провайдеров + импорт из opencode

> Настройка LLM-провайдеров без правки `.env`: при первом запуске предлагается импорт ключей из установленного `opencode`, недостающие ключи вводятся прямо в TUI, а список провайдеров расширяется до полного набора основных вендоров (по референсу [opencode-ai/opencode](https://github.com/opencode-ai/opencode)).

- [SPEC.md](./SPEC.md) · [BACKLOG.md](./BACKLOG.md) · [SPEC-alt-screen.md](./SPEC-alt-screen.md)

---

## Проблема

Сегодня единственный способ подключить провайдера — отредактировать `~/.bartender-agent/.env` руками:

- `src/config.ts:7` — `dotenv.config` читает ключи **только** из `.env`; `config.apiKeys` (`src/config.ts:27-31`) формируется из переменных окружения.
- `src/agent/providers/registry.ts:19,28,41` — `configured = Boolean(config.apiKeys[id])`. Нет ключа в env → провайдер «не настроен».
- `src/ui/ProviderPicker.tsx:20-41` — если ни один ключ не найден, приложение показывает тупиковый экран **«Добавь API-ключ в .env и перезапусти приложение»**. Это ломает первый запуск: юзер без ключа в env не может продолжить.
- Список провайдеров захардкожен из трёх (`src/agent/providers/types.ts:1`, `registry.ts:14-52`): `anthropic`, `openai`, `opencode-go`. Нет Gemini, Groq, OpenRouter, xAI, DeepSeek и др. При этом `opencode-go` — это кастомный алиас для OpenAI-compat, его логичнее обобщить.
- Приложение игнорирует уже настроенный `opencode` (его `auth.json`/`opencode.json`), хотя у целевого пользователя он почти наверняка есть — это дублирование усилий по вводу ключей.

Референсы:

- [opgginc/opencode-bar](https://github.com/opgginc/opencode-bar) — читает opencode-cred'ы без дополнительной настройки: `~/.local/share/opencode/auth.json` (Linux), `~/Library/Application Support/opencode/auth.json` (macOS), `$XDG_DATA_HOME/opencode/auth.json`.
- [opencode-ai/opencode](https://github.com/opencode-ai/opencode) — каталог провайдеров: `anthropic`, `openai`, `gemini`, `groq`, `openrouter`, `xai`, `azure`, `vertexai`, `bedrock`, `copilot` (`internal/llm/models/models.go`, `internal/llm/provider/`).

## Цели

1. **Интерактивная настройка.** Первый запуск без `.env` не блокируется: пользователь выбирает провайдера в TUI и вводит ключ прямо в терминале (с маской), без перезапуска.
2. **Импорт из opencode.** При обнаруженном `opencode`-конфиге при первом запуске предлагается: «Вижу, у вас настроен opencode — взять настройки провайдеров оттуда?» При согласии — ключи копируются, далее юзер выбирает конкретную модель.
3. **Полный набор провайдеров.** Добавить основных вендоров по референсу opencode: Anthropic, OpenAI, Google Gemini, Groq, OpenRouter, xAI, DeepSeek + произвольный OpenAI-compat endpoint (обобщение нынешнего `opencode-go`).

## Текущее состояние (ссылки)

| Что | Где | Суть |
|---|---|---|
| Чтение env | `src/config.ts:7,22` | `dotenv.config` + zod-схема, только 3 ключа |
| Каталог провайдеров | `src/agent/providers/registry.ts:14-52` | Хардкод 3 штук, `configured` по env |
| `ProviderId` | `src/agent/providers/types.ts:1` | `"anthropic" \| "openai" \| "opencode-go"` |
| `createProvider` | `src/agent/providers/index.ts:4-8` | Берёт ключ из `config.apiKeys` через `build()` |
| OpenAI-compat | `src/agent/providers/openai.ts:13-19` | Уже поддерживает `baseURL` (используется для `opencode-go`) |
| Anthropic | `src/agent/providers/anthropic.ts:13-18` | Нативный `@anthropic-ai/sdk` |
| Persistence | `src/persistence.ts:27-30` | `Preferences = { provider?, model? }` — **без ключей** |
| Bootstrap | `src/bootstrap.ts:27-41` | `resolveInitialProvider`: env → prefs → single configured → picker |
| Picker UI | `src/ui/ProviderPicker.tsx:20-41` | Тупик «добавь в .env» при отсутствии ключей |
| App routing | `src/App.tsx:19-29` | `Screen = bar \| selecting-provider \| menu \| exit-confirm` |
| Тесты | `src/tests/bootstrap.test.ts`, `src/tests/providers.test.ts`, `src/tests/ui.test.tsx` | Затронуты изменениями |

## Дизайн

### 4.1. Каталог провайдеров и моделей (новый файл `catalog.ts`)

Вынести декларативное описание провайдеров и моделей из `registry.ts` в отдельный модуль — единый источник правды для UI и сборки провайдеров.

```ts
// src/agent/providers/catalog.ts
export type ProviderKind = "anthropic" | "openai-compat";

export interface ModelDef {
  id: string;            // "claude-3-5-haiku-latest" — реальный API model id
  label: string;         // "Claude 3.5 Haiku" — для списка в UI
  canReason?: boolean;   // reasoning_content / thinking применим
  contextWindow?: number;
}

export interface ProviderCatalogEntry {
  id: string;            // "anthropic" | "openai" | "gemini" | "groq" | "openrouter" | "xai" | "deepseek" | "custom"
  label: string;         // "Anthropic (Claude)"
  kind: ProviderKind;    // какой адаптер использовать
  baseURL?: string;      // для openai-compat (DeepSeek/Groq/OpenRouter/xAI/Gemini-OpenAI)
  apiKeyEnv: string;     // "ANTHROPIC_API_KEY" — для .env override и подсказки в UI
  apiKeyUrl: string;     // ссылка «где получить ключ» — показывается в форме ввода
  models: ModelDef[];
  defaultModel: string;
}
```

Каталог (состав по `opencode-ai/opencode/internal/llm/models/*.go`, baseURL'ы — из `opencode/internal/llm/provider/*.go`):

| id | label | kind | baseURL | apiKeyEnv | defaultModel |
|---|---|---|---|---|---|
| `anthropic` | Anthropic (Claude) | `anthropic` | — | `ANTHROPIC_API_KEY` | `claude-3-5-haiku-latest` |
| `openai` | OpenAI (GPT) | `openai-compat` | — (default) | `OPENAI_API_KEY` | `gpt-4o-mini` |
| `gemini` | Google Gemini | `openai-compat` | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` | `gemini-2.0-flash` |
| `groq` | Groq | `openai-compat` | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| `openrouter` | OpenRouter | `openai-compat` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | `anthropic/claude-3.5-haiku` |
| `xai` | xAI (Grok) | `openai-compat` | `https://api.x.ai/v1` | `XAI_API_KEY` | `grok-3-mini-fast` |
| `deepseek` | DeepSeek | `openai-compat` | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| `custom` | Свой (OpenAI-compat) | `openai-compat` | (из preferences) | — | (из preferences) |

> `opencode-go` сохраняется как алиас `custom` на период миграции (см. §4.6). Модели внутри каждого провайдера — сокращённый набор ходовых (по 2–4 шт.), полный список избыточен для character-агента; расширить каталог можно без правки `registry.ts`.

### 4.2. Расширение `ProviderId` и типов

```ts
// src/agent/providers/types.ts
export type ProviderId =
  | "anthropic" | "openai" | "gemini" | "groq"
  | "openrouter" | "xai" | "deepseek" | "custom";
```

`build()` в `ProviderDef` больше не читает `config.apiKeys` — ключ передаётся снаружи (см. §4.3).

### 4.3. Единое хранилище credentials в preferences.json

`Preferences` хранит **карту** ключей `credentials` (провайдер → ключ) — чтобы повторный выбор провайдера не требовал ввода ключа заново. Но **активный выбор всегда один**: пара `{provider, model}` — единственная, с которой работает `createProvider` и ход бармена.

```ts
// src/persistence.ts
export interface Credentials {
  apiKey: string;
  baseURL?: string;   // для "custom"
}

export interface Preferences {
  provider?: ProviderId;   // ← единственный активный провайдер
  model?: string;          // ← единственная активная модель
  credentials?: Partial<Record<ProviderId, Credentials>>;  // кеш ключей
  importedFromOpencode?: boolean;  // маркер: импорт уже предлагался
}
```

**Разрешение ключа** (`resolveCredentials(providerId)` — новая чистая функция, тестируется):

1. `.env` (`config.apiKeys[id]` / `OPENAI_API_KEY` и т.д.) — **override**, для power-юзеров и CI. Старый `opencode-go` env-ключ маппится на `custom`.
2. `preferences.json` → `credentials[id]`.
3. `null` — не настроен.

Приоритет env сохраняет обратную совместимость: существующие пользователи с `.env` ничего не замечают.

### 4.4. Чтение opencode (новый модуль `opencode-import.ts`)

opencode хранит креды в двух местах ([источник](https://github.com/opencode-ai/opencode/blob/master/internal/config/config.go), [opencode-bar: TokenManager](https://zread.ai/opgginc/opencode-bar/11-tokenmanager-and-auth-discovery)):

**A. Конфиг** (`opencode.json`) — API-ключи в поле `providers.<id>.apiKey`:

```
~/.opencode.json
~/.config/opencode/opencode.json
$XDG_CONFIG_HOME/opencode/opencode.json
```

```json
{
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "openai":    { "apiKey": "sk-..." },
    "gemini":    { "apiKey": "AIza..." },
    "groq":      { "apiKey": "gsk_..." },
    "openrouter":{ "apiKey": "or-..." },
    "xai":       { "apiKey": "xai-..." }
  }
}
```

**B. Auth** (`auth.json`) — для OAuth-провайдеров (openai, github-copilot) и простых ключей (openrouter). Из него импортируем **только строковые `apiKey`-значения** (форматы `{key: "..."}` и голая строка); OAuth-токены (`{type: "oauth", access, refresh, expires}`) **пропускаем** — они не годятся для прямого API-вызова без refresh-логики.

```
$XDG_DATA_HOME/opencode/auth.json
~/.local/share/opencode/auth.json                     (Linux)
~/Library/Application Support/opencode/auth.json      (macOS, наш случай — platform=darwin)
```

Модуль:

```ts
// src/agent/providers/opencode-import.ts
export interface ImportedCredential {
  provider: ProviderId;
  apiKey: string;
  source: "opencode-config" | "opencode-auth";
}

export async function detectOpencode(): Promise<boolean>;       // есть ли хоть один файл
export async function importFromOpencode(): Promise<ImportedCredential[]>;
```

Маппинг имён opencode → наши `ProviderId` — прямое совпадение (`anthropic`, `openai`, `gemini`, `groq`, `openrouter`, `xai`). `bedrock`/`vertexai`/`azure`/`copilot` игнорируются (требуют нативных credential-флоу, вне scope). Маппинг устойчив к ошибкам: битые/отсутствующие файлы → пустой список, не падаем.

### 4.5. Интерактивная настройка — единый экран `provider`

**Принцип:** существует **один** экран мастера — `provider`, — покрывающий все сценарии: первый запуск, команда `/provider`, добавление нового провайдера, смена модели у уже настроенного. Разделения на «пикер» и «сетап» больше нет. Везде результат один — выбор ровно **одной** пары `(provider, model)` и возврат в бар.

#### Состояние-машина экрана `provider`

Экран держит внутренний шаг и выбранный `draftProvider`:

```
            ┌─────────────────────────────────────────┐
вход ─────▶│ step: "select-provider"                  │
            │  список провайдеров + «+ добавить»      │
            └───────────────┬─────────────────────────┘
                            │ choice
              ┌─────────────┴──────────────┐
              ▼                            ▼
   провайдер НАСТРОЕН             провайдер НЕ настроен / «+ добавить»
              │                            │
              │                            ▼
              │               step: "enter-key"  (ApiKeyInput)
              │               для "custom" — ещё "enter-base-url"
              │                            │ подтверждение
              │                            │
              └─────────────┬──────────────┘
                            ▼
              step: "select-model"  (ModelPicker)
                            │ выбор
                            ▼
              saveCredentials() → setProvider(id, model) → go("bar")
```

- Выбор уже настроенного провайдера → шаг `enter-key` **пропускается**, сразу `select-model`. Это и есть сценарий «выбрать тот же и сменить модель».
- Выбор ненастроенного или «+ добавить нового» → шаг ввода ключа, затем модель.
- Для `custom` между ключом и моделью — дополнительный шаг ввода `baseURL`.
- На любом шаге кроме первого — `ESC` возвращает на шаг назад (не выходит из мастера).

#### Точки входа на экран `provider`

1. **Первый запуск без активной пары** — после опц. предложения импорта opencode (см. ниже), `bootstrap` открывает `provider` сразу на `step: "select-provider"`.
2. **Команда `/provider`** (новая, `agent/commands.ts`) — из бара открывает тот же экран `provider`. Эквивалент «сменить модель или провайдер». Добавляется в `COMMANDS` (`commands.ts:16`) и `HELP` (`commands.ts:6`) для попапа команд.
3. **`/settings → Провайдер LLM`** (`SettingsMenu.tsx:24`) — ведёт на `provider` (alias точки 2, для discoverability).

#### Команда `/provider`

```ts
// agent/commands.ts
{ name: "/provider", label: "сменить провайдера или модель" }
```

`handleCommand("/provider")` — как `/settings` (`commands.ts:40-46`): проверка `store.busy`, затем `useAppStore.getState().go("provider")`.

#### `Screen` и роутинг

`Screen` (`src/state/app.ts`) заменяет/расширяется:

```ts
export type Screen =
  | "bar" | "provider"          // единый мастер (бывшие selecting-provider + provider-setup)
  | "opencode-import"           // предложение импорта при первом запуске
  | "menu" | "exit-confirm";
```

`selecting-provider` и `provider-setup` **объединяются** в один экран `provider`. `App.tsx` (`src/App.tsx:19-29`) роутит `case "provider": return <ProviderSetup/>` (компонент один, внутренние шаги — его стейт).

#### Компонент `ProviderSetup.tsx` (новый, замена `ProviderPicker.tsx`)

Один компонент с внутренним `useState<Step>`. Переиспользует `SelectList` и `ink-text-input` (уже в зависимостях, `package.json:54`, используется в `InputBox.tsx:2`).

**Шаг `select-provider`** — список из `catalog.ts`:

```
  Провайдер и модель

    ▸ [текущий]  Anthropic (Claude)   · claude-3-5-haiku-latest
      [настроен] OpenAI (GPT)         · gpt-4o-mini
      [настроен] OpenRouter           · anthropic/claude-3.5-haiku
      Gemini            (ключ не задан)
      Groq              (ключ не задан)
      xAI (Grok)        (ключ не задан)
      DeepSeek          (ключ не задан)
      Своё (OpenAI-compat)            (ключ не задан)
    + Добавить / заменить ключ…

  ↑/↓ + Enter · ESC — назад
```

- `[текущий]` — маркер активного провайдера (`useAppStore.providerId`), рядом — активная модель.
- `[настроен]` — есть ключ в `credentials`/env, но не активный.
- `+ Добавить / заменить ключ…` — принудительный шаг `enter-key` для любого провайдера (замена ключа, либо настройка нового, который ещё без ключа).
- При нуле настроенных провайдеров — список тот же, просто все без `[настроен]`; тупиковой ветки «добавь в .env» (`ProviderPicker.tsx:20-41`) **больше нет**.

**Шаг `enter-key`** (`ApiKeyInput`, новый) — `ink-text-input` с маской:

```
  Ключ для Gemini
  API-ключ: AIza•••••••••••••••••
  Где получить: https://aistudio.google.com/apikey
  Enter — подтвердить · ESC — назад
```

Для `custom` — дополнительный шаг `enter-base-url` (тот же инпут, плейсхолдер `https://api.example.com/v1`).

**Шаг `select-model`** (`ModelPicker`, новый, поверх `SelectList`) — список `entry.models` из каталога, курсор на `entry.defaultModel` (или на текущей модели, если меняют у активного):

```
  Модель для Anthropic (Claude)
    ▸ Claude 3.5 Haiku   (по умолчанию)
      Claude Sonnet 4
      Claude 3 Opus
  ↑/↓ + Enter · ESC — назад
```

Завершение: `saveCredentials(id, {apiKey, baseURL?})` → `setProvider(id, model)` → `go("bar")`. Ключ пишется в `preferences.json` (карта `credentials`), **не в `.env`**.

#### Экран `opencode-import` (новый `ui/OpencodeImport.tsx`) — только первый запуск

Показывается **один раз** при первом запуске, если нет активной пары, нет ключей, но opencode-конфиг найден. После выбора (Да/Нет) управление всегда переходит на экран `provider`.

```
Вижу, у вас настроен opencode. Взять настройки провайдеров оттуда?
  ▸ Да, импортировать из opencode        (найдено: anthropic, openrouter)
    Нет, ввести ключи вручную
```

- «Да» — `importFromOpencode()` пишет `credentials` в `preferences.json` (ставит `importedFromOpencode: true`), затем `go("provider")`: импортированные провайдеры помечены `[настроен]`, юзер выбирает модель.
- «Нет» — `go("provider")` с пустыми кред, юзер вводит ключ через `+ добавить`.

Формулировка — русская; экран системный (до начала вечера), образ бармена не нарушается. Повторно `opencode-import` не показываем: `importedFromOpencode` в prefs (или флаг `opencodeImportDismissed`) подавляет. Повторный импорт доступен через пункт в `/settings`.

#### `SettingsMenu.tsx`

Пункт «Провайдер LLM» (`SettingsMenu.tsx:24`) переименовывается в «Сменить провайдера / модель» и ведёт на экран `provider`. Дополнительно можно оставить отдельный пункт «Импорт из opencode» (опц.).

### 4.6. Обратная совместимость

- `.env` остаётся как **override**: `config.ts` читает `dotenv.config` как раньше, но `resolveCredentials` проверяет env **первым**. Существующие `.env`-пользователи ничего не теряют.
- `opencode-go` → маппится на `custom` (сохранением `OPENCODE_GO_BASE_URL` и `OPENCODE_GO_API_KEY` как кред `custom` при первом запуске). `BARTENDER_PROVIDER=opencode-go` в env/prefs мигрируется автоматически.
- `preferences.json` старого формата (`{provider, model}` без `credentials`) — валиден, ключ берётся из env как раньше.
- `package.json` scripts `--env-file=.env` остаётся; `.env.example` обновляется: убираем обязательность, добавляем комментарий про TUI-настройку.

### 4.7. Сборка провайдера

`createProvider(id, model?)` переписывается: ключ и `baseURL` берутся из `resolveCredentials(id)`, далее по `kind` из каталога выбирается адаптер:

```ts
// src/agent/providers/index.ts
export function createProvider(id: ProviderId, model?: string): LLMProvider {
  const entry = getCatalogEntry(id);
  const cred = resolveCredentials(id);
  if (!cred) throw new Error(`Провайдер ${id} не настроен. Команда /provider — выбрать и настроить.`);
  const modelId = model ?? entry.defaultModel;
  return entry.kind === "anthropic"
    ? new AnthropicProvider(cred.apiKey, modelId)
    : new OpenAIProvider(cred.apiKey, modelId, cred.baseURL ?? entry.baseURL);
}
```

`registry.ts` сокращается до тонкой обёртки над `catalog.ts` + `resolveCredentials` (оставляем `PROVIDERS`/`configuredProviderIds` для back-compat в тестах и `SettingsMenu`).

## Затронутые файлы

**Новые:**
- `src/agent/providers/catalog.ts` — каталог провайдеров + моделей (замена хардкоду).
- `src/agent/providers/opencode-import.ts` — чтение `opencode.json`/`auth.json`, `detectOpencode`, `importFromOpencode`.
- `src/agent/providers/credentials.ts` — `resolveCredentials` (чистая функция приоритета env → prefs) + `saveCredentials`.
- `src/ui/ProviderSetup.tsx` — **единый** мастер выбора провайдера и модели (замена `ProviderPicker.tsx`): внутренняя state-машина `select-provider → enter-key (+enter-base-url) → select-model`.
- `src/ui/OpencodeImport.tsx` — экран предложения импорта (только первый запуск).
- `src/ui/ApiKeyInput.tsx` — инпут с маской (поверх `ink-text-input`).
- `src/ui/ModelPicker.tsx` — шаг выбора модели из каталога (переиспользует `SelectList`).

**Изменяемые:**
- `src/agent/providers/types.ts` — расширить `ProviderId`, без `opencode-go` как базового id.
- `src/agent/providers/registry.ts` — генерировать `ProviderDef[]` из `catalog.ts`, `configured` через `resolveCredentials`.
- `src/agent/providers/index.ts` — `createProvider` через `kind` + `resolveCredentials`.
- `src/agent/commands.ts` — команда `/provider` (в `COMMANDS`, `HELP`, `handleCommand`), открывает экран `provider`.
- `src/config.ts` — оставить env override, расширить zod-схему новыми ключами (`GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `DEEPSEEK_API_KEY`); `opencode-go` → алиас.
- `src/persistence.ts` — расширить `Preferences` (`credentials`, `importedFromOpencode`, `opencodeImportDismissed`), оставить миграцию формата.
- `src/bootstrap.ts` — `resolveInitialProvider` учитывает `opencode-import`/`provider` как стартовые экраны; вызвать `detectOpencode()` в `bootstrap()`.
- `src/state/app.ts` — `Screen` с единым `provider` (вместо `selecting-provider`).
- `src/ui/SettingsMenu.tsx` — пункт «Сменить провайдера / модель» → экран `provider` (alias `/provider`).
- `src/App.tsx` — роутинг: `case "provider"` и `case "opencode-import"`.
- `.env.example` — обновить (новые переменные, пометка «опционально, настраивается в TUI»).

**Удаляемые:**
- `src/ui/ProviderPicker.tsx` — поглощается `ProviderSetup.tsx` (единый экран `provider`).

## Тесты

Витeст, рядом с кодом (`src/tests/`):

- **`catalog.test.ts`** (новый) — каталог: у каждого entry есть `defaultModel`, `defaultModel ∈ models`, `apiKeyEnv`/`kind` корректны; неизменность id'шников (контракт).
- **`opencode-import.test.ts`** (новый) — мок `fs`/`os.homedir`: чтение `opencode.json` (`providers.anthropic.apiKey`), `auth.json` (строковый openrouter-ключ — берём; OAuth openai — пропускаем), пустые/битые файлы → `[]`, выбор пути по платформе.
- **`credentials.test.ts`** (новый) — `resolveCredentials`: env > prefs; env пуст → prefs; ничего → `null`; маппинг легаси `opencode-go` → `custom`.
- **`persistence.test.ts`** (новый) — round-trip `credentials` в `preferences.json`, миграция старого формата без потерь, `importedFromOpencode`/`opencodeImportDismissed` сохраняются.
- **`bootstrap.test.ts`** (обновить) — новые ветки `resolveInitialProvider`: `opencode-import` при наличии opencode-конфига и отсутствии ключей; `provider` при пустоте; старые кейсы (env/prefs/single) сохраняются; миграция `opencode-go`→`custom`.
- **`providers.test.ts`** (обновить) — `OpenAIProvider` для `gemini`/`groq`/`openrouter` с корректным `baseURL`; `createProvider` бросает понятную ошибку при отсутствии кред.
- **`ui.test.tsx`** (обновить, `ink-testing-library`) — `ProviderSetup`: (а) выбор уже настроенного провайдера → сразу шаг `select-model` (без ввода ключа); (б) выбор ненастроенного → шаг `enter-key` → `select-model`; (в) `ESC` возвращает на шаг назад; (г) завершение вызывает `setProvider(id, model)` и `go("bar")`. `OpencodeImport`: выбор Да/Нет. Команда `/provider` (`commands.test.ts`, если есть — иначе тут же) открывает экран `provider`.

Ручная проверка: `npx tsx scripts/smoke.ts` — для каждого провайдера из каталога (с реальным ключом) стрим + tool call; `scripts/smoke-turn.ts` — полный ход.

## Оценка усилия

**L** — крупное изменение: слой провайдеров, персистентность, бутстрап, UI (2 новых экрана + команда).

| Часть | Оценка |
|---|---|
| `catalog.ts` + типы + `registry`/`index` рефактор | M |
| `credentials.ts` + расширение `persistence.ts` | S |
| `opencode-import.ts` (чтение двух форматов, маппинг) | M |
| UI: единый `ProviderSetup` (state-машина), `OpencodeImport`, `ApiKeyInput`, `ModelPicker`; удаление `ProviderPicker` | M |
| `/provider` команда (`commands.ts`) | S |
| `bootstrap.ts` + `app.ts` (новые экраны/флоу) | S |
| Тесты (4 новых + 3 обновляемых) | S–M |
| Миграция `opencode-go`→`custom`, обновление `.env.example`/`config.ts` | S |

## Риски и открытые вопросы

1. **OAuth из `auth.json`.** OpenAI/GitHub Copilot в opencode хранятся как OAuth (`access`/`refresh`/`expires`). Прямой импорт невозможен без реализации refresh-флоу. Решение: **пропускаем** OAuth-записи, импортируем только `apiKey`-форматы (большинство личных ключей). Если в будущем понадобится — отдельная SPEC по OAuth.
2. **Безопасность ключей в `preferences.json`.** Плейнтекст в `~/.bartender-agent/preferences.json` — тот же уровень доверия, что у `.env` и `~/.opencode.json`. Файл создаётся с `0o600` (доработать `savePreferences`, сейчас `writeFile` без режима). Не коммитим (уже в `.gitignore`? — проверить).
3. **`gemini` через OpenAI-compat.** opencode использует `generativelanguage.googleapis.com/v1beta/openai/` — поддерживает tool calls. Если нужны нативные фичи Gemini (multimodal grounding) — завести `kind: "gemini"` и нативный адаптер позже (вне scope этой SPEC).
4. **Количество моделей в каталоге.** Спека deliberately включает ходовые 2–4 модели на провайдер (не весь реестр opencode) — для character-агента избыточно. Расширение — правка `catalog.ts` без затрагивания остального.
5. **Имя `opencode-go`.** Логично убрать полностью и заменить на `custom`, но это ломает сохранённые `preferences.json` у существующих пользователей. Решение: при `loadPreferences` миграция `provider:"opencode-go"` → `provider:"custom"` + `credentials.custom = {apiKey: env.OPENCODE_GO_API_KEY, baseURL: env.OPENCODE_GO_BASE_URL}`.
6. **Повторный показ предложения импорта.** Если юзер отказался — не спрашивать каждый запуск: сохранять `importedFromOpencode: true` (или отдельный флаг `opencodeImportDismissed`). Повторно доступно через `/settings`.

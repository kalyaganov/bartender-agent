# SPEC — Примитивная настройка провайдера (одна форма)

> Каталог из 11 провайдеров, opencode-импорт, state-машина выбора и env-var override заменяются **одной формой**: endpoint, token, model, thinking on/off. Цель — минимально жизнеспособный конфиг для одного юзера с одним OpenAI-compat эндпоинтом.

- [SPEC.md](./SPEC.md) · [SPEC-providers.md](./SPEC-providers.md) (уступает место этой SPEC — считать superseded) · [BACKLOG.md](./BACKLOG.md)

---

## Проблема

Текущий слой провайдеров (см. `SPEC-providers.md`, `SPEC-provider-layer.md`) — оверкилл для практики:

- **11 захардкоженных вендоров** в `src/agent/providers/catalog.ts` (190 строк). На практике юзер использует 1.
- **opencode-импорт** (~170 строк + 16 тестов) — логика обнаружения файлов opencode, маппинга имён вендоров, OAuth-фильтрации. Не нужно.
- **`ProviderSetup.tsx`** — state-машина из 4 шагов: select-provider → enter-key → enter-base-url → select-model. Слишком сложно.
- **`BARTENDER_PROVIDER` env + 12 `*_API_KEY` env vars** в `src/config.ts:11-31` — мёртвая поверхность (никто не пользуется).
- **Каталог фиксирует model id**, которые у реальных провайдеров меняются (`glm-4.6` → `glm-5.2`, `deepseek-v4-pro`, и т.д.). Каталог вечно отстаёт, юзер всё равно правит `preferences.json` руками и ошибается (см. инцидент: забытый суффикс `/chat/completions`, несуществующий id `custom-model`).

## Цели

1. **Один экран настройки.** Форма из 4 полей: endpoint, token, model, thinking on/off. Один скрин, без шагов.
2. **Один источник правды.** `preferences.json` с плоской схемой `{endpoint, token, model, thinking}`. Никаких каталогов, карт кред, миграций.
3. **Удалить всё лишнее.** Каталог, registry, opencode-импорт, credentials, native Anthropic-адаптер, env-var override. Остаётся только `OpenAIProvider`.
4. **Thinking как пользовательский флаг.** Юзер сам выбирает, передавать ли `reasoning: {budgetTokens}` — мы не угадываем по модели.

## Текущее состояние (ссылки)

| Что | Где | Суть |
|---|---|---|
| Каталог | `src/agent/providers/catalog.ts` | 11 вендоров, фиксированные модели |
| `ProviderId` | `src/agent/providers/types.ts:1-12` | 12 вариантов |
| opencode-импорт | `src/agent/providers/opencode-import.ts` | ~170 строк |
| registry | `src/agent/providers/registry.ts` | thin view over catalog |
| credentials | `src/agent/providers/credentials.ts` | env-priority resolver + `prefsCache` |
| env-vars | `src/config.ts:11-31` | zod-схема с 12 ключами + baseURLs |
| UI мастер | `src/ui/ProviderSetup.tsx` | state-машина 4 шагов (189 строк) |
| ApiKeyInput/BaseURL/ModelPicker | `src/ui/ApiKeyInput.tsx`, `src/ui/ModelPicker.tsx` | 3 вспомогательных компонента |
| OpencodeImport screen | `src/ui/OpencodeImport.tsx` | экран предложения импорта |
| Anthropic adapter | `src/agent/providers/anthropic.ts` | native `@anthropic-ai/sdk` |
| Preferences | `src/persistence.ts:15-21` | `{provider?, model?, credentials?, importedFromOpencode?, opencodeImportDismissed?}` |
| Bootstrap | `src/bootstrap.ts` | `resolveInitialProvider` с 5 ветками |
| State | `src/state/app.ts:11-20` | `providerId`, `model`, Screen с `provider`/`opencode-import` |
| Команды | `src/agent/commands.ts:7,18,48-54` | `/provider` команда |
| SettingsMenu | `src/ui/SettingsMenu.tsx:6,23-28` | Catalog lookup для показа провайдера |

## Дизайн

### 4.1. Новая схема `Preferences`

```ts
// src/persistence.ts
export interface Preferences {
  endpoint?: string;   // "https://opencode.ai/zen/go/v1"
  token?: string;      // "sk-..."
  model?: string;      // "deepseek-v4-pro"
  thinking?: boolean;  // true → передаём reasoning: {budgetTokens}
}

export function isConfigured(p: Preferences): boolean {
  return !!(p.endpoint && p.token && p.model);
}
```

Старые поля (`provider`, `credentials`, `importedFromOpencode`, `opencodeImportDismissed`) игнорируются при загрузке. **Мягкая миграция один раз:** если в старом файле есть `credentials.custom.{apiKey, baseURL}` + `model`, переносим в `{endpoint: baseURL, token: apiKey, model}`. Иначе — стартуем с пустого экрана setup.

### 4.2. Новый `createProvider`

```ts
// src/agent/providers/index.ts
export interface ProviderConfig {
  endpoint: string;
  token: string;
  model: string;
  thinking: boolean;
}

export function createProvider(cfg: ProviderConfig): LLMProvider {
  return new OpenAIProvider({
    apiKey: cfg.token,
    model: cfg.model,
    baseURL: cfg.endpoint,
    capabilities: { supportsTools: true, supportsReasoning: cfg.thinking },
  });
}
```

`ProviderId`, `catalog.ts`, `registry.ts`, `opencode-import.ts`, `credentials.ts`, `anthropic.ts` — **удаляются**.

### 4.3. `types.ts` — без `ProviderId`

`ProviderId` убирается. Остаются контрактные типы: `LLMProvider`, `StreamPart`, `Message`, `ToolSpec`, `GenerationConfig`, `ToolChoice`, `Usage`, `ProviderCapabilities`, и т.д.

### 4.4. `loop.ts` — reasoning из prefs

```ts
function getProvider(): LLMProvider {
  const { prefs } = useAppStore.getState();
  if (!isConfigured(prefs)) throw new Error("Провайдер не настроен. /setup.");
  return createProvider({
    endpoint: prefs.endpoint!,
    token: prefs.token!,
    model: prefs.model!,
    thinking: prefs.thinking ?? false,
  });
}

// в executeTurn:
const generation: GenerationConfig = {
  temperature: config.generation.temperature,
  maxOutputTokens: config.generation.maxOutputTokens,
  ...(useAppStore.getState().prefs.thinking
    ? { reasoning: { budgetTokens: config.reasoning.budgetTokens } }
    : {}),
};
```

### 4.5. `config.ts` — чистка

Удаляем zod-схему с 12 API-ключами и `PROVIDER_CATALOG` импорт. Остаются только настройки движка (`loop`, `ui`, `generation`, `drunkenness`, `reasoning`, `disclaimer`). `dotenv` убирается — env override больше не нужен.

### 4.6. UI: один экран `setup`

`ProviderSetup.tsx` (и `ApiKeyInput.tsx`, `ModelPicker.tsx`) удаляются. Новый `src/ui/SetupScreen.tsx` — простая форма с навигацией по полям Tab:

```
  Настройка бармена

  Endpoint:  https://opencode.ai/zen/go/v1
  Token:     sk-•••••••••••••••••
  Модель:    deepseek-v4-pro
  Thinking:  [✓] ON

  ↑/↓ или Tab — поле · Enter — сохранить · ESC — отмена
```

- Все поля — `ink-text-input` (Token с маской).
- Thinking — переключается пробелом/Enter.
- Сохранение → `savePreferences({endpoint, token, model, thinking})` → `setPrefs(next)` → `go("bar")`.

### 4.7. `state/app.ts` — упрощение

```ts
export type Screen = "bar" | "setup" | "menu" | "exit-confirm";

interface AppState {
  screen: Screen;
  prevScreen: Screen;
  prefs: Preferences;
  go: (screen: Screen) => void;
  back: () => void;
  setScreen: (screen: Screen) => void;
  setPrefs: (prefs: Preferences) => void;
}
```

`providerId`/`model`/`setProvider`/`opencode-import` — уходят. Активный провайдер = `prefs` целиком.

### 4.8. `bootstrap.ts` — простое решение

```ts
export function resolveInitialScreen(prefs: Preferences): "bar" | "setup" {
  return isConfigured(prefs) ? "bar" : "setup";
}

export async function bootstrap(): Promise<void> {
  const prefs = await loadPreferences();
  const store = useAppStore.getState();
  store.setPrefs(prefs);
  store.setScreen(resolveInitialScreen(prefs));
}
```

### 4.9. Команды

`/provider` → `/setup`. Те же semantics: открыть экран настройки. `HELP` и `COMMANDS` обновляются.

## Затронутые файлы

**Удаляемые:**
- `src/agent/providers/catalog.ts`
- `src/agent/providers/registry.ts`
- `src/agent/providers/opencode-import.ts`
- `src/agent/providers/credentials.ts`
- `src/agent/providers/anthropic.ts`
- `src/ui/OpencodeImport.tsx`
- `src/ui/ProviderSetup.tsx`
- `src/ui/ApiKeyInput.tsx`
- `src/ui/ModelPicker.tsx`
- `src/tests/catalog.test.ts`
- `src/tests/opencode-import.test.ts`
- `src/tests/credentials.test.ts`
- `src/tests/anthropic.test.ts`
- `src/tests/registry.test.ts`
- `src/tests/ui-providers.test.tsx`

**Новые:**
- `src/ui/SetupScreen.tsx` — единая форма настройки
- `src/tests/ui-setup.test.tsx` — тест формы

**Существенно переписываемые:**
- `src/agent/providers/types.ts` — убрать `ProviderId`
- `src/agent/providers/index.ts` — новый `createProvider(cfg)`
- `src/persistence.ts` — новая схема `Preferences` + мягкая миграция
- `src/config.ts` — выкинуть env API keys + dotenv
- `src/bootstrap.ts` — `resolveInitialScreen`
- `src/state/app.ts` — упрощённый Screen без `provider`/`opencode-import`
- `src/agent/loop.ts` — reasoning из prefs, новый `getProvider()`
- `src/agent/commands.ts` — `/setup` вместо `/provider`
- `src/ui/SettingsMenu.tsx` — без catalog-зависимостей, пункт «Настроить провайдера» → экран `setup`
- `src/App.tsx` — роутинг `case "setup"`

**Обновляемые тесты:**
- `src/tests/persistence.test.ts` — новая схема + миграция
- `src/tests/bootstrap.test.ts` — `resolveInitialScreen`
- `src/tests/loop.test.ts` — мок-провайдер без `providerId`
- `src/tests/providers.test.ts` — оставить только `OpenAIProvider` стриминг/тулзы (drop `createProvider` старого API)
- `src/tests/ui.test.tsx` — `/provider` → `/setup` в `matchCommands`

**Прочие:**
- `scripts/smoke.ts`, `scripts/smoke-turn.ts` — адаптация под новый `createProvider(cfg)`
- `~/.bartender-agent/preferences.json` — миграция на новую схему

## Оценка усилия

**M** — массовые удаления + новый экран. Основной риск — пропустить ссылку на удалённый символ.

| Часть | Оценка |
|---|---|
| Удаление catalog/registry/opencode-import/credentials/anthropic + 5 тестов | S |
| Новая persistence + мягкая миграция | S |
| Новый `createProvider(cfg)` + правки loop/types/config | S |
| Новый `SetupScreen` (форма 4 полей) | S–M |
| bootstrap/app/commands/SettingsMenu/App правки | S |
| Тесты (3 переписать, 1 новый) | S–M |
| smoke-скрипты + миграция preferences.json | S |

## Риски и открытые вопросы

1. **Потеря native Anthropic.** Claude-via-OpenAI-compat поддерживается (Anthropic отдаёт `/v1/messages` через совместимый эндпоинт с beta-header, либо через OpenRouter). Без native SDK теряем стриминговые нюансы. Принять — юзер сам указывает нужный endpoint.
2. **Thinking toggle — слабая семантика.** Не все OpenAI-compat эндпоинты принимают `reasoning: {budgetTokens}`. Поведение: если эндпоинт режектит — юзер выключает тумблер. Документировать в UI.
3. **Старые `.env` юзеры.** Теряют override. Мотивация: primitive setup = UI-only. Принять.
4. **Миграция preferences.json.** Если у юзера только `credentials.zai`/`minimax` (как было в этом репо) — миграция невозможна, стартуем с пустой формы. Принять.
5. **Совместимость с existing SPECs.** `SPEC-providers.md` и `SPEC-provider-layer.md` формально устаревают. Не удалять (история), но пометить superseded ссылками на эту SPEC.

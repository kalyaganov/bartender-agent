# PLAN — Экраны: выход по ESC, выбор провайдера, меню

> Спецификация/план трёх связанных изменений поверх [SPEC.md](./SPEC.md)/[PLAN.md](./PLAN.md):
> 1. Выход с подтверждением по **ESC** (и Ctrl+C — тоже через подтверждение).
> 2. Поддержка нескольких провайдеров LLM с выбором при старте, если не выбрано.
> 3. Меню (`/settings`) с пунктом смены провайдера LLM.
>
> Обозначения усилия: **S** ≤ 30 мин, **M** ~1–2 ч, **L** ~полдня.

---

## Текущее состояние (что задаёт ограничения)

- `src/config.ts` — провайдер/модель из env (`BARTENDER_PROVIDER`), замороженный `const`.
- `src/agent/providers/index.ts:6` — `createProvider()` читает статичный `config.provider`.
- `src/agent/loop.ts:7-12` — провайдер кешируется в module-level `let`, переключиться нельзя.
- `src/App.tsx:31-36` — выход только по Ctrl+C → мгновенный `process.exit(0)`; `src/index.tsx:5` — `exitOnCtrlC:false`.
- `src/agent/commands.ts:23` — `/exit` = мгновенный `process.exit(0)`.
- Нет понятия «экран/режим»: `App.tsx` всегда рисует бар. Нет персистентности.

---

## 1. Архитектурные изменения (фундамент)

### 1.1 Router экранов в `App.tsx`
Вводится понятие текущего экрана; `App` становится роутером:

```
screen ∈ 'bar' | 'selecting-provider' | 'menu' | 'exit-confirm'
```

- `selecting-provider` — стартовый, если провайдер не выбран (см. §3).
- `bar` — основной (нынешний layout `App.tsx` переезжает в `src/ui/BarScreen.tsx` без изменений).
- `menu` — экран меню (§4).
- `exit-confirm` — оверлей подтверждения выхода (§2).

### 1.2 Новый `src/state/app.ts` (appStore, zustand)
Отдельный стор для **прикладных**, не сессионных данных (не сбрасывается вместе с сессией, не мешает `store.reset()`):

```ts
type Screen = 'bar' | 'selecting-provider' | 'menu' | 'exit-confirm';

interface AppState {
  screen: Screen;
  prevScreen: Screen;                 // для возврата из menu/exit-confirm
  providerId: ProviderId | null;
  // навигация
  go(screen: Screen): void;           // запоминает prevScreen
  back(): void;                       // screen = prevScreen ?? 'bar'
  // провайдер
  setProvider(id: ProviderId): void;  // валидация + инвалидация кеша в loop.ts + savePreferences
}
```

Сессионный `src/state/store.ts` **не трогается**.

### 1.3 Реестр провайдеров `src/agent/providers/registry.ts`
Единое место метаданных (сейчас разнесено по `config.ts` + `providers/index.ts`):

```ts
type ProviderId = 'anthropic' | 'openai' | 'opencode-go';

interface ProviderDef {
  id: ProviderId;
  label: string;        // "OpenCode Go (deepseek-v4-pro)"
  defaultModel: string;
  configured: boolean;  // ключ присутствует в env
  build(): LLMProvider;
}

export const PROVIDERS: ProviderDef[];        // только configured=true (для пикеров)
export const ALL_PROVIDERS: ProviderDef[];
export function getProviderDef(id: ProviderId): ProviderDef | undefined;
```

`createProvider(id?)` в `providers/index.ts` переписывается на чтение из реестра/runtime-стора (вместо `config.provider`).

### 1.4 Персистентность `src/persistence.ts`
`~/.homeagent/preferences.json` → `{ provider, model }`. Функции `loadPreferences()` / `savePreferences()` с try/catch (без падений). Используется только для стартового выбора провайдера.

---

## 2. Фича 1 — Выход с подтверждением (ESC и Ctrl+C)

### 2.1 UX
- **ESC** или **Ctrl+C** в любом экране → `screen='exit-confirm'`.
- Оверлей: *«Уже уходишь? ESC / Y / Enter — подтвердить, любая другая клавиша — остаться»*.
- В `exit-confirm`: **ESC** / **Y** / **Enter** / **Ctrl+C** → прощальная реплика (нынешний текст Ctrl+C) + `process.exit(0)`; любая иная клавиша → `back()`.
- Авто-отмена через 5 с (nice-to-have).
- **`/exit`** из командной строки теперь тоже ведёт через `exit-confirm` (вместо мгновенного `process.exit`).
- Оба пути (ESC, Ctrl+C) единообразны — мгновенного выхода больше нет. `exitOnCtrlC:false` остаётся.

### 2.2 Что меняется
- `src/ui/ExitConfirm.tsx` (новый) — оверлей + `useInput` (обработка ESC/Y/Enter/Ctrl+C/иная клавиша).
- `src/ui/BarScreen.tsx` — `useInput` ловит `key.escape` и `key.ctrl && input==='c'` → `app.go('exit-confirm')`.
- `src/agent/commands.ts` — `/exit` → `app.go('exit-confirm')` вместо `process.exit`.

### 2.3 Влияние на `busy`
- Если стрим идёт (`busy=true`): подтверждение выхода сначала **абортит** ход (есть `AbortSignal` в `loop.ts:85`), затем выходит.
- Открытие меню во время `busy` блокируется (см. §4); выход — всегда разрешён с abort.

---

## 3. Фича 2 — Несколько провайдеров, выбор при старте

### 3.1 Приоритет стартового выбора
```
env BARTENDER_PROVIDER  →  preferences.json  →  null (показать пикер)
```
- env задаёт «выбранный» явно → пикер **не** показывается (обратно-совместимо).
- Нет env и нет prefs → `screen='selecting-provider'`.

### 3.2 UX стартового пикера
- Список только `configured=true` провайдеров (ключи есть в env).
- Навигация ↑/↓ + Enter (или цифра); подсветка текущего.
- **0** настроенных → экран-инструкция: «Добавь ключ в `.env`» + выход.
- **1** настроенный → автавыбор, пикер пропускается (доступен через меню).
- Итого пикер **показывается** только когда провайдер «не выбран»: нет env, нет prefs **и** настроенных > 1. Если выбор уже сделан (env / prefs / единственный настроенный) — старт сразу в `bar`.
- Выбор → `savePreferences()` + `app.setProvider(id)` + `go('bar')`.

### 3.3 Runtime-переключение
- `app.setProvider(id)`:
  1. валидация через реестр (`configured`);
  2. сбрасывает кеш провайдера в `loop.ts` (см. §3.4);
  3. `savePreferences({provider})`.
- История диалога провайдер-агностична (plain messages) — переключение безопасно, сессия **не** сбрасывается.

### 3.4 `src/agent/loop.ts`
- Убрать module-level `let provider`. `getProvider()` читает `appStore.providerId`, создаёт через `createProvider(id)` и кеширует до смены. `app.setProvider` инвалидирует кеш.

---

## 4. Фича 3 — Меню (`/settings`) с пунктом смены провайдера

### 4.1 Триггер
- Команда **`/settings`** (консистентно с `/menu`, `/help`) открывает экран меню. Других триггеров нет.

### 4.2 UX меню (`src/ui/SettingsMenu.tsx`)
Полноэкранный список, навигация ↑/↓ + Enter, `ESC` — назад в бар (через `back()`):
```
 — Меню —
 ▸ Провайдер LLM:  opencode-go
   Перезапустить вечер
   Помощь
   Выйти
```
Пункты (все в первой итерации):
1. **Провайдер LLM** → открывает `ProviderPicker` (тот же компонент, что на старте) → выбор меняет провайдер в рантайме → возврат в меню. Текущий провайдер виден в строке пункта.
2. **Перезапустить вечер** → `useStore.getState().reset()` (существующий метод) + системная реплика *«Новый вечер, чистая стойка.»* + `go('bar')`. Текущий провайдер сохраняется.
3. **Помощь** → вывод текста `HELP` (переиспользовать из `agent/commands.ts`) системной репликой + возврат в меню.
4. **Выйти** → `go('exit-confirm')`.

### 4.3 Переиспользование
`ProviderPicker` — один компонент для стартового выбора и смены из меню. Параметр `mode: 'startup' | 'switch'` управляет заголовком и поведением отмены (на startup отменить нельзя, если нет сохранённого выбора; на switch — ESC возвращает в меню).

### 4.4 Блокировка во время `busy`
- Открытие меню через `/settings` во время `busy` отклоняется системной репликой *«Виктор отвечает, подожди секунду…»*.

---

## 5. План реализации (задачи)

| ID | Задача | Файлы | Усилие |
|----|--------|-------|--------|
| **A1** | `state/app.ts`: appStore (`screen`, `providerId`, навигация, `setProvider`) | new | M |
| **A2** | `providers/registry.ts`: реестр `ProviderDef` + `configured`; переписать `createProvider(id?)` | new, `providers/index.ts` | M |
| **A3** | `persistence.ts`: load/save preferences | new | S |
| **A4** | `loop.ts`: убрать module-level кеш, читать провайдер из appStore, инвалидация при смене | `loop.ts` | S |
| **B1** | `ui/BarScreen.tsx`: вынести layout из `App.tsx` 1-в-1 | new, `App.tsx` | S |
| **B2** | `App.tsx`: роутер экранов по `app.screen` | `App.tsx` | S |
| **B3** | `ui/SelectList.tsx`: переиспользуемый список ↑/↓+Enter | new | S |
| **C1** | `ui/ExitConfirm.tsx`: оверлей + логика подтверждения (§2) | new | S |
| **C2** | ESC/Ctrl+C → exit-confirm в `bar`; `/exit` роутит в confirm | `BarScreen.tsx`, `commands.ts` | S |
| **C3** | Abort текущего хода при выходе во время `busy` | `loop.ts` | S |
| **D1** | `ui/ProviderPicker.tsx`: стартовый выбор + switch (mode) | new | M |
| **D2** | `resolveInitialProvider` (env > prefs > null) до/при mount | `index.tsx` / `App.tsx` | S |
| **D3** | Тесты `resolveInitialProvider` (env-wins, prefs, none, single-auto) + registry | `tests/` | S |
| **E1** | `ui/SettingsMenu.tsx` + команда `/settings`; пункты: провайдер, перезапуск (`store.reset()`), помощь (HELP), выход | new, `commands.ts` | M |
| **E2** | README: новые экраны, `/settings`, ESC/Ctrl+C, выбор провайдера | `README.md` | S |

Зависимости: `A1 → A4 → D1`; `B1 → B2 → (C1, D1, E1)`. Остальное параллелится.

---

## 6. Краевые случаи
- **0 настроенных провайдеров** — пикер показывает инструкцию + выход, без падений.
- **1 настроенный** — автавыбор на старте; смена через меню покажет список из 1.
- **Смена во время `busy`** — блокируется системной репликой; выход — всегда с abort.
- **ESC внутри меню/пикера** — отменяет к предыдущему экрану, **не** триггерит exit (контекстно).
- **env задан, но ключ отсутствует** — ныне бросает ошибку в `createProvider`; заменить на graceful: пикер без этого пункта + предупреждение.
- **`~/.homeagent/` недоступен для записи** — персистентность тихо пропускается (стартовый выбор каждый раз).

---

## 7. Тестирование
- `resolveInitialProvider` — pure, детерминированно (env/prefs/none, единственный настроенный → авто).
- `registry` — флаги `configured` по наличию ключей.
- `persistence` — временный каталог.
- Ручной E2E: старт без выбора → пикер → бар → `/settings` → смена провайдера → продолжить диалог → ESC → подтверждение.

---

## 8. Проверка этапов
- После §2: ESC/Ctrl+C в баре → оверлей → подтверждение выходит, отмена возвращается; `/exit` идёт через confirm.
- После §3: старт без `BARTENDER_PROVIDER` → пикер; выбор сохраняется в prefs; повторный старт — без пикера.
- После §4: `/settings` открывает меню; смена провайдера работает в рантайме без сброса сессии.
- Финально: `npm run typecheck && npm test && npm start`.

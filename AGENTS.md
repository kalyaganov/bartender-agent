# AGENTS.md

Правила для AI-агентов, работающих с этим проектом.

## Команды

```bash
npm run dev        # запуск с hot-reload (tsx watch)
npm start          # однократный запуск
npm run typecheck  # tsc --noEmit — ОБЯЗАТЕЛЬНО перед коммитом
npm test           # vitest — ОБЯЗАТЕЛЬНО после изменений логики
npm run build      # esbuild — сборка dist/index.js для npm-пакета
```

Перед завершением задачи запускай `npm run typecheck` и `npm test`. Не коммить, если что-то падает.

## Проект

Терминальный AI character-агент: бармен **Виктор**. Ведёт диалог в образе, оценивает опьянение гостя, наливает коктейли, при высоком опьянении отказывает и вызывает такси. Лицо бармена (ASCII-арт) меняется от настроения.

**Стек:** TypeScript (strict) · Ink (React для CLI) · zustand · zod · OpenAI-совместимый SDK.

## Структура

```
src/
  index.tsx           # точка входа (mount <App/>)
  App.tsx             # роутер экранов: bar | setup | menu | exit-confirm
  bootstrap.ts        # загрузка: loadPreferences → resolveInitialScreen (bar | setup)
  config.ts           # константы: пороги, таймеры, generation, reasoning (без env API keys)
  persistence.ts      # ~/.bartender-agent/preferences.json: {endpoint, token, model, thinking}
                      # (+ мягкая миграция из легаси credentials.custom и старого каталога ~/.homeagent/)
  shutdown.ts         # exitApp(): отмена хода, прощальная реплика, остановка tsx watch
  agent/
    loop.ts           # execution loop: стрим + диспетчер tool_call
    prompt.ts         # system prompt + state snapshot
    tools.ts          # инструмент bartender_action (JSON-схема)
    schemas.ts        # zod-схемы: Mood, Action, Drink, Drunkenness
    commands.ts       # обработка /команд + CommandDef/COMMANDS для попапа
    providers/
      types.ts        # контракт: LLMProvider, StreamPart, Message, ToolSpec, GenerationConfig
      errors.ts       # ProviderError + toProviderError (классификация HTTP-статусов SDK)
      provider-utils.ts # withSignal(promise, signal) → ProviderError(abort)
      openai.ts       # единственный адаптер (OpenAI-compat: любой эндпоинт через baseURL)
      index.ts        # createProvider(cfg: ProviderConfig) — собирает OpenAIProvider
  state/
    store.ts          # zustand-стор сессии (UI + игровое состояние)
    reducer.ts        # чистые переходы состояния (тестируется)
    drunkenness.ts    # формула displayDrunkenness, метаболизм
    app.ts            # zustand app-store: {screen, prefs} — не сбрасывается между сессиями
  ui/
    BarScreen.tsx     # основной экран
    SetupScreen.tsx   # форма настройки: endpoint, token, model, thinking on/off
    Face.tsx          # лицо: муд, моргание, подёргивание
    faces.ts          # таблица черт → ASCII-арт по мудам
    DialoguePanel.tsx # история реплик + стрим
    InputBox.tsx      # ввод игрока + попап команд
    CommandPopup.tsx  # попап /команд (навигация стрелками)
    CocktailAnimation.tsx
    Meter.tsx         # полоса опьянения
    Tab.tsx           # счёт
    StatusBar.tsx     # время бара, фаза
    SettingsMenu.tsx  # /settings (пункт «Настроить провайдера» открывает SetupScreen)
    ExitConfirm.tsx
    SelectList.tsx    # переиспользуемый список с навигацией
    useViewport.ts    # хук размеров терминала (rows/columns + resize)
  data/
    cocktails.ts      # мини-БД коктейлей
  tests/
    bootstrap.test.ts
    cocktails.test.ts
    drunkenness.test.ts
    errors.test.ts
    loop.test.ts        # мок-провайдеры для loop-тестов
    persistence.test.ts # round-trip + миграция легаси
    provider-utils.test.ts
    providers.test.ts   # OpenAIProvider: стриминг, tool-calls, baseURL, tool_choice, createProvider(cfg)
    reducer.test.ts
    ui.test.tsx
    ui-setup.test.tsx   # форма SetupScreen
scripts/              # утилиты разработчика (запуск: npx tsx scripts/<name>.ts)
  preview-faces.ts    # превью всех лиц по мудам + проверка ширины строк
  smoke.ts            # дымовой прогон: system prompt + tool call (TUI-настройка должна быть готова)
  smoke-turn.ts       # дымовой прогон полного хода через runTurn + стор
docs/
  BACKLOG.md            # идеи и техдолг (P1–P3 + T1–T4)
  SPEC-primitive-setup.md # актуальная архитектура провайдеров (одна форма, ProviderConfig)
  SPEC-provider-layer.md  # ⚠ superseded частично — исторический контракт StreamPart (актуален)
  SPEC-providers.md       # ⚠ superseded by SPEC-primitive-setup.md
  SPEC-publish.md         # ⚠ частично устарел (env-config)
  PLAN-provider-layer.md  # план реализации предыдущей итерации
```

## Документация

Все спецификации и планы — в `docs/`.

### Именование

| Префикс | Назначение | Пример |
|---------|-----------|--------|
| `SPEC-*.md` | Спецификация изменения: проблема, дизайн, затронутые файлы, тесты | `SPEC-primitive-setup.md` |
| `PLAN-*.md` | Пошаговый план реализации с задачами и критериями готовности | `PLAN-provider-layer.md` |
| `BACKLOG.md` | Идеи и техдолг | (существует) |

### Правила

1. **Перед реализацией фичи** — создать `docs/SPEC-<feature>.md`: проблема, текущее состояние (с `file:line`), дизайн, затронутые файлы, тесты, оценка усилия.
2. **Кросс-ссылки** — относительные пути внутри `docs/` (`./SPEC-primitive-setup.md`). Из корня — `./docs/SPEC-primitive-setup.md`.
3. **Superseded-пометки** — если новая SPEC делает старую устаревшей, оставь старую (история), но добавь в шапку «⚠ superseded by …».

## Конвенции кода

- **Без комментариев** в коде, если явно не requested.
- **Русский язык** для всего, что видит/слышит пользователь: реплики бармена, system prompt, системные сообщения, меню, команды. Английский — для идентификаторов, технических комментариев в тестах, логов.
- **Строго в образе**: бармен никогда не упоминает, что он ИИ. Это правило — в system prompt (`agent/prompt.ts`), не нарушать.
- **Zustand**: два стора — `store.ts` (сессионное состояние, сбрасывается) и `app.ts` (прикладное состояние `{screen, prefs}`, не сбрасывается).
- **Reducer чистый**: `state/reducer.ts` — чистая функция, тестируется отдельно. Сайд-эффекты (анимации, таймеры) — в `store.ts` поверх редюсера.
- **Один OpenAI-compat адаптер**: loop не знает, какой эндпоинт за ним стоит. Контракт — `StreamPart` в `providers/types.ts`. Конфигурация — плоская схема в `preferences.json`, читается через `useAppStore.prefs`. Никаких каталогов провайдеров и env-var override.
- **Tool calling**: модель обязана вызывать `bartender_action` каждый ход. System prompt это предписывает; программно `tool_choice` не форсируется — провайдеры расходятся в поддержке (ZAI режектит named, DeepSeek-thinking режектит `required`). Реплика — в поле `reply` внутри tool call (для reasoning-моделей) ИЛИ в content-стриме (для обычных). Loop обрабатывает оба случая.
- **Reasoning**: если в `prefs.thinking === true`, loop передаёт `generation.reasoning = {budgetTokens}`. Что делать с `reasoning_content` из стрима — решает адаптер (`reasoning-delta` события в `store.lastReasoning`, в UI не показывается, доступно через `/state`).
- **Тесты**: vitest, рядом с тестируемым кодом в `src/tests/`. Мок-провайдеры для loop-тестов — в `tests/loop.test.ts`.
- **Строгий TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`. Не ослаблять.

## Архитектурные принципы

1. **Character agent, не ассистент.** Модель работает в роли персонажа. Свободный текст — реплика бармена (стримится посимвольно). Tool call — структурированные данные (mood, action, drink, drunkenness).
2. **Пороги опьянения — окончательные.** При `drunkenness >= 7` редюсер форсирует `refuse`, даже если модель вернула `pour_drink`. Не поддаваться уговорам «ещё одну».
3. **Безопасность.** System prompt запрещает: поощрять вождение после выпивки, смешивать алкоголь с лекарствами, одобрять запой. При упоминании руля — настойчиво предлагать такси.
4. **Single source of truth.** Store — единый источник для UI. Loop пишет, компоненты читают через хуки.

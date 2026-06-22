# AGENTS.md

Правила для AI-агентов, работающих с этим проектом.

## Команды

```bash
npm run dev        # запуск с hot-reload (tsx watch)
npm start          # однократный запуск
npm run typecheck  # tsc --noEmit — ОБЯЗАТЕЛЬНО перед коммитом
npm test           # vitest — ОБЯЗАТЕЛЬНО после изменений логики
```

Перед завершением задачи запускай `npm run typecheck` и `npm test`. Не коммить, если что-то падает.

## Проект

Терминальный AI character-агент: бармен **Виктор**. Ведёт диалог в образе, оценивает опьянение гостя, наливает коктейли, при высоком опьянении отказывает и вызывает такси. Лицо бармена (ASCII-арт) меняется от настроения.

**Стек:** TypeScript (strict) · Ink (React для CLI) · zustand · zod · OpenAI-compatible SDK.

## Структура

```
src/
  index.tsx           # точка входа (mount <App/>)
  App.tsx             # роутер экранов: bar | selecting-provider | menu | exit-confirm
  bootstrap.ts        # загрузка: восстановление пресетов, выбор провайдера
  config.ts           # константы: пороги, таймеры, API-ключи из env
  persistence.ts      # ~/.bartender-agent/preferences.json (+ миграция из ~/.homeagent/)
  shutdown.ts         # exitApp(): отмена хода, прощальная реплика, остановка tsx watch
  agent/
    loop.ts           # execution loop: стрим + диспетчер tool_call
    prompt.ts         # system prompt + state snapshot
    tools.ts          # инструмент bartender_action (JSON-схема)
    schemas.ts        # zod-схемы: Mood, Action, Drink, Drunkenness
    commands.ts       # обработка /команд + CommandDef/COMMANDS для попапа
    providers/
      types.ts        # интерфейс LLMProvider, StreamEvent, ProviderId
      openai.ts       # OpenAI-compat адаптер (GPT + opencode-go/DeepSeek через baseURL)
      anthropic.ts    # Claude
      registry.ts     # ALL_PROVIDERS / PROVIDERS — фабрика провайдеров
      index.ts        # createProvider() — выбор по config.provider
  state/
    store.ts          # zustand-стор сессии (UI + игровое состояние)
    reducer.ts        # чистые переходы состояния (тестируется)
    drunkenness.ts    # формула displayDrunkenness, метаболизм
    app.ts            # zustand app-store (экран, провайдер — не сбрасывается)
  ui/
    BarScreen.tsx     # основной экран
    Face.tsx          # лицо: муд, моргание, подёргивание
    faces.ts          # таблица черт → ASCII-арт по мудам
    DialoguePanel.tsx # история реплик + стрим
    InputBox.tsx      # ввод игрока + попап команд
    CommandPopup.tsx  # попап /команд (навигация стрелками)
    CocktailAnimation.tsx
    Meter.tsx         # полоса опьянения
    Tab.tsx           # счёт
    StatusBar.tsx     # время бара, фаза
    SettingsMenu.tsx  # /settings
    ProviderPicker.tsx
    ExitConfirm.tsx
    SelectList.tsx    # переиспользуемый список с навигацией
    useViewport.ts    # хук размеров терминала (rows/columns + resize)
  data/
    cocktails.ts      # мини-БД коктейлей
  tests/
    bootstrap.test.ts
    cocktails.test.ts
    drunkenness.test.ts
    loop.test.ts      # мок-провайдеры для loop-тестов
    providers.test.ts
    reducer.test.ts
    ui.test.tsx
scripts/              # утилиты разработчика (запуск: npx tsx scripts/<name>.ts)
  preview-faces.ts    # превью всех лиц по мудам + проверка ширины строк
  smoke.ts            # дымовой прогон провайдера (system prompt + tool call)
  smoke-turn.ts       # дымовой прогон полного хода через runTurn + стор
docs/
  BACKLOG.md          # идеи и техдолг (P1–P3 + T1–T4)
```

> `docs/` сейчас содержит только `BACKLOG.md`. Спецификации (`SPEC*.md`) и планы (`PLAN*.md`) заводятся под фичу по правилам ниже — см. «Документация».

## Документация

Все спецификации и планы — в `docs/`.

### Именование

| Префикс | Назначение | Пример |
|---------|-----------|--------|
| `SPEC-*.md` | Спецификация изменения: проблема, дизайн, затронутые файлы, тесты | `SPEC-reasoning.md` |
| `PLAN-*.md` | Пошаговый план реализации с задачами и критериями готовности | `PLAN-screens.md` |
| `SPEC.md` | Основная спецификация проекта (всегда актуальная) | — |
| `PLAN.md` | Основной план реализации | — |
| `BACKLOG.md` | Идеи и техдолг | (существует) |

### Правила

1. **Перед реализацией фичи** — создать `docs/SPEC-<feature>.md`: проблема, текущее состояние (с `file:line`), дизайн, затронутые файлы, тесты, оценка усилия.
2. **Кросс-ссылки** — относительные пути внутри `docs/` (`./SPEC.md`). Из корня — `./docs/SPEC.md`.
3. **Обновлять существующие спеки** при изменении архитектуры, а не только создавать новые.

## Конвенции кода

- **Без комментариев** в коде, если явно не requested.
- **Русский язык** для всего, что видит/слышит пользователь: реплики бармена, system prompt, системные сообщения, меню, команды. Английский — для идентификаторов, технических комментариев в тестах, логов.
- **Строго в образе**: бармен никогда не упоминает, что он ИИ. Это правило — в system prompt (`agent/prompt.ts`), не нарушать.
- **Zustand**: два стора — `store.ts` (сессионное состояние, сбрасывается) и `app.ts` (прикладное состояние, не сбрасывается).
- **Reducer чистый**: `state/reducer.ts` — чистая функция, тестируется отдельно. Сайд-эффекты (анимации, таймеры) — в `store.ts` поверх редюсера.
- **Провайдер-агностичность**: loop не знает, какой провайдер/модель. Контракт — `StreamEvent` в `providers/types.ts`. Новые провайдеры добавляются в `registry.ts`.
- **Tool calling**: модель обязана вызывать `bartender_action` каждый ход. Реплика — в поле `reply` внутри tool call (для reasoning-моделей) ИЛИ в content-стриме (для обычных). Loop обрабатывает оба случая.
- **Тесты**: vitest, рядом с тестируемым кодом в `src/tests/`. Мок-провайдеры для loop-тестов — в `tests/loop.test.ts`.
- **Строгий TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`. Не ослаблять.

## Архитектурные принципы

1. **Character agent, не ассистент.** Модель работает в роли персонажа. Свободный текст — реплика бармена (стримится посимвольно). Tool call — структурированные данные (mood, action, drink, drunkenness).
2. **Пороги опьянения — окончательные.** При `drunkenness >= 7` редюсер форсирует `refuse`, даже если модель вернула `pour_drink`. Не поддаваться уговорам «ещё одну».
3. **Безопасность.** System prompt запрещает: поощрять вождение после выпивки, смешивать алкоголь с лекарствами, одобрять запой. При упоминании руля — настойчиво предлагать такси.
4. **Single source of truth.** Store — единый источник для UI. Loop пишет, компоненты читают через хуки.

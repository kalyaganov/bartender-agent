# SPEC — Reasoning-токены: унификация по провайдерам

> Спецификация изменения поверх [SPEC.md](./SPEC.md).
>
> **Проблема:** reasoning-модели (DeepSeek, Claude с extended thinking) «думают вслух» — их цепочка рассуждений попадает в видимый текст диалога, ломая образ бармена. Гость видит технические термины (`action`, `call_taxi`, `score`, `cues`, `mood: firm`) вместо реплики персонажа.
>
> **Решение:** ввести тип события `reasoning` в `StreamEvent`. Каждый провайдер сам классифицирует свои нативные поля мышления и контента. Loop единообразно обрабатывает оба потока: `token` → видимый текст, `reasoning` → скрытое накопление для отладки.

---

## Контекст

Проект поддерживает три провайдера (`src/agent/providers/registry.ts`):

| ID | Класс | Модель по умолчанию | Reasoning? |
|----|-------|---------------------|------------|
| `opencode-go` | `OpenAIProvider` | `deepseek-v4-pro` | да — `delta.reasoning_content` |
| `openai` | `OpenAIProvider` | `gpt-4o-mini` | нет (но o-series могут) |
| `anthropic` | `AnthropicProvider` | `claude-3-5-haiku-latest` | опционально — `thinking_delta` |

Reasoning-модель отдаёт три потока данных:

1. **Мышление** (chain-of-thought) — должно быть скрыто от гостя.
2. **Контент** (видимый текст реплики) — у данного проекта обычно пустой, т.к. промпт требует класть реплику в `tool.reply` (`prompt.ts:20`).
3. **Tool call** `bartender_action` — структурированные данные, включая финальную реплику в поле `reply`.

---

## Текущее состояние (что ломается)

### `src/agent/providers/types.ts:14-17`
```ts
export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "toolCall"; toolName: string; input: unknown }
  | { type: "done" };
```
Нет типа для reasoning — всё, что не toolCall, обрабатывается как видимый текст.

### `src/agent/providers/openai.ts:42`
```ts
if (delta.content) yield { type: "token", text: delta.content };
```
`delta.reasoning_content` полностью игнорируется типами SDK. Если модель (DeepSeek) кладёт мышление в `content` вместо `reasoning_content` (или если поле не типизировано) — оно стримится гостю.

### `src/agent/providers/anthropic.ts:33-38`
```ts
if (event.delta.type === "text_delta") {
  yield { type: "token", text: event.delta.text };
}
```
`thinking_delta` не обрабатывается — просто теряется. Extended thinking даже не включён в параметрах запроса (`anthropic.ts:20-28`), `max_tokens` захардкожен в 512.

### `src/agent/loop.ts:111-113`
```ts
if (ev.type === "token") store.appendStreamingToken(ev.text);
else if (ev.type === "toolCall") toolInput = ev.input;
```
Loop не различает token и reasoning — любой текст уходит в `streamingText`, который коммитится как реплика бармена (`store.ts:100-108`). Если reasoning стримился, `streamedNow` = true (`loop.ts:123`), и настоящая реплика из `tool.reply` **не показывается вообще**.

---

## Дизайн

### 1. Тип `reasoning` в `StreamEvent`

**Файл:** `src/agent/providers/types.ts`

```ts
export type StreamEvent =
  | { type: "token"; text: string }        // видимый текст реплики бармена
  | { type: "reasoning"; text: string }     // мышление модели — скрыто от гостя
  | { type: "toolCall"; toolName: string; input: unknown }
  | { type: "done" };
```

Контракт: каждый провайдер **сам** решает, что отправить как `token`, а что как `reasoning`. Loop не знает и не должен знать, какая модель на другой стороне.

### 2. OpenAI-провайдер

**Файл:** `src/agent/providers/openai.ts`

В цикле стрима добавить обработку `delta.reasoning_content`:

```ts
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
  if (!delta) continue;

  // Reasoning (DeepSeek и совместимые OpenAI-compat reasoning-модели)
  if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    yield { type: "reasoning", text: delta.reasoning_content };
  }
  // Видимый контент
  if (typeof delta.content === "string" && delta.content) {
    yield { type: "token", text: delta.content };
  }

  // Tool call (без изменений)
  const tc = (delta as { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }).tool_calls?.[0];
  if (tc?.function?.name) toolName = tc.function.name;
  if (tc?.function?.arguments) toolArgs += tc.function.arguments;
}
```

> **Почему `Record<string, unknown>`:** поле `reasoning_content` отсутствует в типах `openai` SDK (это расширение DeepSeek). Обращение через индекс-сигнатуру безопаснее, чем `as any`. Проверка `typeof === "string"` отсекает `null`/`undefined`.

### 3. Anthropic-провайдер

**Файл:** `src/agent/providers/anthropic.ts`

Добавить ветку `thinking_delta`:

```ts
for await (const event of stream) {
  if (event.type === "content_block_delta") {
    if (event.delta.type === "thinking_delta") {
      yield { type: "reasoning", text: event.delta.thinking };
    } else if (event.delta.type === "text_delta") {
      yield { type: "token", text: event.delta.text };
    }
  }
}
```

Включение extended thinking — отдельно, через конфиг (см. §5). Если thinking не включён, `thinking_delta` просто не приходит, и провайдер работает как раньше.

### 4. Loop — раздельная обработка

**Файл:** `src/agent/loop.ts`

В колбэке стрима (`loop.ts:111-113`) добавить ветку `reasoning`:

```ts
(ev) => {
  if (ev.type === "token") store.appendStreamingToken(ev.text);
  else if (ev.type === "reasoning") store.appendReasoning(ev.text);
  else if (ev.type === "toolCall") toolInput = ev.input;
},
```

Логика отображения реплики (`loop.ts:121-142`) **не меняется**: если `content`-токены стримились, `streamedNow` = true и реплика коммитится из стрима. Если reasoning-модель отдала контент пустым (ожидаемый кейс), `streamedNow` = false, и реплика раскрывается машункой из `tool.reply`.

### 5. Store — накопление reasoning

**Файл:** `src/state/store.ts`

Добавить поле `lastReasoning: string` и метод `appendReasoning`:

```ts
interface SessionState extends GameState {
  // ...существующие поля...
  lastReasoning: string;     // мышление модели за последний ход (debug)

  // ...существующие методы...
  appendReasoning: (token: string) => void;
}
```

Реализация:

```ts
lastReasoning: "",

appendReasoning: (token) =>
  set((s) => ({ lastReasoning: s.lastReasoning + token })),
```

Сброс в `startStreaming` (начало нового хода — очищаем накопление):

```ts
startStreaming: () => set({ streamingText: "", lastReasoning: "" }),
```

Сброс в `reset`:

```ts
lastReasoning: "",
```

### 6. Команда `/state` — показ reasoning

**Файл:** `src/agent/commands.ts`

В существующий вывод `/state` (`commands.ts:38-43`) добавить информацию о последнем reasoning:

```ts
case "/state": {
  const r = store.lastReasoning;
  const rSummary = r
    ? `${r.slice(0, 200)}${r.length > 200 ? "…" : ""}`
    : "(нет)";
  store.addSystemLine(
    `mood=${store.mood} · опьянение=${store.drunkenness.toFixed(1)} ` +
      `· выпито=${store.bacProxy.toFixed(1)} · подач=${store.served.length} ` +
      `· счёт=${store.tab}₽ · фаза=${store.phase}\n` +
      `reasoning: ${rSummary}`,
  );
  return true;
}
```

> Текст обрезается до 200 символов, чтобы не засорять диалог. Полный текст доступен через `store.getState().lastReasoning` в отладчике.

---

## Конфигурация (опционально, для Anthropic extended thinking)

**Файл:** `src/config.ts`

Добавить секцию для управления reasoning:

```ts
reasoning: {
  // Включать ли extended thinking для Anthropic (требует подходящую модель)
  anthropicThinking: false as boolean,
  anthropicThinkingBudget: 1024 as number,
},
```

В `anthropic.ts` — условно добавлять `thinking` в параметры запроса, если включён в конфиге, и поднимать `max_tokens`:

```ts
const wantThinking = config.reasoning.anthropicThinking;
// ...
max_tokens: wantThinking ? 4096 : 512,
thinking: wantThinking
  ? { type: "enabled", budget_tokens: config.reasoning.anthropicThinkingBudget }
  : undefined,
```

> DeepSeek включает reasoning автоматически на уровне модели — конфиг-флаг не нужен. OpenAI o-series передаёт reasoning_effort отдельно; если понадобится — добавить в ту же секцию.

---

## Что НЕ меняется

- **System prompt** (`prompt.ts`) — без правок. Инструкция «Дублировать её в content сообщения не нужно» (`prompt.ts:20`) уже корректна.
- **Schemas** (`schemas.ts`), **tools** (`tools.ts`) — без правок.
- **Reducer** (`reducer.ts`) — без правок, reasoning не влияет на игровую логику.
- **UI-компоненты** — без правок. Reasoning не отображается в интерфейсе.
- **selectHistory** (`store.ts:122-129`) — reasoning не попадает в историю для LLM. Мышление каждого хода эфемерно, отправлять его обратно в контекст не нужно.

---

## Диаграмма потока (один ход, reasoning-модель)

```
Игрок вводит реплику
        │
        ▼
  loop.ts: provider.streamTurn(...)
        │
        ├── reasoning event ──► store.appendReasoning() ──► lastReasoning (скрыто)
        │
        ├── token event ──────► store.appendStreamingToken() ──► DialoguePanel (видимо)
        │      (обычно пусто у reasoning-моделей)
        │
        ├── toolCall event ───► toolInput (парсится в конце)
        │
        └── done
                │
                ▼
  parseBartenderAction(toolInput)
        │
        ├── applyBartenderAction(action) → mood, drunkenness, phase…
        │
        ├── streamedNow? 
        │     ├─ true  → finalizeStreaming() (реплика из стрима)
        │     └─ false → typewriter из action.reply (ожидаемый путь)
        │
        └── action.action === "call_taxi" → system line
```

---

## Тесты

**Файл:** `src/tests/loop.test.ts`

Добавить мок reasoning-провайдера и тесты:

### T1. Reasoning не попадает в диалог
```ts
function reasoningProvider(reasoning: string[], input: unknown): LLMProvider {
  // Эмиттит reasoning events, затем toolCall (имитация DeepSeek)
}

it("reasoning-токены не попадают в видимый диалог", async () => {
  const p = reasoningProvider(
    ["Нужно оценить опьянение... score 9...", "action: call_taxi"],
    { reply: "Вызываю такси, дружище.", mood: "firm", action: "call_taxi",
      drunkennessAssessment: { score: 9, cues: ["агрессия"] } },
  );
  await executeTurn(p, "иди нахуй");

  const state = useStore.getState();
  // Reasoning сохранён, но не показан
  expect(state.lastReasoning).toContain("score 9");
  // Реплика бармена — из tool.reply, не из reasoning
  const last = [...state.lines].reverse().find((l) => l.speaker === "bartender");
  expect(last?.text).toBe("Вызываю такси, дружище.");
  // Reasoning не попал в строки диалога
  expect(state.lines.some((l) => l.text.includes("score 9"))).toBe(false);
});
```

### T2. Reasoning накапливается и доступен для /state
```ts
it("/state показывает последний reasoning", async () => {
  // ...выполнить ход с reasoning-провайдером...
  handleCommand("/state");
  const sysLine = [...state.lines].reverse().find((l) => l.speaker === "system");
  expect(sysLine?.text).toContain("reasoning:");
});
```

### T3. Существующие тесты не ломаются
Мок `toolProvider` (`loop.test.ts:16-22`) эмиттит только `toolCall` + `done` — без reasoning и token событий. Логика раскрытия `tool.reply` машинункой (`loop.ts:124-133`) должна работать как прежде.

### T4. Provider-тест: openai.ts классифицирует reasoning_content
```ts
// tests/providers.test.ts (новый)
it("OpenAI-провайдер разделяет reasoning_content и content", async () => {
  // Мок SDK: чанки с reasoning_content и content
  // Проверить: reasoning events содержат только thinking, token events — только content
});
```

---

## Затронутые файлы

| Файл | Изменение | Усилие |
|------|-----------|--------|
| `src/agent/providers/types.ts` | добавить `reasoning` в `StreamEvent` | S |
| `src/agent/providers/openai.ts` | `delta.reasoning_content` → reasoning event | S |
| `src/agent/providers/anthropic.ts` | `thinking_delta` → reasoning event; опц. включение thinking | S |
| `src/agent/loop.ts` | ветка `reasoning` в колбэке стрима | S |
| `src/state/store.ts` | `lastReasoning`, `appendReasoning`, сброс в `startStreaming`/`reset` | S |
| `src/agent/commands.ts` | `/state` показывает reasoning | S |
| `src/config.ts` | секция `reasoning` (Anthropic thinking toggle) | S |
| `src/tests/loop.test.ts` | тесты T1–T3 | S |
| `src/tests/providers.test.ts` | новый файл, тест T4 | S |

**Суммарное усилие:** S–M (~1–2 ч)

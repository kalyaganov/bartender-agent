# ADR-0004: Стриминг-контракт StreamPart

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Alexey Kalyaganov

## Context

Нужен единый контракт для потоковых ответов от LLM-провайдеров. Разные провайдеры имеют разные форматы SSE-событий, но приложение должно работать с ними единообразно.

Требования:
- Потоковая передача текста реплики (посимвольно)
- Потоковая передача reasoning-токенов (для thinking-моделей)
- Потоковая передача tool call arguments
- Завершение с метаданными (finish reason, usage)
- Типизированные ошибки

## Decision

**Контракт `StreamPart`** (`src/agent/providers/types.ts`):

```typescript
export type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage }
  | { type: "error"; error: unknown };
```

**Ключевые типы:**
- `FinishReason`: `stop | length | tool-calls | content-filter | error`
- `Usage`: `inputTokens, outputTokens, totalTokens, reasoningTokens`
- `LLMProvider.streamTurn(opts): AsyncIterable<StreamPart>` — интерфейс провайдера

**Адаптер маппит:**
- OpenAI SSE `choices[0].delta.content` → `text-delta`
- OpenAI SSE `choices[0].delta.reasoning_content` → `reasoning-delta`
- OpenAI SSE `choices[0].delta.tool_calls` → `tool-call-delta` / `tool-call`
- OpenAI SSE `choices[0].finish_reason` → `finish`
- HTTP ошибки → `error` (типизированный `ProviderError`)

## Consequences

**Позитивные:**
- Единый контракт для всех провайдеров
- Легко добавить новый тип события
- Типизированные ошибки с классификацией (auth, rateLimit, network, badRequest, abort)
- Провайдер можно заменить без изменения loop

**Негативные:**
- Некоторые провайдеры имеют специфичные форматы, которые нужно мапить
- Reasoning-токены поддерживаются не всеми моделями

## Alternatives Considered

1. **Прямой поток OpenAI SDK** — без промежуточного контракта. Отклонено: привязка к конкретному SDK, сложнее заменить провайдер.
2. **Собственный бинарный протокол** — избыточно для текущих задач.
3. **AI SDK V3 Language Model spec** — ближайший аналог, но наш контракт легче и точнее подходит под нужды проекта.

## Related

- ADR-0002: Единый OpenAI-compat адаптер
- ADR-0005: Tool calling — bartender_action каждый ход

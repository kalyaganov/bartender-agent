# Architecture Decision Records

Индекс принятых архитектурных решений проекта bartender-agent.

## Формат ADR

Каждый ADR — документ в формате [MADR](https://adr.github.io/madr/):
- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Context:** проблема, текущее состояние, ограничения
- **Decision:** что решили и почему
- **Consequences:** последствия, компромиссы
- **Alternatives:** какие варианты рассматривали
- **Related:** связанные ADR

## Процесс

Перед реализацией фичи, попадающей в критерии значимого решения — создать ADR, обсудить, зафиксировать. Реализация следует после acceptance.

## Критерии значимого решения

- Выбор технологии или библиотеки
- Изменение контракта между слоями (UI ↔ Agent ↔ Provider ↔ State)
- Новая игровая механика с влиянием на несколько модулей
- Изменение схемы данных или persistence
- Решение, которое сложно отменить задним числом

## Список ADR

| ADR | Решение | Статус |
|-----|---------|--------|
| [ADR-0001](./ADR-0001-character-agent.md) | Character Agent, не ассистент | Accepted |
| [ADR-0002](./ADR-0002-openai-compat-adapter.md) | Единый OpenAI-compat адаптер | Accepted |
| [ADR-0003](./ADR-0003-dual-store-pure-reducer.md) | Двойной Zustand store + чистый Reducer | Accepted |
| [ADR-0004](./ADR-0004-streampart-contract.md) | Стриминг-контракт StreamPart | Accepted |
| [ADR-0005](./ADR-0005-tool-calling.md) | Tool calling — bartender_action каждый ход | Accepted |
| [ADR-0006](./ADR-0006-drunkenness-threshold.md) | Порог опьянения ≥7 — жёсткий отказ | Accepted |
| [ADR-0007](./ADR-0007-byok-no-env-keys.md) | BYOK — без env API keys | Accepted |

## Связь с другими документами

- **SPEC** (`docs/SPEC-*.md`) — дизайн конкретной фичи, затронутые файлы, тесты
- **PLAN** (`docs/PLAN-*.md`) — пошаговый план реализации
- **BACKLOG** (`docs/BACKLOG.md`) — идеи и техдолг
- **AGENTS.md** (`../AGENTS.md`) — правила для AI-агентов, включая процесс ADR

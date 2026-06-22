# SPEC — UI: sticky-лицо и command popup

> Спецификация двух UI-изменений поверх [SPEC.md](./SPEC.md).
>
> 1. **Sticky-лицо:** лицо бармена и нижняя панель (meter/tab/input) остаются на экране при росте диалога. Скроллится только DialoguePanel.
> 2. **Command popup:** при вводе `/` над строкой ввода появляется фильтруемый список команд с навигацией стрелками и Tab-автодополнением.

---

## Контекст: текущая раскладка

`BarScreen.tsx` рендерит вертикальный flex-column без ограничений высоты:

```
┌──────────────────────────────────┐
│ StatusBar                         │  1 строка
│                                   │
│           ЛИЦО БАРМЕНА            │  9 строк (+marginY=2)
│                                   │
│  Виктор: ...                      │
│  Вы: ...                          │  DialoguePanel — растёт без лимита
│  Виктор: ...                      │  (minHeight=6, без max)
│  ...                              │
│                                   │
│  Опьянение: ▰▰▰░░░░  Счёт: 700₽  │  1 строка
│  ─────────────────────────────    │  border
│  Вы: ▮                            │  InputBox
└──────────────────────────────────┘
```

**Проблема 1:** DialoguePanel рендерит **все** строки (`DialoguePanel.tsx:15` — `lines.map(...)`). Ink выводит дерево целиком; если суммарная высота превышает терминал — терминал скроллит, лицо уезжает за верхний край.

**Проблема 2:** Игрок не видит доступные команды, пока не введёт `/help`. Нет подсказки при вводе `/`.

---

## 1. Sticky-лицо: viewport-fixed layout

### 1.1 Принцип

Общая высота рендера = высоте терминала. Fixed-элементы (StatusBar, Face, Meter/Tab, Input) занимают свои строки. DialoguePanel получает оставшееся пространство и показывает только последние N строк.

### 1.2 Новый хук `useViewport`

**Файл:** `src/ui/useViewport.ts` (новый)

```ts
import { useState, useEffect } from "react";

export interface Viewport { rows: number; columns: number; }

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => ({
    rows: process.stdout.rows || 24,
    columns: process.stdout.columns || 80,
  }));

  useEffect(() => {
    const onResize = () =>
      setVp({
        rows: process.stdout.rows || 24,
        columns: process.stdout.columns || 80,
      });
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  return vp;
}
```

### 1.3 Расчёт фиксированных строк

Точный подсчёт строк, которые всегда видны (вне DialoguePanel):

| Элемент | Строк | Источник |
|---------|-------|----------|
| `paddingY={1}` внешний (верх + низ) | 2 | `BarScreen.tsx:57` |
| `StatusBar` | 1 | `StatusBar.tsx` |
| `Face` контейнер `marginY={1}` | 2 | `BarScreen.tsx:60` |
| `Face` арт | 9 | `faces.ts:40-50` (9 строк) |
| `DialoguePanel` `marginTop={1}` | 1 | `DialoguePanel.tsx:14` |
| Meter/Tab `marginTop={1}` | 1 | `BarScreen.tsx:68` |
| Meter + Tab строка | 1 | `BarScreen.tsx:69` |
| Border `marginTop={1}` | 1 | `BarScreen.tsx:73` |
| Border | 1 | `BarScreen.tsx:73` |
| `InputBox` | 1 | `InputBox.tsx` |
| **Итого fixed** | **20** | |

```
FIXED_OVERHEAD = 20

dialogueMaxLines = viewport.rows - FIXED_OVERHEAD - popupLines
```

Где `popupLines` — высота command popup (0 когда popup скрыт, см. §2).

### 1.4 Изменения BarScreen

**Файл:** `src/ui/BarScreen.tsx`

```tsx
export function BarScreen() {
  const vp = useViewport();
  const [inputValue, setInputValue] = useState("");

  // ...существующие хуки store...

  const popupItems = inputValue.startsWith("/")
    ? matchCommands(inputValue)
    : [];
  const dialogueMaxLines = Math.max(
    2,
    vp.rows - FIXED_OVERHEAD - popupItems.length,
  );

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <StatusBar ... />

      <Box flexDirection="column" alignItems="center" marginY={1}>
        <Face mood={mood} />
      </Box>

      <DialoguePanel
        lines={lines}
        streaming={streaming}
        busy={busy}
        maxLines={dialogueMaxLines}
      />

      <CocktailAnimation />

      <Box marginTop={1} gap={4}>
        <Meter value={drunkenness} />
        <Tab total={tab} />
      </Box>

      <Box marginTop={1} borderTop borderStyle="single" />

      <CommandPopup items={popupItems} selectedIndex={...} />

      <InputBox
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={busy}
      />
    </Box>
  );
}
```

> `FIXED_OVERHEAD` — константа (20) в `BarScreen.tsx` или `config.ts`. Точную цифру можно вынести в конфиг для подстройки.

### 1.5 Изменения DialoguePanel

**Файл:** `src/ui/DialoguePanel.tsx`

Добавить проп `maxLines`. Рендерить только последние N строк:

```tsx
export function DialoguePanel({
  lines,
  streaming,
  busy,
  maxLines,
}: {
  lines: Line[];
  streaming: string;
  busy: boolean;
  maxLines: number;
}) {
  // Резервируем 1 строку под streaming/busy индикатор
  const hasIndicator = Boolean(streaming || busy);
  const historyMax = Math.max(0, maxLines - (hasIndicator ? 1 : 0));
  const visible = lines.slice(-historyMax);

  return (
    <Box flexDirection="column" marginTop={1}>
      {visible.map((line, i) => { /* без изменений */ })}
      {streaming ? (
        <Text color="cyan">{"  "}Виктор: {streaming}<Text color="gray">▋</Text></Text>
      ) : busy ? (
        <Text color="gray" dimColor>{"  "}Виктор протирает бокал…</Text>
      ) : null}
    </Box>
  );
}
```

Убирается `minHeight={6}` — заменяется на динамический `maxLines`.

### 1.6 Крайние случаи

| Случай | Поведение |
|--------|-----------|
| Терминал < 22 строк | `Math.max(2, ...)` обеспечивает минимум 2 строки диалога; лицо может частично обрезаться терминалом (приоритет — ввод и диалог) |
| `CocktailAnimation` активна (+1 строка) | Учесть в `FIXED_OVERHEAD` динамически: если `pouring` активно, вычесть ещё 1 |
| Длинные реплики с переносом | Одна строка массива может занять 2+ строк терминала. v1: игнорировать (реплики обычно короткие). Будущее: измерять через `Math.ceil(text.length / columns)` |
| Resize во время стрима | `useViewport` триггерит ре-ренд; `maxLines` пересчитывается автоматически |

---

## 2. Command popup при вводе `/`

### 2.1 Реестр команд

**Файл:** `src/agent/commands.ts`

Извлечь описания из `HELP`-строки и `handleCommand` в типизированный массив:

```ts
export interface CommandDef {
  name: string;         // "/menu"
  label: string;        // "меню коктейлей"
}

export const COMMANDS: CommandDef[] = [
  { name: "/menu",     label: "меню коктейлей" },
  { name: "/settings", label: "настройки и провайдер" },
  { name: "/help",     label: "подсказка по командам" },
  { name: "/leave",    label: "попрощаться с барменом" },
  { name: "/exit",     label: "выход" },
  { name: "/state",    label: "состояние (debug)" },
];

export function matchCommands(query: string): CommandDef[] {
  return COMMANDS.filter((c) => c.name.startsWith(query));
}
```

`handleCommand` остаётся без изменений — он уже обрабатывает ввод текста, начинающегося с `/`.

### 2.2 Компонент CommandPopup

**Файл:** `src/ui/CommandPopup.tsx` (новый)

```tsx
import { Box, Text } from "ink";
import type { CommandDef } from "../agent/commands";

export function CommandPopup({
  items,
  selected,
}: {
  items: CommandDef[];
  selected: number;
}) {
  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {items.map((cmd, i) => (
        <Box key={cmd.name} gap={1}>
          <Text color={i === selected ? "cyan" : "gray"}>
            {i === selected ? "▸" : " "}
          </Text>
          <Text color={i === selected ? "cyan" : "white"} bold={i === selected}>
            {cmd.name.padEnd(12)}
          </Text>
          <Text color="gray">{cmd.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
```

Визуально:

```
  ▸ /menu       меню коктейлей
    /settings   настройки и провайдер
    /state      состояние (debug)
```

### 2.3 Интеграция в InputBox

**Файл:** `src/ui/InputBox.tsx`

InputBox становится управляемым (controlled) компонентом — значение поднимается в BarScreen:

```tsx
export function InputBox({
  value,
  onChange,
  onSubmit,
  onCommandNav,   // ← новый: проброс стрелок/Tab
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onCommandNav?: (key: "up" | "down" | "tab") => void;
  disabled?: boolean;
}) {
  useInput((input, key) => {
    if (!value.startsWith("/")) return;
    if (key.upArrow) onCommandNav?.("up");
    else if (key.downArrow) onCommandNav?.("down");
    else if (key.tab) onCommandNav?.("tab");
  });

  return (
    <Box>
      <Text color="green">Вы:&nbsp;</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={(v) => { const t = v.trim(); if (t) onSubmit(t); onChange(""); }}
        placeholder={disabled ? "…" : "сказать бармену"}
      />
    </Box>
  );
}
```

> **Почему нет конфликта с `ink-text-input`:** TextInput обрабатывает буквы, Backspace, Left/Right, Enter. Up/Down/Tab им не используются. Наш `useInput` перехватывает только их и только когда ввод начинается с `/`.

### 2.4 Логика навигации в BarScreen

**Файл:** `src/ui/BarScreen.tsx`

```tsx
const [inputValue, setInputValue] = useState("");
const [cmdIndex, setCmdIndex] = useState(0);

const popupItems = inputValue.startsWith("/")
  ? matchCommands(inputValue)
  : [];

// Сброс индекса при изменении фильтра
useEffect(() => {
  setCmdIndex(0);
}, [inputValue]);

const handleCommandNav = (key: "up" | "down" | "tab") => {
  if (popupItems.length === 0) return;
  if (key === "up") {
    setCmdIndex((i) => (i - 1 + popupItems.length) % popupItems.length);
  } else if (key === "down") {
    setCmdIndex((i) => (i + 1) % popupItems.length);
  } else if (key === "tab") {
    // Автодополнение: подставить выбранную команду в инпут
    setInputValue(popupItems[cmdIndex].name);
  }
};

const handleSubmit = (text: string) => {
  setInputValue("");
  if (handleCommand(text)) return;
  if (busy) return;
  void runTurn(text).catch(() => {});
};
```

### 2.5 Escape: закрыть popup перед выходом

**Файл:** `src/ui/BarScreen.tsx`

Сейчас Escape сразу ведёт к подтверждению выхода (`BarScreen.tsx:32-36`). Если в инпуте есть текст — сначала очищаем:

```tsx
useInput((_input, key) => {
  if (key.escape) {
    if (inputValue) {
      setInputValue("");   // закрыть popup, очистить ввод
    } else {
      useAppStore.getState().go("exit-confirm");
    }
  }
});
```

### 2.6 Interaction summary

| Действие | Результат |
|----------|-----------|
| Ввести `/` | Popup появляется со всеми командами, первая выделена |
| Печатать после `/` (напр. `/se`) | Фильтр: `/settings`, `/state` |
| `↑` / `↓` | Перемещение `▸` по списку |
| `Tab` | Подставить выделенную команду в инпут (без отправки) |
| `Enter` | Отправить: `handleCommand` выполняет команду (если совпадает) или `runTurn` (обычный текст) |
| `Escape` (есть текст) | Очистить инпут, закрыть popup |
| `Escape` (пустой инпут) | Подтверждение выхода (как сейчас) |

---

## Затронутые файлы

| Файл | Изменение | Усилие |
|------|-----------|--------|
| `src/ui/useViewport.ts` | **новый** — хук отслеживания размера терминала | S |
| `src/ui/BarScreen.tsx` | `useViewport`, расчёт `maxLines`, controlled InputBox, CommandPopup, handleCommandNav, Escape logic | M |
| `src/ui/DialoguePanel.tsx` | проп `maxLines`, `lines.slice(-N)` | S |
| `src/ui/InputBox.tsx` | controlled value, `useInput` для стрелок/Tab | S |
| `src/ui/CommandPopup.tsx` | **новый** — компонент popup | S |
| `src/agent/commands.ts` | `COMMANDS` реестр, `matchCommands()` | S |

**Суммарное усилие:** M (~2-3 ч)

---

## Тесты

### T1. DialoguePanel ограничивает видимые строки
```ts
it("DialoguePanel показывает только последние maxLines строк", () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({
    speaker: "bartender" as const, text: `строка ${i}`,
  }));
  const { lastFrame } = render(
    <DialoguePanel lines={lines} streaming="" busy={false} maxLines={5} />,
  );
  // В рендере должны быть строки 16-20, но не 0-15
  expect(lastFrame()).toContain("строка 19");
  expect(lastFrame()).not.toContain("строка 0");
});
```

### T2. matchCommands фильтрует по префиксу
```ts
it("matchCommands находит команды по префиксу", () => {
  expect(matchCommands("/se")).toEqual([
    { name: "/settings", label: "настройки и провайдер" },
    { name: "/state", label: "состояние (debug)" },
  ]);
  expect(matchCommands("/xyz")).toEqual([]);
});
```

### T3. useViewport реагирует на resize
```ts
it("useViewport обновляется при resize терминала", () => {
  // Мок process.stdout.on('resize'), проверить обновление состояния
});
```

---

## Что НЕ меняется

- **Face**, **faces.ts** — без правок.
- **StatusBar**, **Meter**, **Tab**, **CocktailAnimation** — без правок.
- **handleCommand** — логика обработки команд не меняется, добавляется только реестр.
- **Store** — input value живёт в React state BarScreen, не в zustand.
- **selectHistory** — не затрагивается.

---

## Связь с SPEC-reasoning

Оба изменения независимы от SPEC-reasoning и могут быть реализованы параллельно. Единственная точка пересечения: command popup занимает строки, уменьшая `dialogueMaxLines` — это учтено в формуле (`vp.rows - FIXED_OVERHEAD - popupLines`).

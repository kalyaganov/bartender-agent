import { describe, it, expect, afterEach } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { Text } from "ink";
import { DialoguePanel } from "../ui/DialoguePanel";
import { matchCommands, COMMANDS } from "../agent/commands";
import { useViewport } from "../ui/useViewport";
import type { Line } from "../state/store";
import { BarScreen } from "../ui/BarScreen";
import { Face } from "../ui/Face";
import { useStore } from "../state/store";

function lines(n: number, speaker: Line["speaker"] = "bartender"): Line[] {
  return Array.from({ length: n }, (_, i) => ({
    speaker,
    text: `строка ${i}`,
  }));
}

describe("DialoguePanel (SPEC-ui T1)", () => {
  it("показывает только последние maxLines строк", () => {
    const { lastFrame } = render(
      <DialoguePanel lines={lines(20)} streaming="" busy={false} maxLines={5} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("строка 19");
    expect(frame).not.toContain("строка 0");
  });

  it("резервирует строку под streaming-индикатор", () => {
    const { lastFrame } = render(
      <DialoguePanel
        lines={lines(20)}
        streaming="пишу"
        busy={false}
        maxLines={3}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("пишу");
    expect(frame).toContain("строка 19");
    expect(frame).not.toContain("строка 15");
  });

  it("резервирует строку под индикатор размышления", () => {
    const { lastFrame } = render(
      <DialoguePanel lines={lines(20)} streaming="" busy={true} maxLines={3} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Виктор задумался");
    expect(frame).not.toContain("строка 15");
  });

  it("не показывает размышление, когда ответ уже стримится", () => {
    const { lastFrame } = render(
      <DialoguePanel lines={lines(1)} streaming="пишу" busy={true} maxLines={3} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("пишу");
    expect(frame).not.toContain("Виктор задумался");
  });
});

describe("Face", () => {
  it("показывает задумчивое лицо во время ожидания", () => {
    const expected = render(<Face mood="thoughtful" />);
    const actual = render(<Face mood="neutral" thinking />);
    expect(actual.lastFrame()).toBe(expected.lastFrame());
    expected.unmount();
    actual.unmount();
  });
});

describe("matchCommands (SPEC-ui T2)", () => {
  it("находит /setup по префиксу /s", () => {
    expect(matchCommands("/s")).toEqual([
      { name: "/setup", label: "настроить подключение и модель" },
      { name: "/settings", label: "настройки" },
      { name: "/state", label: "состояние (debug)" },
    ]);
  });

  it("фильтрует строго по префиксу: /se → /setup + /settings", () => {
    expect(matchCommands("/se")).toEqual([
      { name: "/setup", label: "настроить подключение и модель" },
      { name: "/settings", label: "настройки" },
    ]);
  });

  it("находит /setup по префиксу /setup", () => {
    expect(matchCommands("/setup")).toEqual([
      { name: "/setup", label: "настроить подключение и модель" },
    ]);
  });

  it("возвращает пустой массив при отсутствии совпадений", () => {
    expect(matchCommands("/xyz")).toEqual([]);
  });

  it("возвращает все команды для пустого префикса-слэша", () => {
    expect(matchCommands("/")).toEqual(COMMANDS);
  });
});

describe("командный попап", () => {
  it("не очищает ввод при навигации стрелкой вниз", async () => {
    useStore.getState().reset();
    const { lastFrame, stdin, unmount } = render(<BarScreen />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("/");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001B[B");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastFrame()).toContain("Вы:");
    expect(lastFrame()).toContain("/");
    expect(lastFrame()).toContain("▸ /setup");
    unmount();
  });

  it("не принимает Escape из навигации попапа за очистку ввода", async () => {
    useStore.getState().reset();
    const { lastFrame, stdin, unmount } = render(<BarScreen />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("/");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("\u001B");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastFrame()).toContain("Вы:");
    expect(lastFrame()).toContain("/");
    unmount();
  });
});

describe("useViewport (SPEC-ui T3)", () => {
  const originalRows = Object.getOwnPropertyDescriptor(
    process.stdout,
    "rows",
  );
  const originalColumns = Object.getOwnPropertyDescriptor(
    process.stdout,
    "columns",
  );

  afterEach(() => {
    if (originalRows) {
      Object.defineProperty(process.stdout, "rows", originalRows);
    }
    if (originalColumns) {
      Object.defineProperty(process.stdout, "columns", originalColumns);
    }
  });

  function setRows(n: number) {
    Object.defineProperty(process.stdout, "rows", { value: n, configurable: true });
  }

  it("обновляется при resize терминала", async () => {
    setRows(24);
    const Probe = () => {
      const vp = useViewport();
      return React.createElement(Text, null, `rows=${vp.rows}`);
    };

    const { lastFrame } = render(React.createElement(Probe));
    expect(lastFrame()).toBe("rows=24");
    await new Promise((r) => setTimeout(r, 0));

    setRows(40);
    process.stdout.emit("resize");
    await new Promise((r) => setTimeout(r, 0));

    expect(lastFrame()).toBe("rows=40");
  });
});

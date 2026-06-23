import { describe, it, expect, afterEach } from "vitest";
import { render } from "ink-testing-library";
import React from "react";
import { Text } from "ink";
import { DialoguePanel } from "../ui/DialoguePanel";
import { matchCommands, COMMANDS } from "../agent/commands";
import { useViewport } from "../ui/useViewport";
import type { Line } from "../state/store";

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

  it("резервирует строку под busy-индикатор", () => {
    const { lastFrame } = render(
      <DialoguePanel lines={lines(20)} streaming="" busy={true} maxLines={3} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("протирает бокал");
    expect(frame).not.toContain("строка 15");
  });
});

describe("matchCommands (SPEC-ui T2)", () => {
  it("находит /setup по префиксу /s", () => {
    expect(matchCommands("/s")).toEqual([
      { name: "/setup", label: "настроить провайдера" },
      { name: "/settings", label: "настройки" },
      { name: "/state", label: "состояние (debug)" },
    ]);
  });

  it("фильтрует строго по префиксу: /se → /setup + /settings", () => {
    expect(matchCommands("/se")).toEqual([
      { name: "/setup", label: "настроить провайдера" },
      { name: "/settings", label: "настройки" },
    ]);
  });

  it("находит /setup по префиксу /setup", () => {
    expect(matchCommands("/setup")).toEqual([
      { name: "/setup", label: "настроить провайдера" },
    ]);
  });

  it("возвращает пустой массив при отсутствии совпадений", () => {
    expect(matchCommands("/xyz")).toEqual([]);
  });

  it("возвращает все команды для пустого префикса-слэша", () => {
    expect(matchCommands("/")).toEqual(COMMANDS);
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

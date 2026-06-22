import { describe, it, expect, beforeEach } from "vitest";
import { useStore, selectHistory } from "../state/store";
import { executeTurn } from "../agent/loop";
import { handleCommand } from "../agent/commands";
import type { LLMProvider, StreamEvent } from "../agent/providers/types";

function mockProvider(tokens: string[], opts?: { throwError?: Error }): LLMProvider {
  async function* gen(): AsyncIterable<StreamEvent> {
    if (opts?.throwError) throw opts.throwError;
    for (const t of tokens) yield { type: "token", text: t };
    yield { type: "done" };
  }
  return { streamTurn: () => gen() };
}

/** Мок, эмиттящий tool_call (имитация reasoning-модели: content пуст, есть reply). */
function toolProvider(input: unknown): LLMProvider {
  async function* gen(): AsyncIterable<StreamEvent> {
    yield { type: "toolCall", toolName: "bartender_action", input };
    yield { type: "done" };
  }
  return { streamTurn: () => gen() };
}

/** Мок reasoning-модели: сначала мышление, затем tool_call (имитация DeepSeek). */
function reasoningProvider(reasoning: string[], input: unknown): LLMProvider {
  async function* gen(): AsyncIterable<StreamEvent> {
    for (const r of reasoning) yield { type: "reasoning", text: r };
    yield { type: "toolCall", toolName: "bartender_action", input };
    yield { type: "done" };
  }
  return { streamTurn: () => gen() };
}

describe("agent loop (M1)", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("накапливает стрим и коммитит реплику бармена", async () => {
    const p = mockProvider(["Прив", "ет, ", "дружи", "ще!"]);
    await executeTurn(p, "здорова");

    const state = useStore.getState();
    expect(state.streamingText).toBe("");
    expect(state.busy).toBe(false);

    const bartenderLines = state.lines.filter((l) => l.speaker === "bartender");
    const last = bartenderLines[bartenderLines.length - 1];
    expect(last.text).toBe("Привет, дружище!");
  });

  it("добавляет реплику пользователя в историю для LLM", async () => {
    const p = mockProvider(["ок"]);
    await executeTurn(p, "налей пива");

    const history = selectHistory(useStore.getState());
    const roles = history.map((m) => m.role);
    expect(roles).toContain("user");
    const userMsg = history.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("налей пива");
  });

  it("при ошибке провайдера даёт fallback-реплику и кидает ошибку", async () => {
    const p = mockProvider([], { throwError: new Error("boom") });
    await expect(executeTurn(p, "эй")).rejects.toThrow("boom");

    const state = useStore.getState();
    expect(state.busy).toBe(false);
    const bartenderLines = state.lines
      .filter((l) => l.speaker === "bartender")
      .map((l) => l.text);
    expect(bartenderLines.length).toBeGreaterThan(0);
  });

  it("tool-flow: reply раскрывается машункой при пустом content", async () => {
    const p = toolProvider({
      reply: "Держи, приятель.",
      mood: "cheerful",
      action: "chat",
      drunkennessAssessment: { score: 1, cues: [] },
    });
    await executeTurn(p, "привет");

    const state = useStore.getState();
    expect(state.mood).toBe("cheerful");
    const last = [...state.lines].reverse().find((l) => l.speaker === "bartender");
    expect(last?.text).toBe("Держи, приятель.");
  });

  it("tool-flow: pour_drink добавляет напиток, таб и запускает pouring", async () => {
    const p = toolProvider({
      reply: "Наливаю.",
      mood: "cheerful",
      action: "pour_drink",
      drink: { name: "Олд фэшнд", alcoholic: true, units: 2, price: 700 },
      drunkennessAssessment: { score: 1, cues: [] },
    });
    await executeTurn(p, "налей");

    const state = useStore.getState();
    expect(state.served).toHaveLength(1);
    expect(state.tab).toBe(700);
    expect(state.bacProxy).toBe(2);
    expect(state.pouring).toBe("Олд фэшнд");
  });

  it("tool-flow: forced refuse — пьяному алкоголь не наливается", async () => {
    useStore.setState({ perceivedScore: 9, bacProxy: 6, drunkenness: 9.6 });
    const p = toolProvider({
      reply: "Хватит, дружище.",
      mood: "concerned",
      action: "pour_drink",
      drink: { name: "Водка", alcoholic: true, units: 3, price: 500 },
      drunkennessAssessment: { score: 9, cues: ["шатается"] },
    });
    await executeTurn(p, "ещё!");

    const state = useStore.getState();
    expect(state.served).toHaveLength(0);
    expect(state.tab).toBe(0);
    expect(state.pouring).toBeNull();
    expect(state.mood).toBe("firm");
  });

  it("tool-flow: call_taxi переводит фазу в leaving", async () => {
    const p = toolProvider({
      reply: "Вызываю такси.",
      mood: "firm",
      action: "call_taxi",
      drunkennessAssessment: { score: 9, cues: [] },
    });
    await executeTurn(p, "домой");

    const state = useStore.getState();
    expect(state.phase).toBe("leaving");
    const hasTaxiHint = state.lines.some(
      (l) => l.speaker === "system" && l.text.includes("такси"),
    );
    expect(hasTaxiHint).toBe(true);
  });

  it("reasoning-токены не попадают в видимый диалог", async () => {
    const p = reasoningProvider(
      ["Нужно оценить опьянение... score 9...", "action: call_taxi"],
      {
        reply: "Вызываю такси, дружище.",
        mood: "firm",
        action: "call_taxi",
        drunkennessAssessment: { score: 9, cues: ["агрессия"] },
      },
    );
    await executeTurn(p, "иди нахуй");

    const state = useStore.getState();
    expect(state.lastReasoning).toContain("score 9");
    const last = [...state.lines].reverse().find((l) => l.speaker === "bartender");
    expect(last?.text).toBe("Вызываю такси, дружище.");
    expect(state.lines.some((l) => l.text.includes("score 9"))).toBe(false);
  });

  it("/state показывает последний reasoning", async () => {
    const p = reasoningProvider(
      ["оцениваю гостя..."],
      {
        reply: "Держи.",
        mood: "cheerful",
        action: "chat",
        drunkennessAssessment: { score: 1, cues: [] },
      },
    );
    await executeTurn(p, "привет");

    handleCommand("/state");
    const state = useStore.getState();
    const sysLine = [...state.lines].reverse().find((l) => l.speaker === "system");
    expect(sysLine?.text).toContain("reasoning:");
    expect(sysLine?.text).toContain("оцениваю гостя...");
  });
});

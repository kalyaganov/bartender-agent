import { describe, it, expect, beforeEach } from "vitest";
import { useStore, selectHistory } from "../state/store";
import { cancelCurrentTurn, executeTurn } from "../agent/loop";
import { handleCommand } from "../agent/commands";
import { ProviderError } from "../agent/providers/errors";
import type {
  GenerationConfig,
  LLMProvider,
  StreamPart,
  StreamTurnOptions,
} from "../agent/providers/types";

function makeProvider(gen: () => AsyncIterable<StreamPart>): LLMProvider {
  return {
    provider: "mock",
    modelId: "mock-model",
    capabilities: { supportsTools: true, supportsReasoning: false },
    streamTurn: () => gen(),
  };
}

function optsCapturingProvider(
  gen: (opts: StreamTurnOptions) => AsyncIterable<StreamPart>,
  caps = { supportsTools: true, supportsReasoning: false },
): { provider: LLMProvider; lastOpts: () => StreamTurnOptions } {
  let lastOpts: StreamTurnOptions;
  return {
    provider: {
      provider: "mock",
      modelId: "mock-model",
      capabilities: caps,
      streamTurn: (opts) => {
        lastOpts = opts;
        return gen(opts);
      },
    },
    lastOpts: () => lastOpts,
  };
}

function mockProvider(tokens: string[], opts?: { throwError?: Error }): LLMProvider {
  return makeProvider(async function* (): AsyncIterable<StreamPart> {
    if (opts?.throwError) throw opts.throwError;
    for (const t of tokens) yield { type: "text-delta", text: t };
    yield { type: "finish", finishReason: "stop" };
  });
}

function mockProviderWithUsage(tokens: string[]): LLMProvider {
  return makeProvider(async function* (): AsyncIterable<StreamPart> {
    for (const t of tokens) yield { type: "text-delta", text: t };
    yield {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  });
}

function toolProvider(input: unknown): LLMProvider {
  return makeProvider(async function* (): AsyncIterable<StreamPart> {
    yield { type: "tool-call", toolCallId: "c1", toolName: "bartender_action", args: input };
    yield { type: "finish", finishReason: "tool-calls" };
  });
}

function reasoningProvider(reasoning: string[], input: unknown): LLMProvider {
  return makeProvider(async function* (): AsyncIterable<StreamPart> {
    for (const r of reasoning) yield { type: "reasoning-delta", text: r };
    yield { type: "tool-call", toolCallId: "c1", toolName: "bartender_action", args: input };
    yield { type: "finish", finishReason: "tool-calls" };
  });
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

  it("записывает usage из finish-события", async () => {
    const p = mockProviderWithUsage(["ок"]);
    await executeTurn(p, "привет");
    expect(useStore.getState().lastUsage).toEqual({ inputTokens: 10, outputTokens: 20 });
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

  it("не сохраняет частичный ответ после ошибки", async () => {
    const p = makeProvider(async function* () {
      yield { type: "text-delta", text: "оборванный ответ" };
      throw new ProviderError("Некорректный запрос (400)", "badRequest", false);
    });
    await expect(executeTurn(p, "эй")).rejects.toThrow(/запрос/);
    const state = useStore.getState();
    expect(state.streamingText).toBe("");
    expect(state.lines.some((line) => line.text.includes("оборванный ответ"))).toBe(false);
  });

  it("abort очищает стрим без fallback-реплики", async () => {
    const initialBartenderLines = useStore.getState().lines.filter((line) => line.speaker === "bartender").length;
    const p = makeProvider(async function* () {
      yield { type: "text-delta", text: "оборванный ответ" };
      throw new DOMException("aborted", "AbortError");
    });
    await expect(executeTurn(p, "эй")).rejects.toMatchObject({ kind: "abort" });
    const state = useStore.getState();
    expect(state.streamingText).toBe("");
    expect(state.lines.filter((line) => line.speaker === "bartender")).toHaveLength(initialBartenderLines);
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
    expect(sysLine?.text).toContain("ход: попыток=1");
  });

  it("выбирает tool.reply вместо content", async () => {
    const p = makeProvider(async function* () {
      yield { type: "text-delta", text: "Текст из content." };
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "bartender_action",
        args: {
          reply: "Текст из инструмента.",
          mood: "cheerful",
          action: "chat",
          drunkennessAssessment: { score: 1, cues: [] },
        },
      };
      yield { type: "finish", finishReason: "tool-calls" };
    });
    await executeTurn(p, "привет");

    const state = useStore.getState();
    const last = [...state.lines].reverse().find((line) => line.speaker === "bartender");
    expect(last?.text).toBe("Текст из инструмента.");
    expect(state.lastTurnStatus).toMatchObject({
      toolCallStatus: "valid",
      contentConflict: true,
      replySource: "tool-reply",
    });
  });

  it("сохраняет content без tool-call, но не применяет действие", async () => {
    const p = mockProvider(["Просто ответ."]);
    await executeTurn(p, "привет");

    const state = useStore.getState();
    const last = [...state.lines].reverse().find((line) => line.speaker === "bartender");
    expect(last?.text).toBe("Просто ответ.");
    expect(state.lastTurnStatus).toMatchObject({
      toolCallStatus: "missing",
      replySource: "content",
    });
  });

  it("игнорирует чужой tool-call и фиксирует его в диагностике", async () => {
    const p = makeProvider(async function* () {
      yield { type: "tool-call", toolCallId: "other", toolName: "other_tool", args: {} };
      yield {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "bartender_action",
        args: {
          reply: "Держи стакан воды.",
          mood: "cheerful",
          action: "chat",
          drunkennessAssessment: { score: 1, cues: [] },
        },
      };
      yield { type: "finish", finishReason: "tool-calls" };
    });
    await executeTurn(p, "привет");

    expect(useStore.getState().lastTurnStatus).toMatchObject({
      toolCallStatus: "valid",
      bartenderToolCalls: 1,
      unexpectedToolCalls: 1,
    });
  });

  it("не применяет неоднозначные tool-call", async () => {
    const drinkAction = {
      reply: "Наливаю.",
      mood: "cheerful",
      action: "pour_drink",
      drink: { name: "Пиво", alcoholic: true, units: 1, price: 300 },
      drunkennessAssessment: { score: 1, cues: [] },
    };
    const p = makeProvider(async function* () {
      yield { type: "text-delta", text: "Секунду." };
      yield { type: "tool-call", toolCallId: "c1", toolName: "bartender_action", args: drinkAction };
      yield { type: "tool-call", toolCallId: "c2", toolName: "bartender_action", args: drinkAction };
      yield { type: "finish", finishReason: "tool-calls" };
    });
    await executeTurn(p, "налей");

    const state = useStore.getState();
    expect(state.served).toHaveLength(0);
    expect(state.lastTurnStatus).toMatchObject({
      toolCallStatus: "multiple",
      bartenderToolCalls: 2,
      replySource: "content",
    });
  });

  it("сбрасывает результат неудачной попытки перед retry", async () => {
    let calls = 0;
    const drinkAction = {
      reply: "Наливаю.",
      mood: "cheerful",
      action: "pour_drink",
      drink: { name: "Пиво", alcoholic: true, units: 1, price: 300 },
      drunkennessAssessment: { score: 1, cues: [] },
    };
    const p = makeProvider(async function* () {
      calls++;
      yield { type: "tool-call", toolCallId: `c${calls}`, toolName: "bartender_action", args: drinkAction };
      if (calls === 1) throw new ProviderError("ECONNRESET", "network", true, 1);
      yield { type: "finish", finishReason: "tool-calls" };
    });
    await executeTurn(p, "налей");

    const state = useStore.getState();
    expect(calls).toBe(2);
    expect(state.served).toHaveLength(1);
    expect(state.lastTurnStatus.attempts).toBe(2);
  });

  it("отмена во время retry-backoff не запускает следующую попытку", async () => {
    let calls = 0;
    const p = makeProvider(async function* () {
      calls++;
      throw new ProviderError("ECONNRESET", "network", true, 1000);
    });
    const turn = executeTurn(p, "привет");
    await new Promise((resolve) => setTimeout(resolve, 10));
    cancelCurrentTurn();

    await expect(turn).rejects.toMatchObject({ kind: "abort" });
    expect(calls).toBe(1);
    expect(useStore.getState().lastTurnStatus).toMatchObject({
      attempts: 1,
      errorKind: "abort",
      replySource: "none",
    });
  });
});

describe("executeTurn — tool choice (Фаза 3)", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("не форсирует tool_choice: providers расходятся во поддержке (ZAI режектит named, DeepSeek-thinking режектит required). System prompt обязывает модель вызывать bartender_action каждый ход.", async () => {
    const { provider, lastOpts } = optsCapturingProvider(async function* () {
      yield { type: "text-delta", text: "ок" };
      yield { type: "finish", finishReason: "stop" };
    });
    await executeTurn(provider, "привет");
    expect(lastOpts().toolChoice).toBeUndefined();
  });
});

describe("executeTurn — generation gating (Фаза 3)", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("не включает reasoning для модели без canReason", async () => {
    const { provider, lastOpts } = optsCapturingProvider(async function* () {
      yield { type: "text-delta", text: "ок" };
      yield { type: "finish", finishReason: "stop" };
    });
    await executeTurn(provider, "привет");
    const gen = lastOpts().generation as GenerationConfig;
    expect(gen.reasoning).toBeUndefined();
    expect(gen.temperature).toBe(0.8);
  });
});

describe("executeTurn — умный retry (Фаза 3)", () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it("auth-ошибка не ретраится (1 вызов)", async () => {
    let calls = 0;
    const p: LLMProvider = {
      provider: "mock",
      modelId: "m",
      capabilities: { supportsTools: true, supportsReasoning: false },
      streamTurn: async function* () {
        calls++;
        throw new ProviderError("Ошибка аутентификации (401)", "auth", false);
      },
    };
    await expect(executeTurn(p, "привет")).rejects.toThrow(/аутентификации/);
    expect(calls).toBe(1);
  });

  it("badRequest не ретраится", async () => {
    let calls = 0;
    const p: LLMProvider = {
      provider: "mock",
      modelId: "m",
      capabilities: { supportsTools: true, supportsReasoning: false },
      streamTurn: async function* () {
        calls++;
        throw new ProviderError("Некорректный запрос (400)", "badRequest", false);
      },
    };
    await expect(executeTurn(p, "привет")).rejects.toThrow(/запрос/);
    expect(calls).toBe(1);
  });

  it("rateLimit ретраится и затем успех (уважает retryAfterMs)", async () => {
    let calls = 0;
    const p: LLMProvider = {
      provider: "mock",
      modelId: "m",
      capabilities: { supportsTools: true, supportsReasoning: false },
      streamTurn: async function* () {
        calls++;
        if (calls === 1) {
          throw new ProviderError("Превышен лимит запросов", "rateLimit", true, 1);
        }
        yield { type: "text-delta", text: "ок" };
        yield { type: "finish", finishReason: "stop" };
      },
    };
    await executeTurn(p, "привет");
    expect(calls).toBe(2);
    const last = [...useStore.getState().lines].reverse().find((l) => l.speaker === "bartender");
    expect(last?.text).toBe("ок");
  });

  it("network ретраится до лимита попыток", async () => {
    let calls = 0;
    const p: LLMProvider = {
      provider: "mock",
      modelId: "m",
      capabilities: { supportsTools: true, supportsReasoning: false },
      streamTurn: async function* () {
        calls++;
        throw new ProviderError("ECONNRESET", "network", true);
      },
    };
    await expect(executeTurn(p, "привет")).rejects.toThrow(/ECONNRESET|сетев/);
    expect(calls).toBeGreaterThan(1);
  });
});

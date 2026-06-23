import { describe, it, expect, vi, beforeEach } from "vitest";

type Delta = Record<string, unknown>;

function chunk(delta: Delta, extra: Record<string, unknown> = {}): unknown {
  return { choices: [{ delta, ...extra }] };
}

function usageChunk(usage: Record<string, number>): unknown {
  return { choices: [], usage };
}

function fakeStream(items: unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (i >= items.length) return Promise.resolve({ done: true, value: undefined });
          return Promise.resolve({ done: false, value: items[i++] });
        },
      };
    },
  };
}

const createMock = vi.fn();
const ctorArgs: Array<{ apiKey?: string; baseURL?: string }> = [];

vi.mock("openai", () => ({
  default: class {
    constructor(opts: { apiKey?: string; baseURL?: string }) {
      ctorArgs.push(opts);
    }
    chat = { completions: { create: createMock } };
  },
}));

import { OpenAIProvider } from "../agent/providers/openai";
import { createProvider } from "../agent/providers";
import type { LLMProvider, StreamPart } from "../agent/providers/types";

const CAPS = { supportsTools: true, supportsReasoning: false };

function makeProvider(model = "model", baseURL?: string): OpenAIProvider {
  return new OpenAIProvider({
    apiKey: "key",
    model,
    baseURL,
    capabilities: CAPS,
  });
}

async function collect(p: LLMProvider): Promise<StreamPart[]> {
  const events: StreamPart[] = [];
  for await (const ev of p.streamTurn({ system: "", messages: [] })) events.push(ev);
  return events;
}

function bodyOf(): Record<string, unknown> {
  return createMock.mock.calls[0][0] as Record<string, unknown>;
}

describe("OpenAIProvider streaming", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorArgs.length = 0;
  });

  it("разделяет reasoning_content и content", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        chunk({ reasoning_content: "Думаю..." }),
        chunk({ content: "Привет, " }),
        chunk({ reasoning_content: "оценка: 1" }),
        chunk({ content: "дружище!" }),
      ]),
    );

    const events = await collect(makeProvider("deepseek-test"));
    const reasoning = events
      .filter((e) => e.type === "reasoning-delta")
      .map((e) => (e as { text: string }).text)
      .join("");
    const tokens = events
      .filter((e) => e.type === "text-delta")
      .map((e) => (e as { text: string }).text)
      .join("");

    expect(reasoning).toBe("Думаю...оценка: 1");
    expect(tokens).toBe("Привет, дружище!");
  });

  it("ловит reasoning из поля reasoning (не только reasoning_content)", async () => {
    createMock.mockResolvedValue(
      fakeStream([chunk({ reasoning: "thought" }), chunk({ content: "ok" })]),
    );
    const events = await collect(makeProvider());
    expect(events.some((e) => e.type === "reasoning-delta" && (e as { text: string }).text === "thought")).toBe(true);
  });

  it("пропускает пустые/отсутствующие поля", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        chunk({ reasoning_content: "" }),
        chunk({ content: null }),
        chunk({ reasoning_content: "мысль" }),
      ]),
    );
    const events = await collect(makeProvider());
    expect(events.filter((e) => e.type === "reasoning-delta")).toHaveLength(1);
    expect(events.filter((e) => e.type === "text-delta")).toHaveLength(0);
  });

  it("эмитит finish в конце", async () => {
    createMock.mockResolvedValue(fakeStream([chunk({ content: "hi" })]));
    const events = await collect(makeProvider());
    const finish = events.at(-1);
    expect(finish?.type).toBe("finish");
  });

  it("несёт usage из чанка, если есть", async () => {
    createMock.mockResolvedValue(
      fakeStream([chunk({ content: "hi" }), usageChunk({ prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 })]),
    );
    const events = await collect(makeProvider());
    const finish = events.find((e) => e.type === "finish") as { usage?: { inputTokens?: number; outputTokens?: number } };
    expect(finish.usage?.inputTokens).toBe(5);
    expect(finish.usage?.outputTokens).toBe(7);
  });
});

describe("OpenAIProvider tool calls", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorArgs.length = 0;
  });

  it("парсит один tool_call в конце стрима", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        chunk({
          tool_calls: [
            { function: { name: "bartender_action", arguments: '{"reply":"ок"}' } },
          ],
        }),
      ]),
    );
    const events = await collect(makeProvider());
    const tc = events.find((e) => e.type === "tool-call");
    expect(tc).toBeDefined();
    expect((tc as { args: unknown }).args).toEqual({ reply: "ок" });
  });

  it("эмитит tool-call-delta при поступлении аргументов", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        chunk({ tool_calls: [{ id: "c1", function: { name: "f", arguments: '{"a":' } }] }),
        chunk({ tool_calls: [{ function: { arguments: "1}" } }] }),
      ]),
    );
    const events = await collect(makeProvider());
    const deltas = events.filter((e) => e.type === "tool-call-delta");
    expect(deltas).toHaveLength(2);
    const tc = events.find((e) => e.type === "tool-call") as { args: unknown };
    expect(tc.args).toEqual({ a: 1 });
  });

  it("не теряет несколько tool_calls", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        chunk({
          tool_calls: [
            { index: 0, id: "c1", function: { name: "f", arguments: '{"x":1}' } },
            { index: 1, id: "c2", function: { name: "g", arguments: '{"y":2}' } },
          ],
        }),
      ]),
    );
    const events = await collect(makeProvider());
    const calls = events.filter((e) => e.type === "tool-call");
    expect(calls).toHaveLength(2);
    expect((calls[0] as { toolCallId: string }).toolCallId).toBe("c1");
    expect((calls[1] as { toolCallId: string }).toolCallId).toBe("c2");
  });
});

describe("OpenAIProvider baseURL и tool_choice", () => {
  beforeEach(() => {
    createMock.mockReset();
    ctorArgs.length = 0;
    createMock.mockResolvedValue(fakeStream([]));
  });

  it("передаёт baseURL в клиент OpenAI", async () => {
    await collect(makeProvider("m", "https://api.groq.com/openai/v1"));
    expect(ctorArgs.at(-1)?.baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("без baseURL — undefined", async () => {
    await collect(makeProvider("m"));
    expect(ctorArgs.at(-1)?.baseURL).toBeUndefined();
  });

  it("forced tool_choice маппится в function", async () => {
    const p = makeProvider();
    for await (const _ of p.streamTurn({
      system: "",
      messages: [],
      tools: [{ name: "bartender_action", description: "", inputSchema: {} }],
      toolChoice: { type: "tool", toolName: "bartender_action" },
    })) {
      void _;
    }
    expect(bodyOf().tool_choice).toEqual({
      type: "function",
      function: { name: "bartender_action" },
    });
  });

  it("tool_choice required → required", async () => {
    const p = makeProvider();
    for await (const _ of p.streamTurn({
      system: "",
      messages: [],
      tools: [{ name: "f", description: "", inputSchema: {} }],
      toolChoice: "required",
    })) {
      void _;
    }
    expect(bodyOf().tool_choice).toBe("required");
  });

  it("без явного tool_choice при наличии tools — auto", async () => {
    const p = makeProvider();
    for await (const _ of p.streamTurn({
      system: "",
      messages: [],
      tools: [{ name: "f", description: "", inputSchema: {} }],
    })) {
      void _;
    }
    expect(bodyOf().tool_choice).toBe("auto");
  });
});

describe("createProvider", () => {
  it("строит провайдер с переданными endpoint/token/model", () => {
    const p = createProvider({
      endpoint: "https://opencode.ai/zen/go/v1",
      token: "sk-test",
      model: "deepseek-v4-pro",
      thinking: false,
    });
    expect(p.modelId).toBe("deepseek-v4-pro");
    expect(p.capabilities.supportsTools).toBe(true);
    expect(p.capabilities.supportsReasoning).toBe(false);
  });

  it("thinking=true → supportsReasoning=true", () => {
    const p = createProvider({
      endpoint: "https://x",
      token: "t",
      model: "m",
      thinking: true,
    });
    expect(p.capabilities.supportsReasoning).toBe(true);
  });
});

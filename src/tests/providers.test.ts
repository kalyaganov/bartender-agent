import { describe, it, expect, vi, beforeEach } from "vitest";

type Delta = Record<string, unknown>;

function makeChunk(delta: Delta): unknown {
  return { choices: [{ delta }] };
}

function fakeStream(deltas: Delta[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<unknown>> {
          if (i >= deltas.length) return Promise.resolve({ done: true, value: undefined });
          return Promise.resolve({ done: false, value: makeChunk(deltas[i++]) });
        },
      };
    },
  };
}

const createMock = vi.fn();

vi.mock("openai", () => {
  return {
    default: class {
      chat = { completions: { create: createMock } };
    },
  };
});

import { OpenAIProvider } from "../agent/providers/openai";
import type { LLMProvider, StreamEvent } from "../agent/providers/types";

async function collect(p: LLMProvider): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of p.streamTurn({ system: "", messages: [] })) events.push(ev);
  return events;
}

describe("OpenAIProvider reasoning classification (T4)", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("разделяет reasoning_content и content", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        { reasoning_content: "Думаю..." },
        { content: "Привет, " },
        { reasoning_content: "оценка: 1" },
        { content: "дружище!" },
      ]),
    );

    const provider = new OpenAIProvider("key", "deepseek-test");
    const events = await collect(provider);

    const reasoning = events
      .filter((e) => e.type === "reasoning")
      .map((e) => (e as { text: string }).text)
      .join("");
    const tokens = events
      .filter((e) => e.type === "token")
      .map((e) => (e as { text: string }).text)
      .join("");

    expect(reasoning).toBe("Думаю...оценка: 1");
    expect(tokens).toBe("Привет, дружище!");
  });

  it("пропускает пустые/отсутствующие поля", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        { reasoning_content: "" },
        { content: null },
        { reasoning_content: "мысль" },
      ]),
    );

    const provider = new OpenAIProvider("key", "model");
    const events = await collect(provider);

    const reasoning = events.filter((e) => e.type === "reasoning");
    const tokens = events.filter((e) => e.type === "token");
    expect(reasoning).toHaveLength(1);
    expect(tokens).toHaveLength(0);
  });

  it("парсит tool_call в конце стрима", async () => {
    createMock.mockResolvedValue(
      fakeStream([
        { reasoning_content: "plan" },
        {
          tool_calls: [
            {
              function: {
                name: "bartender_action",
                arguments: '{"reply":"ок"}',
              },
            },
          ],
        },
      ]),
    );

    const provider = new OpenAIProvider("key", "model");
    const events = await collect(provider);
    const toolCall = events.find((e) => e.type === "toolCall");
    expect(toolCall).toBeDefined();
    expect((toolCall as { input: unknown }).input).toEqual({ reply: "ок" });
  });
});

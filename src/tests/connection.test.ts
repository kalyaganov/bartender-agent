import { describe, expect, it } from "vitest";
import { probeProvider } from "../agent/connection";
import type { LLMProvider, StreamPart, StreamTurnOptions } from "../agent/providers/types";

function provider(events: StreamPart[]): { provider: LLMProvider; options: StreamTurnOptions[] } {
  const options: StreamTurnOptions[] = [];
  return {
    options,
    provider: {
      provider: "test",
      modelId: "test-model",
      capabilities: { supportsTools: true, supportsReasoning: true },
      async *streamTurn(opts) {
        options.push(opts);
        yield* events;
      },
    },
  };
}

const validAction = {
  reply: "Всё в порядке.",
  mood: "neutral",
  action: "chat",
  drunkennessAssessment: { score: 0, cues: [] },
};

describe("probeProvider", () => {
  it("проверяет Chat Completions с настоящим инструментом", async () => {
    const mock = provider([
      { type: "tool-call", toolCallId: "call_1", toolName: "bartender_action", args: validAction },
      { type: "finish", finishReason: "tool-calls" },
    ]);

    await expect(probeProvider(mock.provider, false)).resolves.toBe("ready");
    expect(mock.options[0].tools?.[0]?.name).toBe("bartender_action");
    expect(mock.options[0].generation).toMatchObject({ temperature: 0.8, maxOutputTokens: 4096 });
    expect(mock.options[0].generation?.reasoning).toBeUndefined();
  });

  it("предупреждает, если модель не поддержала обязательный инструмент", async () => {
    const mock = provider([
      { type: "text-delta", text: "Обычный ответ" },
      { type: "finish", finishReason: "stop" },
    ]);

    await expect(probeProvider(mock.provider, true)).resolves.toBe("tools-unavailable");
    expect(mock.options[0].generation).toMatchObject({
      maxOutputTokens: 4096,
      reasoning: { budgetTokens: 2048 },
    });
  });

  it("пробрасывает ошибку провайдера", async () => {
    const mock = provider([]);
    mock.provider.streamTurn = async function* () {
      throw new Error("connection failed");
    };

    await expect(probeProvider(mock.provider, false)).rejects.toThrow("connection failed");
  });
});

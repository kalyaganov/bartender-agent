import { config } from "../config";
import { createProvider, type ProviderConfig } from "./providers";
import type { GenerationConfig, LLMProvider } from "./providers/types";
import { BARTENDER_TOOL, parseBartenderAction } from "./tools";

export type ConnectionCheckResult = "ready" | "tools-unavailable";

function generationConfig(thinking: boolean): GenerationConfig {
  return {
    temperature: config.generation.temperature,
    maxOutputTokens: config.generation.maxOutputTokens,
    ...(thinking
      ? { reasoning: { budgetTokens: config.reasoning.budgetTokens } }
      : {}),
  };
}

export async function probeProvider(
  provider: LLMProvider,
  thinking: boolean,
): Promise<ConnectionCheckResult> {
  let validAction = false;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.loop.providerTimeoutMs);

  try {
    for await (const event of provider.streamTurn({
      system: "Это техническая проверка настройки бара. Обязательно вызови bartender_action с корректными полями. Не пиши обычный текст.",
      messages: [{ role: "user", content: "Проверь соединение." }],
      tools: [BARTENDER_TOOL],
      generation: generationConfig(thinking),
      signal: controller.signal,
    })) {
      if (event.type === "tool-call" && event.toolName === BARTENDER_TOOL.name) {
        validAction ||= parseBartenderAction(event.args) !== null;
      }
    }
  } catch (err) {
    if (timedOut) throw new Error("Истекло время ожидания ответа провайдера");
    throw err;
  } finally {
    clearTimeout(timer);
  }

  return validAction ? "ready" : "tools-unavailable";
}

export function checkConnection(cfg: ProviderConfig): Promise<ConnectionCheckResult> {
  return probeProvider(createProvider(cfg), cfg.thinking);
}

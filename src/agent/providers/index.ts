import { OpenAIProvider } from "./openai";
import type { LLMProvider, ProviderCapabilities } from "./types";

export interface ProviderConfig {
  endpoint: string;
  token: string;
  model: string;
  thinking: boolean;
}

export function createProvider(cfg: ProviderConfig): LLMProvider {
  const capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsReasoning: cfg.thinking,
  };
  return new OpenAIProvider({
    apiKey: cfg.token,
    model: cfg.model,
    baseURL: cfg.endpoint,
    capabilities,
  });
}

export type { LLMProvider } from "./types";

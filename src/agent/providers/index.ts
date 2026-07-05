import { OpenAIProvider } from "./openai";
import type { LLMProvider, ProviderCapabilities } from "./types";

export interface ProviderConfig {
  endpoint: string;
  token: string;
  model: string;
  thinking: boolean;
  extraHeaders?: Record<string, string>;
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
    extraHeaders: cfg.extraHeaders,
    capabilities,
  });
}

export type { LLMProvider } from "./types";

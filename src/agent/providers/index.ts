import { OpenAIProvider } from "./openai";
import type { ProviderConnectionConfig } from "../models";
import type { LLMProvider, ProviderCapabilities } from "./types";

export interface ProviderConfig extends ProviderConnectionConfig {
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
    extraHeaders: cfg.extraHeaders,
    capabilities,
  });
}

export type { ProviderConnectionConfig } from "../models";
export type { LLMProvider } from "./types";

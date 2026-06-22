import { config } from "../../config";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import type { LLMProvider, ProviderId } from "./types";

export interface ProviderDef {
  id: ProviderId;
  label: string;
  defaultModel: string;
  configured: boolean;
  build: (model?: string) => LLMProvider;
}

export const ALL_PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultModel: "claude-3-5-haiku-latest",
    configured: Boolean(config.apiKeys.anthropic),
    build: (model) => {
      const key = config.apiKeys.anthropic;
      if (!key) throw new Error("ANTHROPIC_API_KEY не задан в .env");
      return new AnthropicProvider(key, model ?? "claude-3-5-haiku-latest");
    },
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    defaultModel: "gpt-4o-mini",
    configured: Boolean(config.apiKeys.openai),
    build: (model) => {
      const key = config.apiKeys.openai;
      if (!key) throw new Error("OPENAI_API_KEY не задан в .env");
      return new OpenAIProvider(key, model ?? "gpt-4o-mini");
    },
  },
  {
    id: "opencode-go",
    label: "OpenCode Go (deepseek)",
    defaultModel: "deepseek-v4-pro",
    configured: Boolean(config.apiKeys["opencode-go"]),
    build: (model) => {
      const key = config.apiKeys["opencode-go"];
      if (!key) throw new Error("OPENCODE_GO_API_KEY не задан в .env");
      return new OpenAIProvider(
        key,
        model ?? "deepseek-v4-pro",
        config.baseURLs["opencode-go"],
      );
    },
  },
];

export const PROVIDERS: ProviderDef[] = ALL_PROVIDERS.filter((p) => p.configured);

export function getProviderDef(id: ProviderId): ProviderDef | undefined {
  return ALL_PROVIDERS.find((p) => p.id === id);
}

export function configuredProviderIds(): ProviderId[] {
  return ALL_PROVIDERS.filter((p) => p.configured).map((p) => p.id);
}

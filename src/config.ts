import { z } from "zod";
import type { ProviderId } from "./agent/providers/types";

const EnvSchema = z.object({
  BARTENDER_PROVIDER: z
    .enum(["anthropic", "openai", "opencode-go"])
    .optional(),
  BARTENDER_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENCODE_GO_API_KEY: z.string().optional(),
  OPENCODE_GO_BASE_URL: z
    .string()
    .default("https://opencode.ai/zen/go/v1"),
});

const parsed = EnvSchema.parse(process.env);

export const config = {
  provider: parsed.BARTENDER_PROVIDER as ProviderId | undefined,
  model: parsed.BARTENDER_MODEL,
  apiKeys: {
    anthropic: parsed.ANTHROPIC_API_KEY,
    openai: parsed.OPENAI_API_KEY,
    "opencode-go": parsed.OPENCODE_GO_API_KEY,
  },
  baseURLs: {
    "opencode-go": parsed.OPENCODE_GO_BASE_URL,
  },

  drunkenness: {
    perceivedWeight: 0.8,
    bacProxyWeight: 0.4,
    refuseThreshold: 7,
    metabolismRatePerMin: 0.05,
  },

  loop: {
    maxTurnsPerSession: 120,
    providerTimeoutMs: 30_000,
    retryAttempts: 2,
    retryBackoffMs: 800,
  },

  ui: {
    blinkIntervalMs: 3500,
    blinkDurationMs: 120,
    typewriterDelayMs: 12,
    metabolismTickMs: 60_000,
  },

  reasoning: {
    anthropicThinking: false as boolean,
    anthropicThinkingBudget: 1024 as number,
  },

  disclaimer:
    "Это игра-симуляция. Бармен вымышлен. Пейте ответственно.",
} as const;

export type Config = typeof config;

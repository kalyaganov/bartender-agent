export const config = {
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
    fixedOverhead: 20,
  },

  generation: {
    temperature: 0.8 as number,
    maxOutputTokens: 1024 as number,
  },

  reasoning: {
    budgetTokens: 1024 as number,
  },

  disclaimer:
    "Это игра-симуляция. Бармен вымышлен. Пейте ответственно.",
} as const;

export type Config = typeof config;

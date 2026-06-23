import { config } from "../config";
import { useStore, selectHistory } from "../state/store";
import { useAppStore } from "../state/app";
import { buildSystemPrompt } from "./prompt";
import { createProvider, type LLMProvider } from "./providers";
import type { GenerationConfig } from "./providers/types";
import { toProviderError } from "./providers/errors";
import { BARTENDER_TOOL, parseBartenderAction } from "./tools";
import { isConfigured } from "../persistence";

function getProvider(): LLMProvider {
  const { prefs } = useAppStore.getState();
  if (!isConfigured(prefs)) {
    throw new Error("Провайдер не настроен. Команда /setup — ввести endpoint, token, модель.");
  }
  return createProvider({
    endpoint: prefs.endpoint!,
    token: prefs.token!,
    model: prefs.model!,
    thinking: prefs.thinking ?? false,
  });
}

/** Текущий контроллер хода — чтобы можно было прервать стрим извне (выход). */
let currentController: AbortController | null = null;

export function cancelCurrentTurn(): void {
  if (currentController) currentController.abort();
}

const FALLBACK_REPLIES = [
  "Хм, отвлёкся на бокал. Повтори-ка, дружище?",
  "Заело меня на секунду. Что говорил?",
  "Шумно сегодня за стойкой. Не расслышал, приятель.",
];

async function withRetry<T>(
  fn: (signal: AbortSignal) => AsyncIterable<T>,
  onItem: (item: T) => void,
  onRetry?: () => void,
): Promise<void> {
  const { retryAttempts, retryBackoffMs, providerTimeoutMs } = config.loop;
  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    const controller = new AbortController();
    currentController = controller;
    const timer = setTimeout(() => controller.abort(), providerTimeoutMs);
    try {
      for await (const item of fn(controller.signal)) onItem(item);
      return;
    } catch (err) {
      const pe = toProviderError(err);
      if (!pe.retryable) throw pe;
      if (attempt < retryAttempts) {
        if (onRetry) onRetry();
        const backoff = pe.retryAfterMs ?? retryBackoffMs * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw pe;
    } finally {
      clearTimeout(timer);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function executeTurn(
  p: LLMProvider,
  userText: string,
): Promise<void> {
  if (useStore.getState().busy) return;
  useStore.setState({ busy: true });
  const store = useStore.getState();

  if (store.phase === "closed") {
    store.addSystemLine("Бар уже закрыт. Перезапусти, если хочешь зайти ещё раз.");
    useStore.setState({ busy: false });
    return;
  }

  const userTurns = store.lines.filter((l) => l.speaker === "user").length;
  if (userTurns >= config.loop.maxTurnsPerSession) {
    store.addBartenderLine("Смена кончилась, дружище. Пора мне закрываться. Удачи.");
    useStore.setState({ phase: "closed", busy: false });
    return;
  }

  store.addUserLine(userText);
  store.startStreaming();

  const messages = selectHistory(useStore.getState());
  const s = useStore.getState();
  const system = buildSystemPrompt({
    perceivedScore: s.perceivedScore,
    bacProxy: s.bacProxy,
    drunkenness: s.drunkenness,
    servedCount: s.served.length,
    phase: s.phase,
  });
  let toolInput: unknown = null;

  const generation: GenerationConfig = {
    temperature: config.generation.temperature,
    maxOutputTokens: config.generation.maxOutputTokens,
    ...(useAppStore.getState().prefs.thinking
      ? { reasoning: { budgetTokens: config.reasoning.budgetTokens } }
      : {}),
  };

  try {
    await withRetry(
      (signal) =>
        p.streamTurn({
          system,
          messages,
          tools: [BARTENDER_TOOL],
          generation,
          signal,
        }),
      (ev) => {
        if (ev.type === "text-delta") store.appendStreamingToken(ev.text);
        else if (ev.type === "reasoning-delta") store.appendReasoning(ev.text);
        else if (ev.type === "tool-call") toolInput = ev.args;
        else if (ev.type === "finish") store.recordUsage(ev.usage);
        else if (ev.type === "error") throw ev.error;
      },
      () => store.startStreaming(),
    );

    const action = parseBartenderAction(toolInput);
    if (action) store.applyBartenderAction(action);

    // Reasoning-модели отдают реплику через tool.reply, а не через content.
    // Если content пуст — раскрываем reply печатающейся машинкой.
    const streamedNow = useStore.getState().streamingText.trim().length > 0;
    if (!streamedNow && action?.reply) {
      const reply = action.reply;
      const step = Math.max(2, Math.round(reply.length / 60));
      for (let i = 0; i < reply.length; i += step) {
        useStore.setState({ streamingText: reply.slice(0, i + step) });
        await sleep(config.ui.typewriterDelayMs);
      }
      useStore.setState({ streamingText: reply });
      await sleep(80);
    }

    // Коммитим реплику ровно один раз: либо стрим/раскрытый reply, либо fallback.
    if (useStore.getState().streamingText.trim()) {
      store.finalizeStreaming();
    } else {
      store.addBartenderLine(
        FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)],
      );
    }

    if (action?.action === "call_taxi") {
      store.addSystemLine("Виктор вызывает тебе такси…");
    }
  } catch (err) {
    store.finalizeStreaming();
    const reply =
      FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
    store.addBartenderLine(reply);
    throw err;
  } finally {
    store.setBusy(false);
  }
}

export async function runTurn(userText: string): Promise<void> {
  return executeTurn(getProvider(), userText);
}

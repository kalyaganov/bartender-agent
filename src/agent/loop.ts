import { config } from "../config";
import {
  useStore,
  selectHistory,
  type ToolCallStatus,
  type TurnReplySource,
} from "../state/store";
import { useAppStore } from "../state/app";
import { buildSystemPrompt } from "./prompt";
import { createProvider, type LLMProvider } from "./providers";
import type { GenerationConfig, StreamPart } from "./providers/types";
import { ProviderError, toProviderError, type ProviderErrorKind } from "./providers/errors";
import { BARTENDER_TOOL, parseBartenderAction } from "./tools";
import type { BartenderAction } from "./schemas";
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
    extraHeaders: prefs.extraHeaders,
  });
}

let currentController: AbortController | null = null;

export function cancelCurrentTurn(): void {
  currentController?.abort();
}

const FALLBACK_REPLIES = [
  "Хм, отвлёкся на бокал. Повтори-ка, дружище?",
  "Заело меня на секунду. Что говорил?",
  "Шумно сегодня за стойкой. Не расслышал, приятель.",
];

type ToolCall = Extract<StreamPart, { type: "tool-call" }>;

interface ToolResolution {
  action: BartenderAction | null;
  toolCallStatus: ToolCallStatus;
  bartenderToolCalls: number;
  unexpectedToolCalls: number;
}

function abortError(): ProviderError {
  return new ProviderError("Прервано", "abort", false);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function withRetry<T>(
  fn: (signal: AbortSignal) => AsyncIterable<T>,
  onItem: (item: T) => void,
  signal: AbortSignal,
  onAttempt: (attempt: number) => void,
  onRetry: () => void,
): Promise<void> {
  const { retryAttempts, retryBackoffMs, providerTimeoutMs } = config.loop;
  for (let attempt = 0; attempt <= retryAttempts; attempt++) {
    throwIfAborted(signal);
    onAttempt(attempt + 1);
    const controller = new AbortController();
    const abortAttempt = () => controller.abort();
    signal.addEventListener("abort", abortAttempt, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, providerTimeoutMs);
    try {
      for await (const item of fn(controller.signal)) onItem(item);
      return;
    } catch (err) {
      if (signal.aborted) throw abortError();
      const classified = toProviderError(err);
      const providerError = timedOut && classified.kind === "abort"
        ? new ProviderError("Истекло время ожидания ответа провайдера", "network", true)
        : classified;
      if (!providerError.retryable || attempt === retryAttempts) throw providerError;
      onRetry();
      const backoff = providerError.retryAfterMs ?? retryBackoffMs * (attempt + 1);
      await sleep(backoff, signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abortAttempt);
    }
  }
}

function resolveToolCalls(toolCalls: ToolCall[]): ToolResolution {
  const bartenderCalls = toolCalls.filter((call) => call.toolName === BARTENDER_TOOL.name);
  const unexpectedToolCalls = toolCalls.length - bartenderCalls.length;
  if (bartenderCalls.length === 0) {
    return {
      action: null,
      toolCallStatus: "missing",
      bartenderToolCalls: 0,
      unexpectedToolCalls,
    };
  }
  if (bartenderCalls.length > 1) {
    return {
      action: null,
      toolCallStatus: "multiple",
      bartenderToolCalls: bartenderCalls.length,
      unexpectedToolCalls,
    };
  }
  const action = parseBartenderAction(bartenderCalls[0].args);
  return {
    action,
    toolCallStatus: action ? "valid" : "invalid",
    bartenderToolCalls: 1,
    unexpectedToolCalls,
  };
}

function fallbackReply(): string {
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];
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

  const turnController = new AbortController();
  currentController = turnController;
  let attempts = 0;
  let resolution: ToolResolution = {
    action: null,
    toolCallStatus: "missing",
    bartenderToolCalls: 0,
    unexpectedToolCalls: 0,
  };

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
  const generation: GenerationConfig = {
    temperature: config.generation.temperature,
    maxOutputTokens: config.generation.maxOutputTokens,
    ...(useAppStore.getState().prefs.thinking
      ? { reasoning: { budgetTokens: config.reasoning.budgetTokens } }
      : {}),
  };
  let toolCalls: ToolCall[] = [];

  try {
    await withRetry(
      (signal) => p.streamTurn({ system, messages, tools: [BARTENDER_TOOL], generation, signal }),
      (event) => {
        if (event.type === "text-delta") store.appendStreamingToken(event.text);
        else if (event.type === "reasoning-delta") store.appendReasoning(event.text);
        else if (event.type === "tool-call") toolCalls.push(event);
        else if (event.type === "finish") store.recordUsage(event.usage);
        else if (event.type === "error") throw event.error;
      },
      turnController.signal,
      (attempt) => {
        attempts = attempt;
      },
      () => {
        toolCalls = [];
        store.startStreaming();
      },
    );

    throwIfAborted(turnController.signal);
    resolution = resolveToolCalls(toolCalls);
    if (resolution.action) store.applyBartenderAction(resolution.action);

    const streamedText = useStore.getState().streamingText.trim();
    const contentConflict = Boolean(
      resolution.action && streamedText && streamedText !== resolution.action.reply,
    );
    let replySource: TurnReplySource;
    if (resolution.action) {
      replySource = "tool-reply";
      const reply = resolution.action.reply;
      if (streamedText) {
        store.replaceStreamingText(reply);
      } else {
        const step = Math.max(2, Math.round(reply.length / 60));
        for (let i = 0; i < reply.length; i += step) {
          throwIfAborted(turnController.signal);
          store.replaceStreamingText(reply.slice(0, i + step));
          await sleep(config.ui.typewriterDelayMs, turnController.signal);
        }
        store.replaceStreamingText(reply);
        await sleep(80, turnController.signal);
      }
    } else if (streamedText) {
      replySource = "content";
    } else {
      replySource = "fallback";
      store.addBartenderLine(fallbackReply());
    }

    if (replySource !== "fallback") store.finalizeStreaming();
    if (resolution.action?.action === "call_taxi") {
      store.addSystemLine("Виктор вызывает тебе такси…");
    }
    store.recordTurnStatus({
      attempts,
      toolCallStatus: resolution.toolCallStatus,
      bartenderToolCalls: resolution.bartenderToolCalls,
      unexpectedToolCalls: resolution.unexpectedToolCalls,
      contentConflict,
      replySource,
    });
  } catch (err) {
    const providerError = toProviderError(err);
    store.discardStreaming();
    if (providerError.kind !== "abort") store.addBartenderLine(fallbackReply());
    store.recordTurnStatus({
      attempts,
      toolCallStatus: resolution.toolCallStatus,
      bartenderToolCalls: resolution.bartenderToolCalls,
      unexpectedToolCalls: resolution.unexpectedToolCalls,
      contentConflict: false,
      replySource: providerError.kind === "abort" ? "none" : "fallback",
      errorKind: providerError.kind as ProviderErrorKind,
    });
    throw providerError;
  } finally {
    if (currentController === turnController) currentController = null;
    store.setBusy(false);
  }
}

export async function runTurn(userText: string): Promise<void> {
  return executeTurn(getProvider(), userText);
}

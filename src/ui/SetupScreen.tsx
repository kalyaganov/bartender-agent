import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppStore } from "../state/app";
import { isConfigured, type Preferences } from "../persistence";
import { checkConnection, type ConnectionCheckResult } from "../agent/connection";
import { toProviderError } from "../agent/providers/errors";

type Field = "endpoint" | "token" | "model" | "thinking" | "test" | "submit";
type CheckState = "idle" | "checking" | ConnectionCheckResult;

const FIELD_ORDER: Field[] = [
  "endpoint",
  "token",
  "model",
  "thinking",
  "test",
  "submit",
];

const FIELD_LABELS: Record<Field, string> = {
  endpoint: "Endpoint",
  token: "Token",
  model: "Модель",
  thinking: "Thinking",
  test: "Проверить",
  submit: "Сохранить",
};

function providerErrorMessage(error: unknown): string {
  switch (toProviderError(error).kind) {
    case "auth":
      return "Провайдер отклонил token. Проверь значение и повтори.";
    case "rateLimit":
      return "Провайдер ограничил частоту запросов. Попробуй позже.";
    case "badRequest":
      return "Провайдер отклонил запрос. Проверь endpoint, модель и Thinking.";
    case "network":
      return "Не удалось связаться с провайдером. Проверь endpoint и подключение.";
    case "abort":
      return "Проверка подключения отменена.";
    case "unknown":
      return "Провайдер вернул неизвестную ошибку. Проверь настройки.";
  }
}

export function SetupScreen() {
  const go = useAppStore((s) => s.go);
  const back = useAppStore((s) => s.back);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const initial = useAppStore((s) => s.prefs);

  const [endpoint, setEndpoint] = useState(initial.endpoint ?? "");
  const [token, setToken] = useState(initial.token ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [thinking, setThinking] = useState(initial.thinking ?? false);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>("idle");

  const active = FIELD_ORDER[idx];
  const blocked = saving || checkState === "checking";

  function nextPreferences(): Preferences | null {
    const trimmedEndpoint = endpoint.trim();
    const trimmedToken = token.trim();
    const trimmedModel = model.trim();
    if (!trimmedEndpoint || !trimmedToken || !trimmedModel) {
      setError("Заполни endpoint, token и модель.");
      return null;
    }
    return {
      ...initial,
      endpoint: trimmedEndpoint,
      token: trimmedToken,
      model: trimmedModel,
      thinking,
    };
  }

  async function submit() {
    if (blocked) return;
    const next = nextPreferences();
    if (!next) return;
    setError(null);
    setSaving(true);
    try {
      await setPrefs(next);
      go("bar");
    } catch {
      setError("Не удалось сохранить настройки. Проверь права на каталог и свободное место.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (blocked) return;
    const next = nextPreferences();
    if (!next) return;
    setError(null);
    setCheckState("checking");
    try {
      setCheckState(await checkConnection({
        endpoint: next.endpoint!,
        token: next.token!,
        model: next.model!,
        thinking: next.thinking ?? false,
        extraHeaders: next.extraHeaders,
      }));
    } catch (err) {
      setCheckState("idle");
      setError(providerErrorMessage(err));
    }
  }

  function clearCheckState(): void {
    if (checkState !== "checking") setCheckState("idle");
  }

  useInput((input, key) => {
    if (blocked) return;
    if (key.escape) {
      const { prefs } = useAppStore.getState();
      if (isConfigured(prefs)) {
        setError(null);
        back();
      } else {
        setError("Сначала заполни endpoint, token и модель.");
      }
      return;
    }
    if (active === "thinking") {
      if (key.return || input === " ") {
        setThinking((value) => !value);
        clearCheckState();
      } else if (key.upArrow) {
        setIdx((value) => (value - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
      } else if (key.downArrow || key.tab) {
        setIdx((value) => (value + 1) % FIELD_ORDER.length);
      }
      return;
    }
    if (active === "test" || active === "submit") {
      if (key.return || input === " ") {
        if (active === "test") void testConnection();
        else void submit();
      } else if (key.upArrow) {
        setIdx((value) => (value - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
      } else if (key.downArrow || key.tab) {
        setIdx((value) => (value + 1) % FIELD_ORDER.length);
      }
      return;
    }
    if (key.upArrow) {
      setIdx((value) => (value - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
    } else if (key.downArrow || key.tab || key.return) {
      setIdx((value) => (value + 1) % FIELD_ORDER.length);
    }
  });

  function renderRow(field: Field, value: string, isCurrent: boolean) {
    const isActive = active === field;
    const cursor = isActive ? "▸" : " ";
    const color = isActive ? "cyan" : "white";
    return (
      <Box key={field} gap={1}>
        <Text color={isCurrent ? "cyan" : "gray"}>{cursor}</Text>
        <Text color="green">{FIELD_LABELS[field].padEnd(10)}</Text>
        <Text color={color}>{value}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>
        Настройка бармена
      </Text>
      <Text color="gray" dimColor>
        Нужен OpenAI-compatible Chat Completions API.
      </Text>
      <Box marginTop={1} flexDirection="column">
        {active === "endpoint" ? (
          <Box gap={1}>
            <Text color="cyan">▸</Text>
            <Text color="green">{FIELD_LABELS.endpoint.padEnd(10)}</Text>
            <TextInput
              value={endpoint}
              onChange={(value) => {
                setEndpoint(value);
                clearCheckState();
              }}
              focus={!blocked}
              placeholder="https://api.provider.com/v1"
            />
          </Box>
        ) : (
          renderRow("endpoint", endpoint || "(пусто)", false)
        )}
        <Text color="gray" dimColor>
          Базовый URL, обычно с /v1. Не добавляй /chat/completions.
        </Text>

        {active === "token" ? (
          <Box gap={1}>
            <Text color="cyan">▸</Text>
            <Text color="green">{FIELD_LABELS.token.padEnd(10)}</Text>
            <TextInput
              value={token}
              onChange={(value) => {
                setToken(value);
                clearCheckState();
              }}
              focus={!blocked}
              mask="•"
              placeholder="sk-…"
            />
          </Box>
        ) : (
          renderRow("token", token ? "•".repeat(Math.min(token.length, 16)) : "(пусто)", false)
        )}

        {active === "model" ? (
          <Box gap={1}>
            <Text color="cyan">▸</Text>
            <Text color="green">{FIELD_LABELS.model.padEnd(10)}</Text>
            <TextInput
              value={model}
              onChange={(value) => {
                setModel(value);
                clearCheckState();
              }}
              focus={!blocked}
              placeholder="Точный ID модели от провайдера"
            />
          </Box>
        ) : (
          renderRow("model", model || "(пусто)", false)
        )}
        <Text color="gray" dimColor>
          Введи точный ID модели из кабинета или документации провайдера.
        </Text>

        <Box gap={1}>
          <Text color={active === "thinking" ? "cyan" : "gray"}>
            {active === "thinking" ? "▸" : " "}
          </Text>
          <Text color="green">{FIELD_LABELS.thinking.padEnd(10)}</Text>
          <Text color={active === "thinking" ? "cyan" : "white"}>
            [{thinking ? "✓" : " "}] {thinking ? "ON" : "OFF"}
          </Text>
        </Box>
        <Text color="gray" dimColor>
          Расширенная опция. Оставь OFF, если провайдер не документирует reasoning.
        </Text>

        <Box gap={1}>
          <Text color={active === "test" ? "cyan" : "gray"}>
            {active === "test" ? "▸" : " "}
          </Text>
          <Text color={active === "test" ? "cyan" : "white"} bold={active === "test"}>
            [{checkState === "checking" ? "Проверяю…" : FIELD_LABELS.test}]
          </Text>
        </Box>
        <Text color="gray" dimColor>
          Отправит короткий запрос, но не сохранит настройки.
        </Text>
        {checkState === "ready" ? (
          <Text color="green">Подключение работает: Chat Completions, streaming и инструменты доступны.</Text>
        ) : null}
        {checkState === "tools-unavailable" ? (
          <Text color="yellow">Chat Completions работает, но модель не вызвала инструмент. Для Виктора нужна модель с tool calling.</Text>
        ) : null}

        <Box gap={1}>
          <Text color={active === "submit" ? "cyan" : "gray"}>
            {active === "submit" ? "▸" : " "}
          </Text>
          <Text color={active === "submit" ? "cyan" : "white"} bold={active === "submit"}>
            [{saving ? "Сохранение…" : FIELD_LABELS.submit}]
          </Text>
        </Box>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <Text color="gray" dimColor>
        ↑/↓ или Tab — поле · Enter — далее/запустить · ESC — отмена
      </Text>
    </Box>
  );
}

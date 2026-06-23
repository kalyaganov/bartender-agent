import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useAppStore } from "../state/app";
import type { Preferences } from "../persistence";

type Field = "endpoint" | "token" | "model" | "thinking" | "submit";

const FIELD_ORDER: Field[] = [
  "endpoint",
  "token",
  "model",
  "thinking",
  "submit",
];

const FIELD_LABELS: Record<Field, string> = {
  endpoint: "Endpoint",
  token: "Token",
  model: "Модель",
  thinking: "Thinking",
  submit: "Сохранить",
};

export function SetupScreen() {
  const go = useAppStore((s) => s.go);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const initial = useAppStore((s) => s.prefs);

  const [endpoint, setEndpoint] = useState(initial.endpoint ?? "");
  const [token, setToken] = useState(initial.token ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [thinking, setThinking] = useState(initial.thinking ?? false);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const active = FIELD_ORDER[idx];

  function submit() {
    const trimmedEndpoint = endpoint.trim();
    const trimmedToken = token.trim();
    const trimmedModel = model.trim();
    if (!trimmedEndpoint || !trimmedToken || !trimmedModel) {
      setError("Заполни endpoint, token и модель.");
      return;
    }
    const next: Preferences = {
      endpoint: trimmedEndpoint,
      token: trimmedToken,
      model: trimmedModel,
      thinking,
    };
    setPrefs(next);
    setError(null);
    go("bar");
  }

  useInput((input, key) => {
    if (key.escape) {
      const { prefs } = useAppStore.getState();
      if (prefs.endpoint && prefs.token && prefs.model) {
        setError(null);
        go("bar");
      } else {
        setError("Сначала заполни endpoint, token и модель.");
      }
      return;
    }
    if (active === "thinking") {
      if (key.return || input === " ") {
        setThinking((t) => !t);
      } else if (key.upArrow) {
        setIdx((i) => (i - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
      } else if (key.downArrow || key.tab) {
        setIdx((i) => (i + 1) % FIELD_ORDER.length);
      }
      return;
    }
    if (active === "submit") {
      if (key.return || input === " ") {
        submit();
      } else if (key.upArrow) {
        setIdx((i) => (i - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
      } else if (key.downArrow || key.tab) {
        setIdx((i) => (i + 1) % FIELD_ORDER.length);
      }
      return;
    }
    if (key.upArrow) {
      setIdx((i) => (i - 1 + FIELD_ORDER.length) % FIELD_ORDER.length);
    } else if (key.downArrow || key.tab) {
      setIdx((i) => (i + 1) % FIELD_ORDER.length);
    } else if (key.return) {
      setIdx((i) => (i + 1) % FIELD_ORDER.length);
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
        OpenAI-compat endpoint. Пример: https://opencode.ai/zen/go/v1
      </Text>
      <Box marginTop={1} flexDirection="column">
        {active === "endpoint" ? (
          <Box gap={1}>
            <Text color="cyan">▸</Text>
            <Text color="green">{FIELD_LABELS.endpoint.padEnd(10)}</Text>
            <TextInput
              value={endpoint}
              onChange={setEndpoint}
              placeholder="https://opencode.ai/zen/go/v1"
            />
          </Box>
        ) : (
          renderRow("endpoint", endpoint || "(пусто)", false)
        )}

        {active === "token" ? (
          <Box gap={1}>
            <Text color="cyan">▸</Text>
            <Text color="green">{FIELD_LABELS.token.padEnd(10)}</Text>
            <TextInput
              value={token}
              onChange={setToken}
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
              onChange={setModel}
              placeholder="deepseek-v4-pro"
            />
          </Box>
        ) : (
          renderRow("model", model || "(пусто)", false)
        )}

        <Box gap={1}>
          <Text color={active === "thinking" ? "cyan" : "gray"}>
            {active === "thinking" ? "▸" : " "}
          </Text>
          <Text color="green">{FIELD_LABELS.thinking.padEnd(10)}</Text>
          <Text color={active === "thinking" ? "cyan" : "white"}>
            [{thinking ? "✓" : " "}] {thinking ? "ON" : "OFF"}
          </Text>
        </Box>

        <Box gap={1}>
          <Text color={active === "submit" ? "cyan" : "gray"}>
            {active === "submit" ? "▸" : " "}
          </Text>
          <Text color={active === "submit" ? "cyan" : "white"} bold={active === "submit"}>
            [{FIELD_LABELS.submit}]
          </Text>
        </Box>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}
      <Text color="gray" dimColor>
        ↑/↓ или Tab — поле · Enter — далее/переключить · ESC — отмена
      </Text>
    </Box>
  );
}

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useAppStore } from "../state/app";
import { hasProviderConnection, isConfigured } from "../persistence";

type SetupItem = "connection" | "model";

const ITEMS: SetupItem[] = ["connection", "model"];

export function SetupScreen() {
  const go = useAppStore((s) => s.go);
  const back = useAppStore((s) => s.back);
  const prefs = useAppStore((s) => s.prefs);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const connected = hasProviderConnection(prefs);

  function select(item: SetupItem): void {
    if (item === "connection") {
      setError(null);
      go("provider-connection");
      return;
    }
    if (!connected) {
      setError("Сначала сохрани endpoint и token провайдера.");
      return;
    }
    setError(null);
    go("model-selection");
  }

  useInput((_input, key) => {
    if (key.escape) {
      if (isConfigured(prefs)) {
        setError(null);
        back();
      } else {
        setError("Сначала настрой подключение и выбери модель.");
      }
    } else if (key.upArrow) {
      setIdx((value) => (value - 1 + ITEMS.length) % ITEMS.length);
    } else if (key.downArrow || key.tab) {
      setIdx((value) => (value + 1) % ITEMS.length);
    } else if (key.return) {
      select(ITEMS[idx]);
    }
  });

  const connectionHint = connected ? "настроено" : "не настроено";
  const modelHint = prefs.model ?? "не выбрана";

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>
        Настройки LLM
      </Text>
      <Text color="gray" dimColor>
        Сначала подключи провайдера, затем выбери модель.
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text color={idx === 0 ? "cyan" : "gray"}>{idx === 0 ? "▸" : " "}</Text>
          <Text color={idx === 0 ? "cyan" : "white"} bold={idx === 0}>Подключение к провайдеру</Text>
          <Text color="gray">{connectionHint}</Text>
        </Box>
        <Box gap={1}>
          <Text color={idx === 1 ? "cyan" : "gray"}>{idx === 1 ? "▸" : " "}</Text>
          <Text color={connected ? (idx === 1 ? "cyan" : "white") : "gray"} bold={idx === 1 && connected}>
            Выбор модели
          </Text>
          <Text color="gray">{modelHint}</Text>
        </Box>
      </Box>
      {error ? <Text color="red">{error}</Text> : null}
      <Text color="gray" dimColor>
        ↑/↓ или Tab — блок · Enter — открыть · ESC — назад
      </Text>
    </Box>
  );
}

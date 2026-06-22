import { Box, Text, useInput } from "ink";
import { SelectList } from "./SelectList";
import { PROVIDERS } from "../agent/providers/registry";
import { useAppStore } from "../state/app";
import type { ProviderId } from "../agent/providers/types";

export function ProviderPicker() {
  const go = useAppStore((s) => s.go);
  const back = useAppStore((s) => s.back);
  const prevScreen = useAppStore((s) => s.prevScreen);
  const setProvider = useAppStore((s) => s.setProvider);

  const mode: "startup" | "switch" =
    prevScreen === "menu" ? "switch" : "startup";

  useInput((_input, key) => {
    if (mode === "switch" && key.escape) back();
  });

  if (PROVIDERS.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="red" bold>
          Нет настроенных провайдеров LLM.
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            Добавь API-ключ в .env и перезапусти приложение:
          </Text>
          <Text color="gray">  OPENCODE_GO_API_KEY=…</Text>
          <Text color="gray">  ANTHROPIC_API_KEY=…</Text>
          <Text color="gray">  OPENAI_API_KEY=…</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            (Ctrl+C — выход)
          </Text>
        </Box>
      </Box>
    );
  }

  const items = PROVIDERS.map((p) => ({ key: p.id, label: p.label }));

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>
        {mode === "startup"
          ? "Выбери провайдера LLM"
          : "Сменить провайдера LLM"}
      </Text>
      <Text color="gray">
        ↑/↓ + Enter{mode === "switch" ? " · ESC — назад" : ""}
      </Text>
      <Box marginTop={1}>
        <SelectList
          items={items}
          onSelect={(key) => {
            setProvider(key as ProviderId);
            if (mode === "startup") go("bar");
            else back();
          }}
        />
      </Box>
    </Box>
  );
}

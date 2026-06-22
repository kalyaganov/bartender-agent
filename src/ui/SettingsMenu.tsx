import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList, type SelectItem } from "./SelectList";
import { useAppStore } from "../state/app";
import { useStore } from "../state/store";
import { getProviderDef } from "../agent/providers/registry";
import { HELP } from "../agent/commands";

export function SettingsMenu() {
  const go = useAppStore((s) => s.go);
  const back = useAppStore((s) => s.back);
  const providerId = useAppStore((s) => s.providerId);
  const [notice, setNotice] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      setNotice(null);
      back();
    }
  });

  const def = providerId ? getProviderDef(providerId) : undefined;
  const items: SelectItem[] = [
    { key: "provider", label: "Провайдер LLM", hint: def?.label ?? "—" },
    { key: "restart", label: "Перезапустить вечер" },
    { key: "help", label: "Помощь" },
    { key: "exit", label: "Выйти" },
  ];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="yellow" bold>
        — Меню —
      </Text>
      <Text color="gray">↑/↓ + Enter · ESC — назад</Text>
      <Box marginTop={1}>
        <SelectList
          items={items}
          onSelect={(key) => {
            switch (key) {
              case "provider":
                setNotice(null);
                go("selecting-provider");
                break;
              case "restart":
                useStore.getState().reset();
                useStore.getState().addSystemLine("Новый вечер, чистая стойка.");
                back();
                break;
              case "help":
                setNotice(HELP);
                break;
              case "exit":
                setNotice(null);
                go("exit-confirm");
                break;
            }
          }}
        />
      </Box>
      {notice ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">{notice}</Text>
          <Text color="gray" dimColor>
            (ESC — назад)
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}


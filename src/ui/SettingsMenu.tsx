import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { SelectList, type SelectItem } from "./SelectList";
import { useAppStore } from "../state/app";
import { useStore } from "../state/store";
import { HELP } from "../agent/commands";

export function SettingsMenu() {
  const go = useAppStore((s) => s.go);
  const back = useAppStore((s) => s.back);
  const prefs = useAppStore((s) => s.prefs);
  const [notice, setNotice] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      setNotice(null);
      back();
    }
  });

  const setupHint = prefs.model
    ? `${prefs.endpoint ?? "?"} · ${prefs.model}${prefs.thinking ? " · thinking" : ""}`
    : "не настроен";

  const items: SelectItem[] = [
    { key: "setup", label: "Настроить провайдера", hint: setupHint },
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
              case "setup":
                setNotice(null);
                go("setup");
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

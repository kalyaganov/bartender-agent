import { useEffect } from "react";
import { Box, useInput } from "ink";
import { Face } from "./Face";
import { DialoguePanel } from "./DialoguePanel";
import { InputBox } from "./InputBox";
import { StatusBar } from "./StatusBar";
import { Meter } from "./Meter";
import { Tab } from "./Tab";
import { CocktailAnimation } from "./CocktailAnimation";
import { useStore } from "../state/store";
import { useAppStore } from "../state/app";
import { runTurn } from "../agent/loop";
import { handleCommand } from "../agent/commands";
import { config } from "../config";

export function BarScreen() {
  const mood = useStore((s) => s.mood);
  const lines = useStore((s) => s.lines);
  const streaming = useStore((s) => s.streamingText);
  const busy = useStore((s) => s.busy);
  const drunkenness = useStore((s) => s.drunkenness);
  const tab = useStore((s) => s.tab);
  const phase = useStore((s) => s.phase);
  const barTimeMin = useStore((s) => s.barTimeMin);
  const tickMetabolism = useStore((s) => s.tickMetabolism);

  useEffect(() => {
    const id = setInterval(tickMetabolism, config.ui.metabolismTickMs);
    return () => clearInterval(id);
  }, [tickMetabolism]);

  useInput((_input, key) => {
    if (key.escape) {
      useAppStore.getState().go("exit-confirm");
    }
  });

  const handleSubmit = (text: string) => {
    // Команды решают сами (например /exit работает даже во время стрима).
    if (handleCommand(text)) return;
    if (busy) return;
    void runTurn(text).catch(() => {});
  };

  const phaseLabel =
    phase === "open"
      ? "открыто"
      : phase === "cutOff"
        ? "отрезал"
        : phase === "leaving"
          ? "такси"
          : phase === "closed"
            ? "закрыто"
            : phase;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <StatusBar barTimeMin={barTimeMin} phase={phaseLabel} />

      <Box flexDirection="column" alignItems="center" marginY={1}>
        <Face mood={mood} />
      </Box>

      <DialoguePanel lines={lines} streaming={streaming} busy={busy} />

      <CocktailAnimation />

      <Box marginTop={1} gap={4}>
        <Meter value={drunkenness} />
        <Tab total={tab} />
      </Box>

      <Box marginTop={1} borderTop borderStyle="single" />
      <InputBox onSubmit={handleSubmit} disabled={busy} />
    </Box>
  );
}

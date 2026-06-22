import { useEffect, useState } from "react";
import { Box, useInput } from "ink";
import { Face } from "./Face";
import { DialoguePanel } from "./DialoguePanel";
import { InputBox } from "./InputBox";
import { CommandPopup } from "./CommandPopup";
import { StatusBar } from "./StatusBar";
import { Meter } from "./Meter";
import { Tab } from "./Tab";
import { CocktailAnimation } from "./CocktailAnimation";
import { useViewport } from "./useViewport";
import { useStore } from "../state/store";
import { useAppStore } from "../state/app";
import { runTurn } from "../agent/loop";
import { handleCommand, matchCommands } from "../agent/commands";
import { config } from "../config";

const FIXED_OVERHEAD = config.ui.fixedOverhead;

export function BarScreen() {
  const vp = useViewport();
  const mood = useStore((s) => s.mood);
  const lines = useStore((s) => s.lines);
  const streaming = useStore((s) => s.streamingText);
  const busy = useStore((s) => s.busy);
  const drunkenness = useStore((s) => s.drunkenness);
  const tab = useStore((s) => s.tab);
  const phase = useStore((s) => s.phase);
  const barTimeMin = useStore((s) => s.barTimeMin);
  const pouring = useStore((s) => s.pouring);
  const tickMetabolism = useStore((s) => s.tickMetabolism);

  const [inputValue, setInputValue] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(tickMetabolism, config.ui.metabolismTickMs);
    return () => clearInterval(id);
  }, [tickMetabolism]);

  const popupItems = inputValue.startsWith("/")
    ? matchCommands(inputValue)
    : [];

  useEffect(() => {
    setCmdIndex(0);
  }, [inputValue]);

  useEffect(() => {
    if (cmdIndex > popupItems.length - 1) setCmdIndex(0);
  }, [popupItems.length, cmdIndex]);

  const overhead = FIXED_OVERHEAD + (pouring ? 1 : 0);
  const dialogueMaxLines = Math.max(
    2,
    vp.rows - overhead - popupItems.length,
  );

  useInput((_input, key) => {
    if (key.escape) {
      if (inputValue) {
        setInputValue("");
      } else {
        useAppStore.getState().go("exit-confirm");
      }
    }
  });

  const handleCommandNav = (key: "up" | "down" | "tab") => {
    if (popupItems.length === 0) return;
    if (key === "up") {
      setCmdIndex((i) => (i - 1 + popupItems.length) % popupItems.length);
    } else if (key === "down") {
      setCmdIndex((i) => (i + 1) % popupItems.length);
    } else if (key === "tab") {
      setInputValue(popupItems[cmdIndex].name);
    }
  };

  const handleSubmit = (text: string) => {
    setInputValue("");
    const resolved = popupItems.length > 0 ? popupItems[cmdIndex].name : text;
    if (handleCommand(resolved)) return;
    if (busy) return;
    void runTurn(resolved).catch(() => {});
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

      <DialoguePanel
        lines={lines}
        streaming={streaming}
        busy={busy}
        maxLines={dialogueMaxLines}
      />

      <CocktailAnimation />

      <Box marginTop={1} gap={4}>
        <Meter value={drunkenness} />
        <Tab total={tab} />
      </Box>

      <Box marginTop={1} borderTop borderStyle="single" />

      <CommandPopup items={popupItems} selected={cmdIndex} />

      <InputBox
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onCommandNav={handleCommandNav}
        disabled={busy}
      />
    </Box>
  );
}

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
import { toProviderError } from "../agent/providers/errors";
import { config } from "../config";
import { FACE_IMAGE_ROWS, getTerminalImageProtocol } from "./terminalImage";

const FIXED_OVERHEAD = config.ui.fixedOverhead;
const ASCII_FACE_ROWS = 9;

function providerErrorMessage(error: unknown): string | null {
  const providerError = toProviderError(error);
  switch (providerError.kind) {
    case "abort":
      return null;
    case "auth":
      return "Провайдер отклонил token. Проверь настройки через /setup.";
    case "rateLimit":
      return "Провайдер ограничил частоту запросов. Попробуй ещё раз позже.";
    case "badRequest":
      return "Провайдер отклонил запрос. Проверь endpoint, модель и Thinking через /setup.";
    case "network":
      return "Не удалось связаться с провайдером. Проверь endpoint и подключение.";
    case "unknown":
      return "Провайдер вернул неизвестную ошибку. Проверь настройки через /setup.";
  }
}

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

  const faceRows = getTerminalImageProtocol() ? FACE_IMAGE_ROWS : ASCII_FACE_ROWS;
  const thinking = busy && !streaming;
  const popupRows = popupItems.length ? popupItems.length + 1 : 0;
  const overhead = FIXED_OVERHEAD + faceRows - ASCII_FACE_ROWS + (pouring ? 1 : 0);
  const dialogueMaxLines = Math.max(0, vp.rows - overhead - popupRows);

  useInput((_input, key) => {
    if (key.escape && !inputValue) {
      useAppStore.getState().go("exit-confirm");
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
    const exactCommand = popupItems.find((item) => item.name === text.toLowerCase());
    const resolved = exactCommand?.name ?? popupItems[cmdIndex]?.name ?? text;
    if (handleCommand(resolved)) return;
    if (busy) return;
    void runTurn(resolved).catch((error: unknown) => {
      const message = providerErrorMessage(error);
      if (message) useStore.getState().addSystemLine(message);
    });
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
        <Face mood={mood} thinking={thinking} />
      </Box>

      <DialoguePanel
        lines={lines}
        streaming={streaming}
        busy={busy}
        maxLines={dialogueMaxLines}
        columns={vp.columns}
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

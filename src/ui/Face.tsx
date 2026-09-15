import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { getFace } from "./faces";
import {
  clearTerminalImages,
  FACE_IMAGE_COLUMNS,
  FACE_IMAGE_ROWS,
  getFaceImageSequence,
  getTerminalImageProtocol,
  placeTerminalImage,
} from "./terminalImage";
import type { Mood } from "../agent/schemas";
import { config } from "../config";

const TWITCH_TICK_MS = 70;
const TWITCH_TICKS = 4;

function AsciiFace({ mood }: { mood: Mood }) {
  const art = getFace(mood);
  const [blinking, setBlinking] = useState(false);
  const [twitch, setTwitch] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), config.ui.blinkDurationMs);
    }, config.ui.blinkIntervalMs);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      ticks++;
      setTwitch(ticks % 2 === 1);
      if (ticks >= TWITCH_TICKS) clearInterval(id);
    }, TWITCH_TICK_MS);
    return () => clearInterval(id);
  }, [mood]);

  const browRow = art.eyesRow - 1;
  const lines = art.lines.map((line, i) => {
    if (i === art.eyesRow && blinking) return art.closedEyes;
    if (i === browRow && twitch) return " " + line.slice(0, -1);
    return line;
  });

  return (
    <Box flexDirection="column" alignItems="center">
      {lines.map((line, i) => (
        <Text key={i} color={art.accent}>
          {line}
        </Text>
      ))}
    </Box>
  );
}

function ImageFace({ mood, thinking }: { mood: Mood; thinking: boolean }) {
  const displayMood = thinking ? "thoughtful" : mood;
  const protocol = getTerminalImageProtocol();
  const sequence = protocol ? getFaceImageSequence(displayMood, protocol) : null;

  useEffect(() => {
    if (!protocol || !sequence) return;
    process.stdout.write(
      clearTerminalImages(protocol) + placeTerminalImage(sequence),
    );
    return () => {
      process.stdout.write(clearTerminalImages(protocol));
    };
  }, [protocol, sequence]);

  if (!sequence) return <AsciiFace mood={displayMood} />;

  return <Box width={FACE_IMAGE_COLUMNS} height={FACE_IMAGE_ROWS} />;
}

export function Face({ mood, thinking = false }: { mood: Mood; thinking?: boolean }) {
  return <ImageFace mood={mood} thinking={thinking} />;
}

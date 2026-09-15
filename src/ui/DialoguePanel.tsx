import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import type { Line } from "../state/store";

const THINKING_FRAMES = ["", ".", "..", "..."];
const THINKING_TICK_MS = 350;

function ThinkingIndicator() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((current) => (current + 1) % THINKING_FRAMES.length);
    }, THINKING_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <Text color="gray" dimColor>
      {"  "}Виктор задумался{THINKING_FRAMES[frame]}
    </Text>
  );
}

export function DialoguePanel({
  lines,
  streaming,
  busy,
  maxLines,
}: {
  lines: Line[];
  streaming: string;
  busy: boolean;
  maxLines: number;
}) {
  const hasIndicator = Boolean(streaming || busy);
  const historyMax = Math.max(0, maxLines - (hasIndicator ? 1 : 0));
  const visible = lines.slice(-historyMax);

  return (
    <Box flexDirection="column" marginTop={1}>
      {visible.map((line, i) => {
        switch (line.speaker) {
          case "user":
            return (
              <Text key={i} color="green">
                {"  "}Вы: {line.text}
              </Text>
            );
          case "bartender":
            return (
              <Text key={i} color="cyan">
                {"  "}Виктор: {line.text}
              </Text>
            );
          case "system":
            return (
              <Text key={i} color="gray" dimColor>
                {"  "}— {line.text} —
              </Text>
            );
        }
      })}
      {streaming ? (
        <Text color="cyan">
          {"  "}Виктор: {streaming}
          <Text color="gray">▋</Text>
        </Text>
      ) : busy ? <ThinkingIndicator /> : null}
    </Box>
  );
}

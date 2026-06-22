import { Box, Text } from "ink";
import type { Line } from "../state/store";

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
      ) : busy ? (
        <Text color="gray" dimColor>
          {"  "}Виктор протирает бокал…
        </Text>
      ) : null}
    </Box>
  );
}

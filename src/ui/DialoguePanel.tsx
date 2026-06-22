import { Box, Text } from "ink";
import type { Line } from "../state/store";

export function DialoguePanel({
  lines,
  streaming,
  busy,
}: {
  lines: Line[];
  streaming: string;
  busy: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={1} minHeight={6}>
      {lines.map((line, i) => {
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

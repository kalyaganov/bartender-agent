import { Box, Text } from "ink";

export function StatusBar({
  barTimeMin,
  phase,
}: {
  barTimeMin: number;
  phase: string;
}) {
  const h = Math.floor(barTimeMin / 60);
  const m = barTimeMin % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return (
    <Box justifyContent="space-between">
      <Text color="yellow" bold>
        BAR
      </Text>
      <Text color="gray">[esc] выход из бара</Text>
      <Text color="gray">
        {time} · {phase}
      </Text>
    </Box>
  );
}

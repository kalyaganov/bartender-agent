import { Box, Text } from "ink";
import type { CommandDef } from "../agent/commands";

export function CommandPopup({
  items,
  selected,
}: {
  items: CommandDef[];
  selected: number;
}) {
  if (items.length === 0) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {items.map((cmd, i) => (
        <Box key={cmd.name} gap={1}>
          <Text color={i === selected ? "cyan" : "gray"}>
            {i === selected ? "▸" : " "}
          </Text>
          <Text color={i === selected ? "cyan" : "white"} bold={i === selected}>
            {cmd.name.padEnd(12)}
          </Text>
          <Text color="gray">{cmd.label}</Text>
        </Box>
      ))}
    </Box>
  );
}

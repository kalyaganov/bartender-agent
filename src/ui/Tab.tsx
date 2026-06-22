import { Box, Text } from "ink";

export function Tab({ total }: { total: number }) {
  return (
    <Box gap={1}>
      <Text color="gray">Счёт:</Text>
      <Text color="magenta">{total}₽</Text>
    </Box>
  );
}

import { Box, Text } from "ink";

const FILLED = "▰";
const EMPTY = "▱";
const TOTAL = 10;

const ZONES: { max: number; label: string; color: string }[] = [
  { max: 2, label: "трезв", color: "green" },
  { max: 4, label: "навеселе", color: "green" },
  { max: 6, label: "пьян", color: "yellow" },
  { max: 8, label: "сильно пьян", color: "yellow" },
  { max: 10, label: "срез", color: "red" },
];

export function Meter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(TOTAL, Math.round(value)));
  const bar = FILLED.repeat(v) + EMPTY.repeat(TOTAL - v);
  const zone = ZONES.find((z) => v <= z.max) ?? ZONES[ZONES.length - 1];
  return (
    <Box gap={1}>
      <Text color="gray">Опьянение:</Text>
      <Text color={zone.color}>
        {bar} {zone.label}
      </Text>
    </Box>
  );
}

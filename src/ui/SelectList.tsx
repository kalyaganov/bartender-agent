import { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface SelectItem {
  key: string;
  label: string;
  hint?: string;
}

export function SelectList({
  items,
  onSelect,
}: {
  items: SelectItem[];
  onSelect: (key: string) => void;
}) {
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setIdx((i) => (i - 1 + items.length) % items.length);
    } else if (key.downArrow) {
      setIdx((i) => (i + 1) % items.length);
    } else if (key.return) {
      onSelect(items[idx].key);
    } else if (input >= "1" && input <= "9") {
      const n = Number(input) - 1;
      if (n < items.length) onSelect(items[n].key);
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Box key={it.key} gap={1}>
          <Text color={i === idx ? "cyan" : "gray"}>
            {i === idx ? "▸" : " "}
          </Text>
          <Text color={i === idx ? "cyan" : "white"} bold={i === idx}>
            {it.label}
          </Text>
          {it.hint ? <Text color="gray"> {it.hint}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}

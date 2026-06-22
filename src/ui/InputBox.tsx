import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export function InputBox({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = (v: string) => {
    const trimmed = v.trim();
    if (trimmed) onSubmit(trimmed);
    setValue("");
  };

  return (
    <Box>
      <Text color="green">Вы:&nbsp;</Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder={disabled ? "…" : "сказать бармену"}
      />
    </Box>
  );
}

import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export function InputBox({
  value,
  onChange,
  onSubmit,
  onCommandNav,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  onCommandNav?: (key: "up" | "down" | "tab") => void;
  disabled?: boolean;
}) {
  useInput((_input, key) => {
    if (!value.startsWith("/")) return;
    if (key.upArrow) onCommandNav?.("up");
    else if (key.downArrow) onCommandNav?.("down");
    else if (key.tab) onCommandNav?.("tab");
  });

  const handleSubmit = (v: string) => {
    const trimmed = v.trim();
    if (trimmed) onSubmit(trimmed);
    onChange("");
  };

  return (
    <Box>
      <Text color="green">Вы:&nbsp;</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={handleSubmit}
        placeholder={disabled ? "…" : "сказать бармену"}
      />
    </Box>
  );
}

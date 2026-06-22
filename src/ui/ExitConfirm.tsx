import { Box, Text, useInput } from "ink";
import { useAppStore } from "../state/app";
import { exitApp } from "../shutdown";

export function ExitConfirm() {
  const back = useAppStore((s) => s.back);

  useInput((input, key) => {
    const confirm =
      key.escape ||
      key.return ||
      input.toLowerCase() === "y" ||
      (key.ctrl && input === "c");
    if (confirm) {
      exitApp();
    } else {
      back();
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
      <Text color="yellow" bold>
        Уже уходишь?
      </Text>
      <Text color="gray">
        ESC / Y / Enter — подтвердить · любая клавиша — остаться
      </Text>
    </Box>
  );
}

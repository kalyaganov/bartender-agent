import { spawnSync } from "node:child_process";
import { Box, Text, useInput } from "ink";
import { useAppStore } from "../state/app";
import { useStore } from "../state/store";
import { cancelCurrentTurn } from "../agent/loop";

// В режиме `tsx watch` (npm run dev) родительский процесс держит слушатель
// на stdin и при любом нажатии клавиши перезапускает ребёнка с логом
// «Return key Restarting…» (см. tsx issue #215 — флага отключения нет).
// Подтверждающее нажатие (Enter/Y/ESC) долетает и в родителя, поэтому агент
// перерождается вместо выхода. Чтобы этого избежать, шлём родителю SIGTERM:
// его обработчик выставляет флаг запрета спавна и завершает нас сам.
function shutdownTsxWatchParent(): void {
  if (!process.ppid) return;
  try {
    const r = spawnSync("ps", ["-p", String(process.ppid), "-o", "command="], {
      encoding: "utf-8",
    });
    // Срабатываем только на `tsx watch` (не на `node --import tsx --watch`,
    // у того нет слушателя stdin и бага нет).
    const cmd = r.stdout || "";
    const isTsxWatch = /\btsx\b/.test(cmd) && /\bwatch\b/.test(cmd) && !/--import\b/.test(cmd);
    if (isTsxWatch) process.kill(process.ppid, "SIGTERM");
  } catch {
    /* noop */
  }
}

export function ExitConfirm() {
  const back = useAppStore((s) => s.back);

  useInput((input, key) => {
    const confirm =
      key.escape ||
      key.return ||
      input.toLowerCase() === "y" ||
      (key.ctrl && input === "c");
    if (confirm) {
      // SPEC §2.3: сначала прерываем текущий ход (если идёт стрим), затем выходим.
      cancelCurrentTurn();
      useStore.getState().addBartenderLine(
        "Удачи, дружище. И помни — домой всегда лучше на такси.",
      );
      // Сначала глушим tsx watch-родителя — иначе он переродит агента
      // на этом самом нажатии (см. комментарий у shutdownTsxWatchParent).
      shutdownTsxWatchParent();
      setTimeout(() => process.exit(0), 100);
    } else {
      // любая иная клавиша — остаться
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

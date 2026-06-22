import { spawnSync } from "node:child_process";
import { useStore } from "./state/store";
import { cancelCurrentTurn } from "./agent/loop";

function shutdownTsxWatchParent(): void {
  if (!process.ppid) return;
  try {
    const r = spawnSync("ps", ["-p", String(process.ppid), "-o", "command="], {
      encoding: "utf-8",
    });
    const cmd = r.stdout || "";
    const isTsxWatch = /\btsx\b/.test(cmd) && /\bwatch\b/.test(cmd) && !/--import\b/.test(cmd);
    if (isTsxWatch) process.kill(process.ppid, "SIGTERM");
  } catch {
    /* noop */
  }
}

export function exitApp(): void {
  cancelCurrentTurn();
  useStore.getState().addBartenderLine(
    "Удачи, дружище. И помни — домой всегда лучше на такси.",
  );
  shutdownTsxWatchParent();
  setTimeout(() => process.exit(0), 100);
}

import { useStore } from "../state/store";
import { useAppStore } from "../state/app";
import { formatMenu } from "../data/cocktails";
import { exitApp } from "../shutdown";
import { cancelCurrentTurn } from "./loop";

export const HELP =
  "/menu — меню · /setup — настроить подключение и модель · /settings — настройки · " +
  "/help — подсказка · /exit — выход · /state — состояние (debug). " +
  "ESC или Ctrl+C — подтверждение выхода. Это игра-симуляция, бармен вымышлен.";

export interface CommandDef {
  name: string;
  label: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "/menu", label: "меню коктейлей" },
  { name: "/setup", label: "настроить подключение и модель" },
  { name: "/settings", label: "настройки" },
  { name: "/help", label: "подсказка по командам" },
  { name: "/exit", label: "выход" },
  { name: "/state", label: "состояние (debug)" },
];

export function matchCommands(query: string): CommandDef[] {
  return COMMANDS.filter((c) => c.name.startsWith(query));
}

export function handleCommand(text: string): boolean {
  if (!text.startsWith("/")) return false;
  const store = useStore.getState();
  const cmd = text.split(/\s+/)[0]?.toLowerCase();

  switch (cmd) {
    case "/menu":
      store.addSystemLine(formatMenu());
      return true;
    case "/help":
      store.addSystemLine(HELP);
      return true;
    case "/settings":
      if (store.busy) cancelCurrentTurn();
      useAppStore.getState().go("menu");
      return true;
    case "/setup":
    case "/provider":
      if (store.busy) cancelCurrentTurn();
      useAppStore.getState().go("setup");
      return true;
    case "/exit":
      exitApp();
      return true;
    case "/state": {
      const r = store.lastReasoning;
      const rSummary = r
        ? `${r.slice(0, 200)}${r.length > 200 ? "…" : ""}`
        : "(нет)";
      const u = store.lastUsage;
      const uSummary = u
        ? ` · tokens: ${u.inputTokens ?? "?"}/${u.outputTokens ?? "?"}`
        : "";
      const t = store.lastTurnStatus;
      const errorSummary = t.errorKind ? ` · ошибка=${t.errorKind}` : "";
      const conflictSummary = t.contentConflict ? " · content≠tool.reply" : "";
      store.addSystemLine(
        `mood=${store.mood} · опьянение=${store.drunkenness.toFixed(1)} ` +
          `· выпито=${store.bacProxy.toFixed(1)} · подач=${store.served.length} ` +
          `· счёт=${store.tab}₽ · фаза=${store.phase}${uSummary}\n` +
          `ход: попыток=${t.attempts} · tool=${t.toolCallStatus} ` +
          `(${t.bartenderToolCalls}/${t.unexpectedToolCalls}) · reply=${t.replySource}` +
          `${conflictSummary}${errorSummary}\n` +
          `reasoning: ${rSummary}`,
      );
      return true;
    }
    default:
      store.addSystemLine(`Не знаю команду «${cmd}». Набери /help.`);
      return true;
  }
}

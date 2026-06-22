import { useStore } from "../state/store";
import { useAppStore } from "../state/app";
import { formatMenu } from "../data/cocktails";
import { exitApp } from "../shutdown";

export const HELP =
  "/menu — меню · /settings — настройки и провайдер · /help — подсказка · " +
  "/exit — выход · /state — состояние (debug). " +
  "ESC или Ctrl+C — подтверждение выхода. Это игра-симуляция, бармен вымышлен.";

export interface CommandDef {
  name: string;
  label: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "/menu", label: "меню коктейлей" },
  { name: "/settings", label: "настройки и провайдер" },
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
      if (store.busy) {
        store.addSystemLine("Виктор отвечает, подожди секунду…");
        return true;
      }
      useAppStore.getState().go("menu");
      return true;
    case "/exit":
      exitApp();
      return true;
    case "/state": {
      const r = store.lastReasoning;
      const rSummary = r
        ? `${r.slice(0, 200)}${r.length > 200 ? "…" : ""}`
        : "(нет)";
      store.addSystemLine(
        `mood=${store.mood} · опьянение=${store.drunkenness.toFixed(1)} ` +
          `· выпито=${store.bacProxy.toFixed(1)} · подач=${store.served.length} ` +
          `· счёт=${store.tab}₽ · фаза=${store.phase}\n` +
          `reasoning: ${rSummary}`,
      );
      return true;
    }
    default:
      store.addSystemLine(`Не знаю команду «${cmd}». Набери /help.`);
      return true;
  }
}

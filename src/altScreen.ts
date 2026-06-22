const ENTER = "\x1b[?1049h\x1b[2J\x1b[H";
const EXIT = "\x1b[?1049l";
const SAVE_TITLE = "\x1b[22;0t";
const RESTORE_TITLE = "\x1b[23;0t";

let active = false;
let installed = false;

export function enterAltScreen(title?: string): void {
  if (active) return;
  if (!process.stdout.isTTY) return;
  if (title !== undefined) process.stdout.write(SAVE_TITLE);
  process.stdout.write(ENTER);
  if (title !== undefined) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
  active = true;
}

export function exitAltScreen(): void {
  if (!active) return;
  process.stdout.write(EXIT);
  process.stdout.write(RESTORE_TITLE);
  active = false;
}

export function installAltScreenGuards(): void {
  if (installed) return;
  installed = true;

  const fatal = (label: string, info: unknown) => {
    process.stderr.write(`\n[${label}] ${String(info)}\n`);
    exitAltScreen();
    process.exit(1);
  };

  const onSignal = (sig: NodeJS.Signals) => {
    exitAltScreen();
    process.exit(sig === "SIGINT" ? 130 : 143);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("SIGHUP", onSignal);
  process.on("uncaughtException", (err) => fatal("uncaughtException", err?.stack ?? err));
  process.on("unhandledRejection", (reason) => fatal("unhandledRejection", reason));
  process.on("exit", () => {
    exitAltScreen();
  });
}

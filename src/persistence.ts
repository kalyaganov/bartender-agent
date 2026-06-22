import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".bartender-agent");
const FILE = join(DIR, "preferences.json");
const LEGACY_DIR = join(homedir(), ".homeagent");

let migrated = false;

async function migrateLegacyDir(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    await fs.access(DIR);
    return;
  } catch {
    // нового каталога нет — попробуем перенести старый
  }
  try {
    await fs.rename(LEGACY_DIR, DIR);
  } catch {
    /* старого нет или перенос невозможен — тихо игнорируем */
  }
}

export interface Preferences {
  provider?: string;
  model?: string;
}

export async function loadPreferences(): Promise<Preferences> {
  await migrateLegacyDir();
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Preferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await migrateLegacyDir();
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    /* персистентность опциональна — тихо игнорируем */
  }
}

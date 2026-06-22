import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".homeagent");
const FILE = join(DIR, "preferences.json");

export interface Preferences {
  provider?: string;
  model?: string;
}

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Preferences;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(prefs, null, 2), "utf8");
  } catch {
    /* персистентность опциональна — тихо игнорируем */
  }
}

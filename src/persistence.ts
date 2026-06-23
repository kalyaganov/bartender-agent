import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".bartender-agent");
const FILE = join(DIR, "preferences.json");
const LEGACY_DIR = join(homedir(), ".homeagent");

export interface Preferences {
  endpoint?: string;
  token?: string;
  model?: string;
  thinking?: boolean;
}

export function isConfigured(p: Preferences): boolean {
  return Boolean(p.endpoint && p.token && p.model);
}

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

interface LegacyPrefs {
  provider?: string;
  model?: string;
  credentials?: Record<string, { apiKey?: string; baseURL?: string }>;
}

function migrateLegacy(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object") return {};
  const leg = raw as LegacyPrefs;
  const custom = leg.credentials?.custom;
  if (custom?.apiKey && custom.baseURL && leg.model) {
    return { endpoint: custom.baseURL, token: custom.apiKey, model: leg.model };
  }
  return {};
}

export async function loadPreferences(): Promise<Preferences> {
  await migrateLegacyDir();
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Preferences;
      if (typeof obj.endpoint === "string" || typeof obj.token === "string") {
        return {
          ...(typeof obj.endpoint === "string" ? { endpoint: obj.endpoint } : {}),
          ...(typeof obj.token === "string" ? { token: obj.token } : {}),
          ...(typeof obj.model === "string" ? { model: obj.model } : {}),
          ...(typeof obj.thinking === "boolean" ? { thinking: obj.thinking } : {}),
        };
      }
      const migrated = migrateLegacy(parsed);
      if (migrated.endpoint || migrated.token || migrated.model) {
        await savePreferences(migrated);
        return migrated;
      }
    }
    return {};
  } catch {
    return {};
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await migrateLegacyDir();
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(prefs, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    /* персистентность опциональна — тихо игнорируем */
  }
}

export function getPrefsPath(): string {
  return FILE;
}

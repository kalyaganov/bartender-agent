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
  extraHeaders?: Record<string, string>;
}

export function hasProviderConnection(p: Preferences): boolean {
  return Boolean(p.endpoint && p.token);
}

export function isConfigured(p: Preferences): boolean {
  return Boolean(hasProviderConnection(p) && p.model);
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
      const legacy = migrateLegacy(parsed);
      if (isConfigured(legacy)) {
        try {
          await savePreferences(legacy);
        } catch {}
        return legacy;
      }

      const obj = parsed as Preferences;
      const prefs: Preferences = {
        ...(typeof obj.endpoint === "string" ? { endpoint: obj.endpoint } : {}),
        ...(typeof obj.token === "string" ? { token: obj.token } : {}),
        ...(typeof obj.model === "string" ? { model: obj.model } : {}),
        ...(typeof obj.thinking === "boolean" ? { thinking: obj.thinking } : {}),
      };
      if (obj.extraHeaders != null && typeof obj.extraHeaders === "object" && !Array.isArray(obj.extraHeaders)) {
        const extraHeaders = Object.fromEntries(
          Object.entries(obj.extraHeaders).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
        );
        prefs.extraHeaders = extraHeaders;
      }
      return prefs;
    }
    return {};
  } catch {
    return {};
  }
}

let saveQueue: Promise<void> = Promise.resolve();

export function savePreferences(prefs: Preferences): Promise<void> {
  const contents = JSON.stringify(prefs, null, 2);
  const operation = saveQueue.then(async () => {
    await migrateLegacyDir();
    await fs.mkdir(DIR, { recursive: true });
    const tempFile = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tempFile, contents, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tempFile, FILE);
  });
  saveQueue = operation.catch(() => {});
  return operation;
}

export function getPrefsPath(): string {
  return FILE;
}

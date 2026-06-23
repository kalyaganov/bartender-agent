import {
  loadPreferences,
  isConfigured,
  type Preferences,
} from "./persistence";
import { useAppStore } from "./state/app";

export type InitialScreen = "bar" | "setup";

export interface InitialDecision {
  screen: InitialScreen;
}

export function resolveInitialScreen(prefs: Preferences): InitialScreen {
  return isConfigured(prefs) ? "bar" : "setup";
}

export async function bootstrap(): Promise<void> {
  const prefs = await loadPreferences();
  const store = useAppStore.getState();
  store.setPrefs(prefs);
  store.setScreen(resolveInitialScreen(prefs));
}

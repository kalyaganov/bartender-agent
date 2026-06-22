import { config } from "./config";
import { loadPreferences, type Preferences } from "./persistence";
import { useAppStore } from "./state/app";
import { configuredProviderIds } from "./agent/providers/registry";
import type { ProviderId } from "./agent/providers/types";

export interface InitialDecision {
  providerId: ProviderId | null;
  model?: string;
  /** Показывать экран выбора (пикер/инструкция). */
  goToPicker: boolean;
}

interface ResolveParams {
  envProvider?: ProviderId;
  envModel?: string;
  prefs?: Preferences;
  configured: ProviderId[];
}

/**
 * Чистая функция приоритета стартового провайдера (SPEC §3.1):
 *   env BARTENDER_PROVIDER  →  preferences.json  →  single configured  →  picker
 * Если провайдер уже «выбран» (env / prefs / единственный настроенный) — пикер
 * пропускается.
 */
export function resolveInitialProvider(params: ResolveParams): InitialDecision {
  const { envProvider, envModel, prefs, configured } = params;

  if (envProvider && configured.includes(envProvider)) {
    return { providerId: envProvider, model: envModel, goToPicker: false };
  }
  const prefsId = prefs?.provider as ProviderId | undefined;
  if (prefsId && configured.includes(prefsId)) {
    return { providerId: prefsId, model: prefs?.model, goToPicker: false };
  }
  if (configured.length === 1) {
    return { providerId: configured[0], goToPicker: false };
  }
  return { providerId: null, goToPicker: true };
}

export async function bootstrap(): Promise<void> {
  const prefs = await loadPreferences();
  const decision = resolveInitialProvider({
    envProvider: config.provider,
    envModel: config.model,
    prefs,
    configured: configuredProviderIds(),
  });

  const store = useAppStore.getState();
  if (decision.providerId) {
    store.setProvider(decision.providerId, decision.model);
  }
  store.setScreen(decision.goToPicker ? "selecting-provider" : "bar");
}

import type { LLMProvider, ProviderId } from "./types";
import { getProviderDef } from "./registry";

export function createProvider(id: ProviderId, model?: string): LLMProvider {
  const def = getProviderDef(id);
  if (!def) throw new Error(`Неизвестный провайдер: ${id}`);
  return def.build(model);
}

export type { LLMProvider, ProviderId } from "./types";

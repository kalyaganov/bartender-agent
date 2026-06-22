import { create } from "zustand";
import type { ProviderId } from "../agent/providers/types";
import { savePreferences } from "../persistence";

export type Screen =
  | "bar"
  | "selecting-provider"
  | "menu"
  | "exit-confirm";

interface AppState {
  screen: Screen;
  prevScreen: Screen;
  providerId: ProviderId | null;
  model?: string;
  /** Бампается при смене провайдера, чтобы инвалидировать кеш в loop.ts. */
  providerVersion: number;

  go: (screen: Screen) => void;
  back: () => void;
  setScreen: (screen: Screen) => void;
  setProvider: (id: ProviderId, model?: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "bar",
  prevScreen: "bar",
  providerId: null,
  model: undefined,
  providerVersion: 0,

  go: (screen) =>
    set((s) => ({ screen, prevScreen: s.screen === screen ? s.prevScreen : s.screen })),
  back: () =>
    set((s) => ({ screen: s.prevScreen === s.screen ? "bar" : s.prevScreen })),
  setScreen: (screen) => set({ screen }),

  setProvider: (id, model) => {
    set((s) => ({
      providerId: id,
      model,
      providerVersion: s.providerVersion + 1,
    }));
    void savePreferences({ provider: id, model });
  },
}));

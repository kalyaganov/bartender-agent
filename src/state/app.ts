import { create } from "zustand";
import {
  savePreferences,
  type Preferences,
} from "../persistence";

export type Screen =
  | "bar"
  | "setup"
  | "menu"
  | "exit-confirm";

interface AppState {
  screen: Screen;
  prevScreen: Screen;
  prefs: Preferences;

  go: (screen: Screen) => void;
  back: () => void;
  setScreen: (screen: Screen) => void;
  setPrefs: (prefs: Preferences) => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "bar",
  prevScreen: "bar",
  prefs: {},

  go: (screen) =>
    set((s) => ({ screen, prevScreen: s.screen === screen ? s.prevScreen : s.screen })),
  back: () =>
    set((s) => ({ screen: s.prevScreen === s.screen ? "bar" : s.prevScreen })),
  setScreen: (screen) => set({ screen }),

  setPrefs: (prefs) => {
    set({ prefs });
    void savePreferences(prefs);
  },
}));

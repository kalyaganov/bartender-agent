import { create } from "zustand";
import type { Mood } from "../agent/schemas";
import type { BartenderAction } from "../agent/schemas";
import type { Message } from "../agent/providers/types";
import { config } from "../config";
import {
  applyAction,
  initialGameState,
  type GameState,
  type Serving,
} from "./reducer";
import { displayDrunkenness, metabolize } from "./drunkenness";

export type Speaker = "bartender" | "user" | "system";

export interface Line {
  speaker: Speaker;
  text: string;
}

interface SessionState extends GameState {
  lines: Line[];
  streamingText: string;
  lastReasoning: string;
  busy: boolean;
  barTimeMin: number;
  pouring: string | null;

  addUserLine: (text: string) => void;
  addBartenderLine: (text: string) => void;
  addSystemLine: (text: string) => void;
  setMood: (mood: Mood) => void;
  applyBartenderAction: (action: BartenderAction) => void;
  tickMetabolism: () => void;
  setPouring: (name: string | null) => void;

  startStreaming: () => void;
  appendStreamingToken: (token: string) => void;
  appendReasoning: (token: string) => void;
  finalizeStreaming: () => void;
  setBusy: (busy: boolean) => void;

  reset: () => void;
}

const initialLines: Line[] = [
  { speaker: "bartender", text: "Ну привет, дружище. Присаживайся. Чем порадую сегодня?" },
  { speaker: "system", text: config.disclaimer },
];

const START_BAR_MIN = 23 * 60 + 47;

export const useStore = create<SessionState>((set) => ({
  ...initialGameState,
  lines: initialLines,
  streamingText: "",
  lastReasoning: "",
  busy: false,
  barTimeMin: START_BAR_MIN,
  pouring: null,

  addUserLine: (text) =>
    set((s) => ({ lines: [...s.lines, { speaker: "user", text }] })),
  addBartenderLine: (text) =>
    set((s) => ({ lines: [...s.lines, { speaker: "bartender", text }] })),
  addSystemLine: (text) =>
    set((s) => ({ lines: [...s.lines, { speaker: "system", text }] })),
  setMood: (mood) => set({ mood }),
  applyBartenderAction: (action) =>
    set((s) => {
      const current: GameState = {
        mood: s.mood,
        phase: s.phase,
        perceivedScore: s.perceivedScore,
        bacProxy: s.bacProxy,
        drunkenness: s.drunkenness,
        lastDrinkAt: s.lastDrinkAt,
        served: s.served,
        tab: s.tab,
      };
      const next = applyAction(current, action);
      // Анимация наливания — только если напиток реально подан (не forced refuse).
      const pouring =
        next.served.length > current.served.length
          ? action.drink?.name ?? null
          : null;
      return { ...(next as Partial<SessionState>), pouring };
    }),
  tickMetabolism: () =>
    set((s) => {
      const bacProxy = metabolize(s.bacProxy, 1);
      return {
        bacProxy,
        drunkenness: displayDrunkenness(s.perceivedScore, bacProxy),
        barTimeMin: s.barTimeMin + 1,
      };
    }),
  setPouring: (name) => set({ pouring: name }),

  startStreaming: () => set({ streamingText: "", lastReasoning: "" }),
  appendStreamingToken: (token) =>
    set((s) => ({ streamingText: s.streamingText + token })),
  appendReasoning: (token) =>
    set((s) => ({ lastReasoning: s.lastReasoning + token })),
  finalizeStreaming: () =>
    set((s) => {
      const text = s.streamingText.trim();
      if (!text) return { streamingText: "" };
      return {
        streamingText: "",
        lines: [...s.lines, { speaker: "bartender", text }],
      };
    }),
  setBusy: (busy) => set({ busy }),

  reset: () =>
    set({
      ...initialGameState,
      lines: initialLines,
      streamingText: "",
      lastReasoning: "",
      busy: false,
      barTimeMin: START_BAR_MIN,
      pouring: null,
    }),
}));

export function selectHistory(state: SessionState): Message[] {
  return state.lines
    .filter((l) => l.speaker === "user" || l.speaker === "bartender")
    .map((l) => ({
      role: l.speaker === "user" ? ("user" as const) : ("assistant" as const),
      content: l.text,
    }));
}

export type { Serving };

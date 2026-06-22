import type { BartenderAction, Mood, Phase } from "../agent/schemas";
import { config } from "../config";
import { displayDrunkenness } from "./drunkenness";

export interface Serving {
  name: string;
  alcoholic: boolean;
  units: number;
  price?: number;
  at: number;
}

export interface GameState {
  mood: Mood;
  phase: Phase;
  perceivedScore: number;
  bacProxy: number;
  drunkenness: number;
  lastDrinkAt: number | null;
  served: Serving[];
  tab: number;
}

export const initialGameState: GameState = {
  mood: "neutral",
  phase: "open",
  perceivedScore: 0,
  bacProxy: 0,
  drunkenness: 0,
  lastDrinkAt: null,
  served: [],
  tab: 0,
};

/**
 * Чистый редюсер: применяет действие бармена к игровому состоянию. SPEC §3, §4.3.
 * - drunkenness = взвешенная смесь perceivedScore и bacProxy
 * - выше порога отказа алкоголь НЕ наливается (forced refuse): напиток не
 *   добавляется в served/tab, bacProxy не растёт, mood → firm (§3.2)
 * - call_taxi: open → leaving → closed (после одного прощального хода, §4.3 шаг 6)
 */
export function applyAction(
  state: GameState,
  action: BartenderAction,
  now: number = Date.now(),
): GameState {
  const next: GameState = {
    ...state,
    mood: action.mood,
    perceivedScore: action.drunkennessAssessment.score,
  };

  // Фазы прощания/отказа: call_taxi открывает leaving; следующий ход → closed.
  if (action.action === "call_taxi" && (state.phase === "open" || state.phase === "cutOff")) {
    next.phase = "leaving";
  } else if (state.phase === "leaving") {
    next.phase = "closed";
  }

  // Порог отказа считается по НОВОЙ оценке опьянения (этот ход).
  // В фазе cutOff алкоголь отказывается всегда (§3.2).
  const newDisplay = displayDrunkenness(next.perceivedScore, state.bacProxy);
  const tooDrunk = newDisplay >= config.drunkenness.refuseThreshold;

  if (action.action === "pour_drink" || action.action === "serve_water") {
    const drink = action.drink;
    if (drink) {
      if (drink.alcoholic && (tooDrunk || state.phase === "cutOff")) {
        // Forced refuse: пьяному крепкое не наливаем. SPEC §3.2.
        // Напиток не записывается, таб и bacProxy не растут.
        next.mood = "firm";
        next.bacProxy = state.bacProxy;
        next.phase = "cutOff";
      } else {
        next.served = [...state.served, { ...drink, at: now }];
        next.bacProxy = state.bacProxy + drink.units;
        next.lastDrinkAt = now;
        if (drink.price) next.tab = state.tab + drink.price;
      }
    }
  }

  next.drunkenness = displayDrunkenness(next.perceivedScore, next.bacProxy);
  return next;
}

export function isAboveRefuseThreshold(state: GameState): boolean {
  return state.drunkenness >= config.drunkenness.refuseThreshold;
}

import { describe, it, expect } from "vitest";
import {
  applyAction,
  initialGameState,
  isAboveRefuseThreshold,
} from "../state/reducer";
import type { BartenderAction } from "../agent/schemas";

function action(overrides: Partial<BartenderAction>): BartenderAction {
  return {
    reply: "Реплика бармена.",
    mood: "cheerful",
    action: "chat",
    drunkennessAssessment: { score: 0, cues: [] },
    ...overrides,
  };
}

describe("reducer applyAction (M2)", () => {
  it("обновляет mood и perceivedScore из assessment", () => {
    const next = applyAction(
      initialGameState,
      action({ mood: "amused", drunkennessAssessment: { score: 3, cues: ["шутит"] } }),
    );
    expect(next.mood).toBe("amused");
    expect(next.perceivedScore).toBe(3);
    // display = 0.8*3 + 0.4*0 = 2.4
    expect(next.drunkenness).toBeCloseTo(2.4, 5);
  });

  it("call_taxi переводит фазу open → leaving", () => {
    const next = applyAction(initialGameState, action({ action: "call_taxi" }));
    expect(next.phase).toBe("leaving");
  });

  it("из leaving следующий ход переводит фазу → closed (§4.3 шаг 6)", () => {
    const leaving: typeof initialGameState = { ...initialGameState, phase: "leaving" };
    const next = applyAction(leaving, action({ action: "chat" }));
    expect(next.phase).toBe("closed");
  });

  it("call_taxi не меняет фазу из closed", () => {
    const next = applyAction(
      { ...initialGameState, phase: "closed" },
      action({ action: "call_taxi" }),
    );
    expect(next.phase).toBe("closed");
  });

  it("pour_drink добавляет напиток, увеличивает bacProxy и таб", () => {
    const next = applyAction(
      initialGameState,
      action({
        action: "pour_drink",
        drink: { name: "Олд фэшнд", alcoholic: true, units: 2, price: 12 },
      }),
      1000,
    );
    expect(next.served).toHaveLength(1);
    expect(next.served[0].name).toBe("Олд фэшнд");
    expect(next.bacProxy).toBe(2);
    expect(next.tab).toBe(12);
    expect(next.lastDrinkAt).toBe(1000);
  });

  it("serve_water не увеличивает bacProxy (units из drink)", () => {
    const next = applyAction(
      initialGameState,
      action({
        action: "serve_water",
        drink: { name: "Вода", alcoholic: false, units: 0, price: 0 },
      }),
    );
    expect(next.served).toHaveLength(1);
    expect(next.bacProxy).toBe(0);
  });

  it("isAboveRefuseThreshold срабатывает на высоком опьянении", () => {
    const drunk = applyAction(
      initialGameState,
      action({ drunkennessAssessment: { score: 9, cues: [] } }),
    );
    // display = 0.8*9 = 7.2 ≥ 7
    expect(isAboveRefuseThreshold(drunk)).toBe(true);

    const sober = applyAction(
      initialGameState,
      action({ drunkennessAssessment: { score: 4, cues: [] } }),
    );
    expect(isAboveRefuseThreshold(sober)).toBe(false);
  });

  it("forced refuse: пьяному алкоголь НЕ наливается (§3.2)", () => {
    const alreadyDrunk: typeof initialGameState = {
      ...initialGameState,
      perceivedScore: 9,
      bacProxy: 6,
      drunkenness: 0.8 * 9 + 0.4 * 6,
    };
    const next = applyAction(
      alreadyDrunk,
      action({
        mood: "sympathetic",
        action: "pour_drink",
        drunkennessAssessment: { score: 9, cues: ["шатается"] },
        drink: { name: "Водка", alcoholic: true, units: 3, price: 5 },
      }),
    );
    // Напиток НЕ записан, таб НЕ вырос, bacProxy не изменился, mood — firm
    expect(next.served).toHaveLength(0);
    expect(next.tab).toBe(0);
    expect(next.bacProxy).toBe(6);
    expect(next.mood).toBe("firm");
    expect(next.phase).toBe("cutOff");
  });

  it("cutOff: алкоголь отказывается даже если оценка снизилась", () => {
    const cutOff: typeof initialGameState = {
      ...initialGameState,
      phase: "cutOff",
      perceivedScore: 3,
      bacProxy: 0,
    };
    const next = applyAction(
      cutOff,
      action({
        action: "pour_drink",
        drunkennessAssessment: { score: 3, cues: [] },
        drink: { name: "Пиво", alcoholic: true, units: 1, price: 5 },
      }),
    );
    expect(next.served).toHaveLength(0);
    expect(next.mood).toBe("firm");
    expect(next.phase).toBe("cutOff");
  });

  it("cutOff: безалкогольное наливается", () => {
    const cutOff: typeof initialGameState = {
      ...initialGameState,
      phase: "cutOff",
      perceivedScore: 3,
      bacProxy: 0,
    };
    const next = applyAction(
      cutOff,
      action({
        action: "serve_water",
        drunkennessAssessment: { score: 3, cues: [] },
        drink: { name: "Вода", alcoholic: false, units: 0, price: 0 },
      }),
    );
    expect(next.served).toHaveLength(1);
  });

  it("call_taxi из cutOff переводит фазу → leaving", () => {
    const cutOff: typeof initialGameState = {
      ...initialGameState,
      phase: "cutOff",
    };
    const next = applyAction(cutOff, action({ action: "call_taxi" }));
    expect(next.phase).toBe("leaving");
  });

  it("forced refuse не срабатывает на безалкогольном даже пьяному", () => {
    const drunk: typeof initialGameState = {
      ...initialGameState,
      perceivedScore: 9,
      bacProxy: 6,
    };
    const next = applyAction(
      drunk,
      action({
        action: "serve_water",
        drunkennessAssessment: { score: 9, cues: [] },
        drink: { name: "Вода", alcoholic: false, units: 0, price: 0 },
      }),
    );
    expect(next.served).toHaveLength(1);
  });

  it("forced refuse считает порог по НОВОЙ оценке (скачок трезв→пьян)", () => {
    // Гость был трезв (perceived 0), но в этом ходе модель оценила в 9.
    // Порог должен сработать по новой оценке → отказ.
    const wasSober: typeof initialGameState = {
      ...initialGameState,
      perceivedScore: 0,
      bacProxy: 0,
    };
    const next = applyAction(
      wasSober,
      action({
        action: "pour_drink",
        drunkennessAssessment: { score: 9, cues: [] },
        drink: { name: "Виски", alcoholic: true, units: 2, price: 10 },
      }),
    );
    expect(next.served).toHaveLength(0);
    expect(next.mood).toBe("firm");
  });

  it("не мутирует исходное состояние", () => {
    const before = { ...initialGameState, served: [] };
    applyAction(
      initialGameState,
      action({
        action: "pour_drink",
        drink: { name: "Пиво", alcoholic: true, units: 1 },
      }),
    );
    expect(before.served).toEqual([]);
  });
});

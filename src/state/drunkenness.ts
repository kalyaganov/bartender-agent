import { config } from "../config";

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Итоговое опьянение игрока (0-10): взвешенная смесь оценки LLM по репликам
 * и накопленного «стака» выпитого. SPEC §3.1.
 */
export function displayDrunkenness(
  perceivedScore: number,
  bacProxy: number,
): number {
  const { perceivedWeight, bacProxyWeight } = config.drunkenness;
  const bacScore = clamp(bacProxy, 0, 10);
  return clamp(
    perceivedWeight * perceivedScore + bacProxyWeight * bacScore,
    0,
    10,
  );
}

/**
 * Метаболизм: bacProxy снижается со временем. SPEC §3.1.
 */
export function metabolize(bacProxy: number, minutesElapsed: number): number {
  const reduced =
    bacProxy - config.drunkenness.metabolismRatePerMin * minutesElapsed;
  return Math.max(0, reduced);
}

export function zoneLabel(value: number): string {
  const v = clamp(value, 0, 10);
  if (v <= 2) return "трезв";
  if (v <= 4) return "навеселе";
  if (v <= 6) return "пьян";
  if (v <= 8) return "сильно пьян";
  return "срез";
}

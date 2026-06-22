import type { ToolSpec } from "./providers/types";
import { MOODS, ACTIONS } from "./schemas";
import { BartenderAction, type BartenderAction as BartenderActionType } from "./schemas";

export const BARTENDER_TOOL: ToolSpec = {
  name: "bartender_action",
  description:
    "Структурированные данные о реплике бармена за этот ход. " +
    "Вызывай ОБЯЗАТЕЛЬНО каждый раз вместе со своей устной репликой. " +
    "Поля: mood — твоё текущее настроение (меняет выражение лица); " +
    "action — что ты делаешь; drink — если наливаешь; " +
    "drunkennessAssessment — насколько пьян гость по его реплике (0-10) и что заметил.",
  inputSchema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Разговорная реплика бармена за этот ход, 1-3 предложения, в образе, на русском. Обязательно." },
      mood: { type: "string", enum: [...MOODS] },
      action: { type: "string", enum: [...ACTIONS] },
      drink: {
        type: "object",
        properties: {
          name: { type: "string" },
          alcoholic: { type: "boolean" },
          units: { type: "number", minimum: 0, maximum: 4 },
          price: { type: "number" },
        },
        required: ["name", "alcoholic", "units"],
      },
      drunkennessAssessment: {
        type: "object",
        properties: {
          score: { type: "number", minimum: 0, maximum: 10 },
          cues: { type: "array", items: { type: "string" } },
        },
        required: ["score", "cues"],
      },
      menuOffered: { type: "boolean" },
    },
    required: ["reply", "mood", "action", "drunkennessAssessment"],
  },
};

export function parseBartenderAction(input: unknown): BartenderActionType | null {
  if (input == null) return null;
  const result = BartenderAction.safeParse(input);
  if (result.success) return result.data;
  console.error("[tools] invalid bartender_action:", result.error.issues);
  return null;
}

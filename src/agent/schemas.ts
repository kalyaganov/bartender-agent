import { z } from "zod";

export const MOODS = [
  "neutral",
  "cheerful",
  "amused",
  "curious",
  "concerned",
  "sympathetic",
  "firm",
  "surprised",
  "laughing",
  "thoughtful",
] as const;

export const MoodEnum = z.enum(MOODS);
export type Mood = z.infer<typeof MoodEnum>;

export const ACTIONS = [
  "chat",
  "recommend",
  "pour_drink",
  "serve_water",
  "refuse",
  "suggest_home",
  "call_taxi",
] as const;

export const ActionEnum = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionEnum>;

export const DrinkSchema = z.object({
  name: z.string(),
  alcoholic: z.boolean(),
  units: z.number().min(0).max(4),
  price: z.number().optional(),
});
export type Drink = z.infer<typeof DrinkSchema>;

export const DrunkennessAssessment = z.object({
  score: z.number().min(0).max(10),
  cues: z.array(z.string()),
});
export type DrunkennessAssessment = z.infer<typeof DrunkennessAssessment>;

export const BartenderAction = z.object({
  reply: z.string().describe("Разговорная реплика бармена (обязательно, 1-3 предложения, в образе)"),
  mood: MoodEnum,
  action: ActionEnum,
  drink: DrinkSchema.optional(),
  drunkennessAssessment: DrunkennessAssessment,
  menuOffered: z.boolean().optional(),
});
export type BartenderAction = z.infer<typeof BartenderAction>;

export const PHASES = ["open", "cutOff", "leaving", "closed"] as const;
export type Phase = (typeof PHASES)[number];

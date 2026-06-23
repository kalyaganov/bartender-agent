export type TextPart = { type: "text"; text: string };
export type ReasoningPart = { type: "reasoning"; text: string };

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: unknown;
}

export type ContentPart = TextPart | ReasoningPart | ToolCallPart;

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: ContentPart[] }
  | { role: "tool"; content: ToolResultPart[] };

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ReasoningConfig {
  effort?: "low" | "medium" | "high";
  budgetTokens?: number;
}

export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  stopSequences?: string[];
  reasoning?: ReasoningConfig;
}

export type ToolChoice =
  | "auto"
  | "none"
  | "required"
  | { type: "tool"; toolName: string };

export type FinishReason =
  | "stop"
  | "length"
  | "tool-calls"
  | "content-filter"
  | "error";

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export type StreamPart =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "finish"; finishReason: FinishReason; usage?: Usage }
  | { type: "error"; error: unknown };

export interface StreamTurnOptions {
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  toolChoice?: ToolChoice;
  generation?: GenerationConfig;
  signal?: AbortSignal;
}

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsReasoning: boolean;
  contextWindow?: number;
}

export interface LLMProvider {
  readonly provider: string;
  readonly modelId: string;
  readonly capabilities: ProviderCapabilities;
  streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamPart>;
}

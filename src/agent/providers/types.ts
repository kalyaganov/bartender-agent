export type ProviderId = "anthropic" | "openai" | "opencode-go";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "token"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "toolCall"; toolName: string; input: unknown }
  | { type: "done" };

export interface StreamTurnOptions {
  system: string;
  messages: Message[];
  tools?: ToolSpec[];
  signal?: AbortSignal;
}

export interface LLMProvider {
  streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamEvent>;
}

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../../config";
import type {
  LLMProvider,
  StreamEvent,
  StreamTurnOptions,
  ToolSpec,
} from "./types";

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async *streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamEvent> {
    const wantThinking = config.reasoning.anthropicThinking;
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: wantThinking ? 4096 : 512,
        thinking: wantThinking
          ? {
              type: "enabled",
              budget_tokens: config.reasoning.anthropicThinkingBudget,
            }
          : undefined,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: opts.tools?.map((t) => this.toAnthropicTool(t)),
        tool_choice: opts.tools?.length ? { type: "any" } : undefined,
      },
      { signal: opts.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "thinking_delta") {
          yield { type: "reasoning", text: event.delta.thinking };
        } else if (event.delta.type === "text_delta") {
          yield { type: "token", text: event.delta.text };
        }
      }
    }

    const final = await stream.finalMessage();
    for (const block of final.content) {
      if (block.type === "tool_use") {
        yield { type: "toolCall", toolName: block.name, input: block.input };
      }
    }
    yield { type: "done" };
  }

  private toAnthropicTool(tool: ToolSpec): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    };
  }
}

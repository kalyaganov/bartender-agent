import OpenAI from "openai";
import type {
  LLMProvider,
  Message,
  StreamEvent,
  StreamTurnOptions,
  ToolSpec,
} from "./types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async *streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        messages: [
          { role: "system", content: opts.system },
          ...opts.messages.map((m) => this.toMessage(m)),
        ],
        tools: opts.tools?.map((t) => this.toOpenAITool(t)),
        tool_choice: opts.tools?.length ? "auto" : undefined,
      },
      { signal: opts.signal },
    );

    let toolName = "";
    let toolArgs = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as
        | Record<string, unknown>
        | undefined;
      if (!delta) continue;

      const reasoning = delta.reasoning_content;
      if (typeof reasoning === "string" && reasoning) {
        yield { type: "reasoning", text: reasoning };
      }

      const content = delta.content;
      if (typeof content === "string" && content) {
        yield { type: "token", text: content };
      }

      const tc = (
        delta as { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> }
      ).tool_calls?.[0];
      if (tc?.function?.name) toolName = tc.function.name;
      if (tc?.function?.arguments) toolArgs += tc.function.arguments;
    }

    if (toolName && toolArgs) {
      try {
        yield { type: "toolCall", toolName, input: JSON.parse(toolArgs) };
      } catch {
        console.error("[openai] failed to parse tool args:", toolArgs);
      }
    }
    yield { type: "done" };
  }

  private toMessage(m: Message): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    return { role: m.role, content: m.content };
  }

  private toOpenAITool(tool: ToolSpec): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }
}

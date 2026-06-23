import OpenAI from "openai";
import { toProviderError } from "./errors";
import type {
  FinishReason,
  LLMProvider,
  Message,
  ProviderCapabilities,
  StreamPart,
  StreamTurnOptions,
  ToolChoice,
  ToolSpec,
} from "./types";

interface ToolCallAcc {
  id: string;
  name: string;
  argsText: string;
}

interface ProviderCtorOpts {
  apiKey: string;
  model: string;
  baseURL?: string;
  capabilities: ProviderCapabilities;
}

export class OpenAIProvider implements LLMProvider {
  readonly provider = "openai-compat";
  readonly modelId: string;
  readonly capabilities: ProviderCapabilities;
  private client: OpenAI;

  constructor(opts: ProviderCtorOpts) {
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.modelId = opts.model;
    this.capabilities = opts.capabilities;
  }

  async *streamTurn(opts: StreamTurnOptions): AsyncIterable<StreamPart> {
    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model: this.modelId,
          stream: true,
          messages: [
            { role: "system", content: opts.system },
            ...this.toMessages(opts.messages),
          ],
          tools: opts.tools?.map((t) => this.toOpenAITool(t)),
          tool_choice: opts.tools?.length
            ? this.mapToolChoice(opts.toolChoice)
            : undefined,
          temperature: opts.generation?.temperature,
          max_tokens: opts.generation?.maxOutputTokens,
          top_p: opts.generation?.topP,
          stop: opts.generation?.stopSequences,
        },
        { signal: opts.signal },
      );
    } catch (err) {
      throw toProviderError(err);
    }

    const acc = new Map<number, ToolCallAcc>();
    let finishReason: string | undefined;
    let usage: OpenAI.Completions.CompletionUsage | undefined;

    try {
      for await (const chunk of stream) {
        if (chunk.usage) usage = chunk.usage;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta as Record<string, unknown> | undefined;

        if (delta) {
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            yield { type: "reasoning-delta", text: reasoning };
          }

          const content = delta.content;
          if (typeof content === "string" && content) {
            yield { type: "text-delta", text: content };
          }

          const toolCalls = (
            delta as {
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            }
          ).tool_calls;
          if (toolCalls) {
            for (const tc of toolCalls) {
              const idx = tc.index ?? 0;
              const entry = acc.get(idx) ?? { id: "", name: "", argsText: "" };
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) {
                entry.argsText += tc.function.arguments;
                yield {
                  type: "tool-call-delta",
                  toolCallId: entry.id || String(idx),
                  argsTextDelta: tc.function.arguments,
                };
              }
              acc.set(idx, entry);
            }
          }
        }

        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    } catch (err) {
      throw toProviderError(err);
    }

    for (const entry of acc.values()) {
      if (!entry.name && !entry.argsText) continue;
      let parsed: unknown = undefined;
      if (entry.argsText) {
        try {
          parsed = JSON.parse(entry.argsText);
        } catch {
          console.error("[openai] failed to parse tool args:", entry.argsText);
        }
      }
      yield {
        type: "tool-call",
        toolCallId: entry.id || `call_${entry.name}`,
        toolName: entry.name,
        args: parsed,
      };
    }

    yield {
      type: "finish",
      finishReason: this.mapFinishReason(finishReason),
      ...(usage
        ? {
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
              reasoningTokens: (usage as { completion_tokens_details?: { reasoning_tokens?: number } })
                .completion_tokens_details?.reasoning_tokens,
            },
          }
        : {}),
    };
  }

  private toMessages(
    messages: Message[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        result.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const text = m.content
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");
        const calls = m.content.filter((p) => p.type === "tool-call");
        result.push({
          role: "assistant",
          content: text || null,
          ...(calls.length
            ? {
                tool_calls: calls.map((c) => ({
                  id: c.toolCallId,
                  type: "function" as const,
                  function: {
                    name: c.toolName,
                    arguments:
                      typeof c.args === "string"
                        ? c.args
                        : JSON.stringify(c.args ?? {}),
                  },
                })),
              }
            : {}),
        });
      } else {
        for (const r of m.content) {
          result.push({
            role: "tool",
            tool_call_id: r.toolCallId,
            content:
              typeof r.result === "string" ? r.result : JSON.stringify(r.result),
          });
        }
      }
    }
    return result;
  }

  private mapToolChoice(
    c: ToolChoice | undefined,
  ): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined {
    if (!c) return "auto";
    if (c === "auto" || c === "none" || c === "required") return c;
    return { type: "function", function: { name: c.toolName } };
  }

  private mapFinishReason(reason: string | undefined): FinishReason {
    switch (reason) {
      case "length":
        return "length";
      case "tool_calls":
      case "function_call":
        return "tool-calls";
      case "content_filter":
        return "content-filter";
      default:
        return "stop";
    }
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

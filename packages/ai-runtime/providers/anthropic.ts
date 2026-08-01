import { ProviderError, toProviderError } from "../errors";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ProviderHealth,
  StreamEvent,
  ToolCallRequest,
  UsageStats,
} from "../types";
import { deadlineSignal, parseSse } from "./sse";
import { httpError } from "./http";
import type { ChatProvider } from "./provider";

/**
 * Anthropic Messages API adapter (claude-* models). The wire format differs
 * from the OpenAI-compatible shape in every direction, so it gets its own
 * adapter behind the same ChatProvider contract:
 *
 * · system prompt is a top-level field, not a message
 * · max_tokens is REQUIRED on every call (we default to 4096 honestly)
 * · tool calls are `tool_use` content blocks; results are `tool_result`
 *   blocks wrapped in a synthetic user message
 * · usage is input_tokens/output_tokens; streaming is event-typed SSE
 *
 * No JSON-enforcement mode exists upstream — JSON consumers (planner) rely
 * on prompt instruction + the runtime's tolerant parse/retry, which is the
 * same posture we take with free OpenRouter models.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

function usageOf(u: AnthropicUsage | undefined, latencyMs: number): UsageStats {
  const promptTokens = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
  const completionTokens = u?.output_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    latencyMs,
    costMicros: 0,
  };
}

function finishOf(stop: string | undefined | null, hasTools: boolean): ChatResponse["finishReason"] {
  if (hasTools || stop === "tool_use") return "tool_calls";
  if (stop === "max_tokens") return "length";
  return "stop";
}

/** Split off system messages; map the rest to Anthropic's message format. */
function mapMessages(messages: ChatMessage[]): {
  system: string | undefined;
  messages: Array<Record<string, unknown>>;
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const out: Array<Record<string, unknown>> = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool" && m.toolResults?.length) {
      out.push({
        role: "user",
        content: m.toolResults.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
        })),
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const c of m.toolCalls) {
        content.push({ type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    out.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }
  // Anthropic requires a non-empty, user-first alternation; if the caller
  // produced no non-system messages, send a single user ping honestly.
  return {
    system: system || undefined,
    messages: out.length ? out : [{ role: "user", content: "…" }],
  };
}

export class AnthropicProvider implements ChatProvider {
  readonly id = "anthropic";
  readonly label = "Anthropic";
  readonly supportsTools = true;
  // Messages API has no enforced JSON mode — prompt-instruction instead.
  readonly supportsJsonMode = false;
  readonly supportsStreaming = true;

  constructor(
    private readonly apiKey: string,
    readonly defaultModel = "claude-haiku-4-5",
    private readonly baseUrl = "https://api.anthropic.com" // origin, no trailing slash
  ) {}

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  private buildBody(request: ChatRequest, stream: boolean) {
    const { system, messages } = mapMessages(request.messages);
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      max_tokens: request.maxTokens ?? 4096, // required upstream
      messages,
      stream,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.stopSequences?.length) body.stop_sequences = request.stopSequences;
    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      if (request.toolChoice === "none") body.tool_choice = { type: "none" };
      else if (typeof request.toolChoice === "object") {
        body.tool_choice = { type: "tool", name: request.toolChoice.name };
      }
    }
    return body;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(request, false)),
        signal,
      });
      if (!res.ok) throw await httpError(res, this.id);
      const json = (await res.json()) as {
        content?: AnthropicBlock[];
        stop_reason?: string | null;
        usage?: AnthropicUsage;
        model?: string;
      };
      const text = (json.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text!)
        .join("");
      const toolCalls: ToolCallRequest[] = (json.content ?? [])
        .filter((b) => b.type === "tool_use" && b.name)
        .map((b, i) => ({
          id: b.id ?? `toolu_${i}`,
          name: b.name!,
          arguments:
            typeof b.input === "object" && b.input !== null
              ? (b.input as Record<string, unknown>)
              : {},
        }));
      const latencyMs = Date.now() - started;
      return {
        content: text,
        toolCalls,
        model: json.model ?? request.model ?? this.defaultModel,
        provider: this.id,
        usage: usageOf(json.usage, latencyMs),
        finishReason: finishOf(json.stop_reason, toolCalls.length > 0),
        attempt: 1,
      };
    } catch (err) {
      throw toProviderError(err, this.id, "chat");
    } finally {
      cancel();
    }
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(request, true)),
        signal,
      });
      if (!res.ok) throw await httpError(res, this.id);

      // Anthropic's event stream: lines "event: <type>" precede each
      // "data: {json}" — parseSse yields the data payloads; the event type
      // is embedded in each payload's `type` field.
      const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
      let inputTokens: AnthropicUsage | undefined;
      let outputTokens = 0;
      let stopReason: string | null = null;
      let model = request.model ?? this.defaultModel;

      for await (const raw of parseSse(res, signal)) {
        let event: {
          type?: string;
          index?: number;
          delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null };
          content_block?: AnthropicBlock;
          message?: { usage?: AnthropicUsage; model?: string };
          usage?: AnthropicUsage;
          error?: { type?: string; message?: string };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          continue;
        }
        switch (event.type) {
          case "message_start":
            inputTokens = event.message?.usage;
            if (event.message?.model) model = event.message.model;
            break;
          case "content_block_start":
            if (event.content_block?.type === "tool_use") {
              toolBlocks.set(event.index ?? 0, {
                id: event.content_block.id ?? `toolu_${event.index ?? 0}`,
                name: event.content_block.name ?? "unknown",
                json: "",
              });
            }
            break;
          case "content_block_delta":
            if (event.delta?.type === "text_delta" && event.delta.text) {
              yield { type: "text_delta", text: event.delta.text };
            } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
              const block = toolBlocks.get(event.index ?? 0);
              if (block) block.json += event.delta.partial_json;
            }
            break;
          case "message_delta":
            if (event.usage?.output_tokens !== undefined) outputTokens = event.usage.output_tokens;
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            break;
          case "error":
            throw new ProviderError(
              "model",
              this.id,
              event.error?.message ?? "stream error event"
            );
          default:
            break; // message_stop / content_block_stop / ping
        }
      }

      const toolCalls: ToolCallRequest[] = [...toolBlocks.values()].map((b) => ({
        id: b.id,
        name: b.name,
        arguments: (() => {
          try {
            const parsed = JSON.parse(b.json || "{}");
            return typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>)
              : {};
          } catch {
            return {};
          }
        })(),
      }));
      for (const toolCall of toolCalls) yield { type: "tool_call", toolCall };

      const latencyMs = Date.now() - started;
      yield {
        type: "usage",
        usage: usageOf({ input_tokens: inputTokens?.input_tokens, output_tokens: outputTokens }, latencyMs),
        model,
        provider: this.id,
      };
      yield { type: "done", finishReason: finishOf(stopReason, toolCalls.length > 0) };
    } catch (err) {
      const normalized = toProviderError(err, this.id, "stream");
      if (normalized instanceof ProviderError) {
        yield { type: "error", error: { kind: normalized.kind, message: normalized.message } };
        throw normalized;
      }
      throw err;
    } finally {
      cancel();
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(10_000);
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal,
      });
      if (!res.ok) throw await httpError(res, this.id);
      await res.arrayBuffer();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      const normalized = toProviderError(err, this.id, "health check");
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: `${normalized.kind}: ${normalized.message}`,
      };
    } finally {
      cancel();
    }
  }
}

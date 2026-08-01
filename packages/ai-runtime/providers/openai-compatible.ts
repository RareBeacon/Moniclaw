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
import type { ChatProvider, ProviderCredentials } from "./provider";

/**
 * Adapter for OpenAI-compatible chat-completions APIs.
 *
 * Concrete adapters: OpenRouter, OpenAI, DeepSeek, Mistral, Groq, xAI,
 * Together — and `custom`, the user-supplied gateway. One wire format, one
 * code path; vendors differ only by base URL, key and default model.
 */

interface VendorToolCall {
  id?: string;
  index?: number;
  function?: { name?: string; arguments?: string };
}

interface VendorChoice {
  message?: {
    content?: string | null;
    tool_calls?: VendorToolCall[];
  };
  delta?: {
    content?: string | null;
    tool_calls?: VendorToolCall[];
  };
  finish_reason?: string | null;
}

interface VendorUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

function mapMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool" && m.toolResults?.length) {
      return m.toolResults.map((r) => ({
        role: "tool" as const,
        tool_call_id: r.id,
        name: r.name,
        content: r.content,
      }));
    }
    const base: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.toolCalls?.length) {
      base.tool_calls = m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.arguments) },
      }));
    }
    return base;
  }).flat();
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : { value: parsed };
  } catch {
    return { raw };
  }
}

function mapToolCalls(calls: VendorToolCall[] | undefined): ToolCallRequest[] {
  if (!calls?.length) return [];
  return calls
    .filter((c) => c.function?.name)
    .map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function?.name ?? `unknown_${i}`,
      arguments: safeJson(c.function?.arguments ?? "{}"),
    }));
}

function usageOf(u: VendorUsage | undefined, latencyMs: number): UsageStats {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0),
    latencyMs,
    costMicros: 0,
  };
}

export class OpenAiCompatibleProvider implements ChatProvider {
  readonly supportsTools = true;
  readonly supportsJsonMode = true;
  readonly supportsStreaming = true;

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly baseUrl: string, // no trailing slash
    private readonly apiKey: string,
    readonly defaultModel: string,
    private readonly extraHeaders: Record<string, string> = {},
    private readonly organizationHeaders?: Record<string, string>
  ) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      ...this.extraHeaders,
      ...(this.organizationHeaders ?? {}),
    };
  }

  private buildBody(request: ChatRequest, stream: boolean) {
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages: mapMessages(request.messages),
      stream,
    };
    if (stream) body.stream_options = { include_usage: true };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.stopSequences?.length) body.stop = request.stopSequences;
    if (request.tools?.length && this.supportsTools) {
      body.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      if (request.toolChoice === "none") body.tool_choice = "none";
      else if (typeof request.toolChoice === "object") {
        body.tool_choice = {
          type: "function",
          function: { name: request.toolChoice.name },
        };
      }
    }
    if (request.jsonMode && this.supportsJsonMode) {
      body.response_format =
        typeof request.jsonMode === "object"
          ? { type: "json_schema", json_schema: request.jsonMode }
          : { type: "json_object" };
    }
    return body;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      request.signal
    );
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(request, false)),
        signal,
      });
      if (!res.ok) throw await httpError(res, this.id);
      const json = (await res.json()) as {
        choices?: VendorChoice[];
        usage?: VendorUsage;
        model?: string;
      };
      const choice = json.choices?.[0];
      const toolCalls = mapToolCalls(choice?.message?.tool_calls);
      const latencyMs = Date.now() - started;
      return {
        content: choice?.message?.content ?? "",
        toolCalls,
        model: json.model ?? request.model ?? this.defaultModel,
        provider: this.id,
        usage: usageOf(json.usage, latencyMs),
        finishReason: toolCalls.length
          ? "tool_calls"
          : ((choice?.finish_reason ?? "stop") as ChatResponse["finishReason"]),
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
    const { signal, cancel } = deadlineSignal(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      request.signal
    );
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.buildBody(request, true)),
        signal,
      });
      if (!res.ok) throw await httpError(res, this.id);

      const pending: VendorToolCall[] = [];
      let finalUsage: VendorUsage | undefined;
      let model = request.model ?? this.defaultModel;

      for await (const raw of parseSse(res, signal)) {
        let chunk: {
          choices?: VendorChoice[];
          usage?: VendorUsage | null;
          model?: string;
        };
        try {
          chunk = JSON.parse(raw);
        } catch {
          continue; // tolerate keep-alive junk
        }
        if (chunk.model) model = chunk.model;
        if (chunk.usage) finalUsage = chunk.usage;
        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) yield { type: "text_delta", text: delta.content };
        if (delta?.tool_calls?.length) pending.push(...delta.tool_calls);
        if (choice?.finish_reason && choice.finish_reason !== "tool_calls") {
          // continue until usage arrives or stream ends
        }
      }

      const toolCalls = mapToolCalls(mergeToolCallDeltas(pending));
      for (const toolCall of toolCalls) yield { type: "tool_call", toolCall };

      const latencyMs = Date.now() - started;
      yield {
        type: "usage",
        usage: usageOf(finalUsage, latencyMs),
        model,
        provider: this.id,
      };
      yield {
        type: "done",
        finishReason: toolCalls.length ? "tool_calls" : "stop",
      };
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
      const res = await fetch(`${this.baseUrl}/models`, {
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

/** Merge OpenAI's incremental tool-call deltas (name once, args chunked). */
function mergeToolCallDeltas(deltas: VendorToolCall[]): VendorToolCall[] {
  const byIndex = new Map<number, VendorToolCall>();
  for (const d of deltas) {
    const i = d.index ?? 0;
    const prev = byIndex.get(i) ?? { index: i, function: { name: "", arguments: "" } };
    if (d.id) prev.id = d.id;
    if (d.function?.name) prev.function!.name = (prev.function!.name ?? "") + d.function.name;
    if (d.function?.arguments)
      prev.function!.arguments = (prev.function!.arguments ?? "") + d.function.arguments;
    byIndex.set(i, prev);
  }
  return [...byIndex.values()];
}

import { ProviderError, kindFromStatus, toProviderError } from "../errors";
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ProviderHealth,
  StreamEvent,
  UsageStats,
} from "../types";
import { deadlineSignal, parseNdjson } from "./sse";
import type {
  ChatProvider,
  EmbeddingProvider,
  ProviderCredentials,
} from "./provider";

/**
 * Ollama adapter — local/self-hosted OSS models, keyless by design.
 * Wire format: POST /api/chat (NDJSON stream) · POST /api/embed (batch).
 */

const DEFAULT_BASE = "http://localhost:11434";
const DEFAULT_TIMEOUT_MS = 120_000; // local inference can be slow

interface OllamaChunk {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: Record<string, unknown> };
    }>;
  };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements ChatProvider {
  readonly id = "ollama";
  readonly label = "Ollama (local/self-hosted)";
  readonly supportsTools = true; // honored on tool-capable models
  readonly supportsJsonMode = true;
  readonly supportsStreaming = true;
  readonly defaultModel: string = "llama3.1";

  constructor(
    private readonly baseUrl: string = DEFAULT_BASE,
    defaultModel?: string
  ) {
    if (defaultModel) this.defaultModel = defaultModel;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Buffered chat = collect the stream (Ollama is stream-native).
    let content = "";
    let toolCalls: ChatResponse["toolCalls"] = [];
    let usage: UsageStats = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      costMicros: 0,
    };
    let model = request.model ?? this.defaultModel;
    for await (const event of this.streamChat(request)) {
      if (event.type === "text_delta") content += event.text;
      if (event.type === "tool_call") toolCalls = toolCalls.concat(event.toolCall);
      if (event.type === "usage") {
        usage = event.usage;
        model = event.model;
      }
    }
    return {
      content,
      toolCalls,
      model,
      provider: this.id,
      usage,
      finishReason: toolCalls.length ? "tool_calls" : "stop",
      attempt: 1,
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      request.signal
    );
    try {
      const body: Record<string, unknown> = {
        model: request.model ?? this.defaultModel,
        messages: request.messages.map((m) => {
          if (m.role === "tool" && m.toolResults?.length) {
            return m.toolResults.map((r) => ({
              role: "tool",
              name: r.name,
              content: r.content,
            }));
          }
          const base: Record<string, unknown> = {
            role: m.role,
            content: m.content,
          };
          if (m.toolCalls?.length) {
            base.tool_calls = m.toolCalls.map((c) => ({
              function: { name: c.name, arguments: c.arguments },
            }));
          }
          return base;
        }).flat(),
        stream: true,
        options: {
          ...(request.temperature !== undefined
            ? { temperature: request.temperature }
            : {}),
          ...(request.maxTokens !== undefined
            ? { num_predict: request.maxTokens }
            : {}),
          ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
        },
      };
      if (request.jsonMode) body.format = "json";
      if (request.tools?.length) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));
      }

      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new ProviderError(
          kindFromStatus(res.status),
          this.id,
          `${res.status} ${detail.slice(0, 300)}`,
          { status: res.status }
        );
      }

      let model = request.model ?? this.defaultModel;
      let promptTokens = 0;
      let completionTokens = 0;
      const emittedTools = new Set<string>();

      for await (const line of parseNdjson(res, signal)) {
        let chunk: OllamaChunk;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }
        if (chunk.error) {
          throw new ProviderError("model", this.id, chunk.error);
        }
        if (chunk.model) model = chunk.model;
        const text = chunk.message?.content;
        if (text) yield { type: "text_delta", text };
        for (const call of chunk.message?.tool_calls ?? []) {
          const name = call.function?.name;
          if (!name) continue;
          const key = `${name}:${JSON.stringify(call.function?.arguments ?? {})}`;
          if (emittedTools.has(key)) continue;
          emittedTools.add(key);
          yield {
            type: "tool_call",
            toolCall: {
              id: `ollama_${emittedTools.size}`,
              name,
              arguments: call.function?.arguments ?? {},
            },
          };
        }
        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count ?? promptTokens;
          completionTokens = chunk.eval_count ?? completionTokens;
        }
      }

      yield {
        type: "usage",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          latencyMs: Date.now() - started,
          costMicros: 0,
        },
        model,
        provider: this.id,
      };
      yield {
        type: "done",
        finishReason: emittedTools.size ? "tool_calls" : "stop",
      };
    } catch (err) {
      const normalized = toProviderError(err, this.id, "stream");
      yield { type: "error", error: { kind: normalized.kind, message: normalized.message } };
      throw normalized;
    } finally {
      cancel();
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(5_000);
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal });
      if (!res.ok) {
        throw new ProviderError(kindFromStatus(res.status), this.id, `${res.status}`);
      }
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

export class OllamaEmbeddings implements EmbeddingProvider {
  readonly id = "ollama";
  readonly defaultModel: string = "nomic-embed-text";
  readonly dim = 768; // nomic-embed-text default

  constructor(
    private readonly baseUrl: string = DEFAULT_BASE,
    defaultModel?: string
  ) {
    if (defaultModel) this.defaultModel = defaultModel;
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(60_000, request.signal);
    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.model ?? this.defaultModel,
          input: request.texts,
        }),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText);
        throw new ProviderError(
          kindFromStatus(res.status),
          this.id,
          `${res.status} ${detail.slice(0, 300)}`,
          { status: res.status }
        );
      }
      const json = (await res.json()) as { embeddings?: number[][] };
      const vectors = json.embeddings ?? [];
      return {
        vectors,
        model: request.model ?? this.defaultModel,
        provider: this.id,
        dim: vectors[0]?.length ?? this.dim,
        usage: {
          promptTokens: Math.ceil(
            request.texts.reduce((s, t) => s + t.length, 0) / 4
          ),
          completionTokens: 0,
          totalTokens: Math.ceil(
            request.texts.reduce((s, t) => s + t.length, 0) / 4
          ),
          latencyMs: Date.now() - started,
          costMicros: 0,
        },
      };
    } catch (err) {
      throw toProviderError(err, this.id, "embed");
    } finally {
      cancel();
    }
  }
}

export function createOllamaProvider(
  creds: ProviderCredentials,
  defaults?: { model?: string }
): OllamaProvider {
  return new OllamaProvider(creds.baseUrl ?? process.env.OLLAMA_BASE_URL, defaults?.model);
}

export function createOllamaEmbeddings(
  creds: ProviderCredentials,
  defaults?: { model?: string }
): OllamaEmbeddings {
  return new OllamaEmbeddings(creds.baseUrl ?? process.env.OLLAMA_BASE_URL, defaults?.model);
}

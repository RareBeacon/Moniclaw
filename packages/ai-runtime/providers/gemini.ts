import { ProviderError, kindFromStatus, toProviderError } from "../errors";
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ProviderHealth,
  StreamEvent,
  ToolCallRequest,
  UsageStats,
} from "../types";
import { deadlineSignal, parseSse } from "./sse";
import type {
  ChatProvider,
  EmbeddingProvider,
  ProviderCredentials,
} from "./provider";

/**
 * Google Gemini adapter — generativelanguage v1beta REST.
 * Ships first because Gemini is the free-first default provider and the
 * embedding backbone (text-embedding-004 → 768 dims, our vector contract).
 */

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 60_000;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

type GeminiRole = "user" | "model";
interface GeminiContent {
  role: GeminiRole;
  parts: GeminiPart[];
}

function toGeminiContents(messages: ChatMessage[]): {
  contents: GeminiContent[];
  system?: string;
} {
  let system: string | undefined;
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === "tool" && m.toolResults?.length) {
      contents.push({
        role: "user",
        parts: m.toolResults.map((r) => ({
          functionResponse: {
            name: r.name,
            response: { result: r.content, isError: r.isError ?? false },
          },
        })),
      });
      continue;
    }
    if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: c.name, args: c.arguments } });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    contents.push({ role: "user", parts: [{ text: m.content }] });
  }
  return { contents, system };
}

function mapToolCalls(parts: GeminiPart[] | undefined, usage: { n: number }): ToolCallRequest[] {
  if (!parts?.length) return [];
  return parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      id: `gemini_${usage.n++}`,
      name: p.functionCall!.name,
      arguments: p.functionCall!.args ?? {},
    }));
}

interface GeminiUsageMeta {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

function usageOf(meta: GeminiUsageMeta | undefined, latencyMs: number): UsageStats {
  const promptTokens = meta?.promptTokenCount ?? 0;
  const completionTokens = meta?.candidatesTokenCount ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: meta?.totalTokenCount ?? promptTokens + completionTokens,
    latencyMs,
    costMicros: 0,
  };
}

export class GeminiProvider implements ChatProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini";
  readonly supportsTools = true;
  readonly supportsJsonMode = true;
  readonly supportsStreaming = true;
  readonly defaultModel: string = "gemini-2.5-flash";

  constructor(
    private readonly apiKey: string,
    defaultModel?: string,
    private readonly root: string = API_ROOT
  ) {
    if (defaultModel) this.defaultModel = defaultModel;
  }

  private buildBody(request: ChatRequest) {
    const { contents, system } = toGeminiContents(request.messages);
    const body: Record<string, unknown> = { contents };
    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens;
    if (request.stopSequences?.length) generationConfig.stopSequences = request.stopSequences;
    if (request.jsonMode) {
      generationConfig.responseMimeType = "application/json";
      if (typeof request.jsonMode === "object") {
        generationConfig.responseSchema = request.jsonMode;
      }
    }
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (request.tools?.length) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    return body;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const { signal, cancel } = deadlineSignal(
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      request.signal
    );
    const model = request.model ?? this.defaultModel;
    try {
      const res = await fetch(
        `${this.root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildBody(request)),
          signal,
        }
      );
      if (!res.ok) throw await this.httpError(res);
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: GeminiPart[] };
          finishReason?: string;
        }>;
        usageMetadata?: GeminiUsageMeta;
      };
      const candidate = json.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const callCounter = { n: 0 };
      const toolCalls = mapToolCalls(parts, callCounter);
      const text = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join("");
      const latencyMs = Date.now() - started;
      const finish = (candidate?.finishReason ?? "STOP").toUpperCase();
      return {
        content: text,
        toolCalls,
        model,
        provider: this.id,
        usage: usageOf(json.usageMetadata, latencyMs),
        finishReason: toolCalls.length
          ? "tool_calls"
          : finish === "MAX_TOKENS"
            ? "length"
            : finish === "SAFETY"
              ? "content_filter"
              : "stop",
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
    const model = request.model ?? this.defaultModel;
    try {
      const res = await fetch(
        `${this.root}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.buildBody(request)),
          signal,
        }
      );
      if (!res.ok) throw await this.httpError(res);

      const callCounter = { n: 0 };
      const collected: GeminiPart[] = [];
      let usageMeta: GeminiUsageMeta | undefined;

      for await (const raw of parseSse(res, signal)) {
        let chunk: {
          candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
          usageMetadata?: GeminiUsageMeta;
        };
        try {
          chunk = JSON.parse(raw);
        } catch {
          continue;
        }
        if (chunk.usageMetadata) usageMeta = chunk.usageMetadata;
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.text) yield { type: "text_delta", text: part.text };
          if (part.functionCall) collected.push(part);
        }
      }

      const toolCalls = mapToolCalls(collected, callCounter);
      for (const toolCall of toolCalls) yield { type: "tool_call", toolCall };
      yield {
        type: "usage",
        usage: usageOf(usageMeta, Date.now() - started),
        model,
        provider: this.id,
      };
      yield { type: "done", finishReason: toolCalls.length ? "tool_calls" : "stop" };
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
    const { signal, cancel } = deadlineSignal(10_000);
    try {
      const res = await fetch(
        `${this.root}/models?key=${encodeURIComponent(this.apiKey)}&pageSize=1`,
        { signal }
      );
      if (!res.ok) throw await this.httpError(res);
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

  private async httpError(res: Response): Promise<ProviderError> {
    let detail = "";
    try {
      const body = await res.json();
      detail =
        (body as { error?: { message?: string } })?.error?.message ??
        JSON.stringify(body).slice(0, 300);
    } catch {
      detail = res.statusText;
    }
    return new ProviderError(kindFromStatus(res.status), this.id, `${res.status} ${detail}`, {
      status: res.status,
    });
  }
}

export class GeminiEmbeddings implements EmbeddingProvider {
  readonly id = "gemini";
  readonly defaultModel: string = "text-embedding-004";
  readonly dim = 768;

  constructor(
    private readonly apiKey: string,
    defaultModel?: string,
    private readonly root: string = API_ROOT
  ) {
    if (defaultModel) this.defaultModel = defaultModel;
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const started = Date.now();
    const model = request.model ?? this.defaultModel;
    const { signal, cancel } = deadlineSignal(30_000, request.signal);
    try {
      // batchEmbedContents handles up to 100 entries per call.
      const batches: string[][] = [];
      for (let i = 0; i < request.texts.length; i += 100) {
        batches.push(request.texts.slice(i, i + 100));
      }
      const vectors: number[][] = [];
      for (const batch of batches) {
        const res = await fetch(
          `${this.root}/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: batch.map((text) => ({
                model: `models/${model}`,
                content: { parts: [{ text }] },
                taskType: request.taskType ?? "RETRIEVAL_DOCUMENT",
              })),
            }),
            signal,
          }
        );
        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new ProviderError(
            kindFromStatus(res.status),
            this.id,
            `${res.status} ${body.slice(0, 300)}`,
            { status: res.status }
          );
        }
        const json = (await res.json()) as {
          embeddings?: Array<{ values?: number[] }>;
        };
        for (const e of json.embeddings ?? []) {
          vectors.push(e.values ?? []);
        }
      }
      const totalTokens = Math.ceil(
        request.texts.reduce((sum, t) => sum + t.length, 0) / 4
      );
      return {
        vectors,
        model,
        provider: this.id,
        dim: vectors[0]?.length ?? this.dim,
        usage: {
          promptTokens: totalTokens,
          completionTokens: 0,
          totalTokens,
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

export function createGeminiProvider(
  creds: ProviderCredentials,
  defaults?: { model?: string }
): GeminiProvider {
  if (!creds.apiKey) {
    throw new ProviderError("auth", "gemini", "Gemini requires an API key (free at aistudio.google.com)");
  }
  return new GeminiProvider(creds.apiKey, defaults?.model, creds.baseUrl);
}

export function createGeminiEmbeddings(
  creds: ProviderCredentials,
  defaults?: { model?: string }
): GeminiEmbeddings {
  if (!creds.apiKey) {
    throw new ProviderError("auth", "gemini", "Gemini embeddings require an API key");
  }
  return new GeminiEmbeddings(creds.apiKey, defaults?.model, creds.baseUrl);
}

/**
 * MoniClaw TypeScript SDK — typed client for the REST API.
 *
 * Zero dependencies (fetch-based, Node 18+/browsers). Designed to be the
 * ONLY client surface SDK consumers need; endpoints map 1:1 to /api/ai/*,
 * keeping the SDK thin and the wire contract honest.
 *
 *   import { MoniClawClient } from "@moniclaw/sdk";
 *   const client = new MoniClawClient({ apiKey: process.env.MONICLAW_API_KEY! });
 *   const { data } = await client.chat.complete({ message: "Summarize Q2 risk." });
 */

import { SalesClient } from "./sales";

export interface MoniClawClientOptions {
  /** Base URL of the deployment (no trailing slash). */
  baseUrl?: string;
  /** Bearer API key — create under Dashboard → API Keys. */
  apiKey: string;
  /** Request timeout (default 60s; chat streaming uses 120s). */
  timeoutMs?: number;
  /** Extra headers (e.g. correlation ids). */
  headers?: Record<string, string>;
}

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
  attempts?: unknown;
}

export class MoniClawApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "MoniClawApiError";
  }
}

type Json = Record<string, unknown>;

export class MoniClawClient {
  readonly chat: ChatClient;
  readonly memory: MemoryClient;
  readonly knowledge: KnowledgeClient;
  readonly embeddings: EmbeddingsClient;
  readonly providers: ProvidersClient;
  readonly workflows: WorkflowsClient;
  readonly usage: UsageClient;
  readonly sales: SalesClient;

  readonly baseUrl: string;
  readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: MoniClawClientOptions) {
    this.baseUrl = (options.baseUrl ?? "https://moniclaw.vercel.app").replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.extraHeaders = options.headers ?? {};
    this.chat = new ChatClient(this);
    this.memory = new MemoryClient(this);
    this.knowledge = new KnowledgeClient(this);
    this.embeddings = new EmbeddingsClient(this);
    this.providers = new ProvidersClient(this);
    this.workflows = new WorkflowsClient(this);
    this.usage = new UsageClient(this);
    this.sales = new SalesClient(this);
  }

  /** Internal transport — exported for advanced/raw calls. */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: { timeoutMs?: number; query?: Record<string, string | number | undefined> }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(init?.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), init?.timeoutMs ?? this.timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...this.extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const envelope = (await res.json().catch(() => null)) as Envelope<T> | null;
      if (!res.ok || !envelope?.ok) {
        throw new MoniClawApiError(
          res.status,
          envelope?.error ?? "http_error",
          envelope?.message ?? `HTTP ${res.status}`,
          envelope?.attempts
        );
      }
      return envelope.data as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────

export interface ChatMessageInput {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatCompleteInput {
  message?: string;
  messages?: ChatMessageInput[];
  conversationId?: string;
  model?: string;
  provider?: string;
  system?: string;
  jsonMode?: boolean | Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  title?: string;
}

export interface ChatCompleteResult {
  conversationId: string | null;
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  model: string;
  provider: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    costMicros: number;
  };
}

export type ChatStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }
  | { type: "usage"; usage: ChatCompleteResult["usage"]; model: string; provider: string }
  | { type: "done"; finishReason: string }
  | { type: "error"; error: { kind: string; message: string } };

class ChatClient {
  constructor(private readonly client: MoniClawClient) {}

  complete(input: ChatCompleteInput): Promise<ChatCompleteResult> {
    return this.client.request("POST", "/api/ai/chat", { ...input, stream: false });
  }

  /** Streaming chat — async iteration over normalized events. */
  async *stream(input: ChatCompleteInput): AsyncIterable<ChatStreamEvent> {
    // Raw fetch (SSE), kept inside the client for header reuse.
    const url = `${this.client.baseUrl}/api/ai/chat`;
    const apiKey = this.client.apiKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...input, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new MoniClawApiError(res.status, "http_error", text.slice(0, 300) || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              try {
                yield JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
              } catch {
                /* tolerate keep-alives */
              }
            }
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    } finally {
      clearTimeout(timer);
    }
  }

  listConversations() {
    return this.client.request<{ conversations: ConversationSummary[] }>("GET", "/api/ai/conversations");
  }

  createConversation(input?: { title?: string; agentId?: string }) {
    return this.client.request<{ conversation: { id: string; title: string } }>(
      "POST",
      "/api/ai/conversations",
      input ?? {}
    );
  }

  getConversation(id: string) {
    return this.client.request<{ conversation: ConversationDetail }>("GET", `/api/ai/conversations/${id}`);
  }

  deleteConversation(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/ai/conversations/${id}`);
  }
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Array<{
    id: string;
    role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
    content: string;
    model: string | null;
    provider: string | null;
    toolCalls: unknown;
    createdAt: string;
  }>;
}

// ── Memory ───────────────────────────────────────────────────────────────

export type MemoryScope = "CONVERSATION" | "WORKSPACE" | "AGENT" | "LONG_TERM";

export interface MemoryRecordDto {
  id: string;
  scope: MemoryScope;
  content: string;
  importance: number;
  tags: string[];
  conversationKey: string | null;
  expiresAt: string | null;
  createdAt: string;
  embedded: boolean;
}

class MemoryClient {
  constructor(private readonly client: MoniClawClient) {}

  list(filter?: { scope?: MemoryScope; conversationKey?: string; limit?: number }) {
    return this.client.request<{ records: MemoryRecordDto[] }>("GET", "/api/ai/memory", undefined, {
      query: {
        scope: filter?.scope,
        conversationKey: filter?.conversationKey,
        limit: filter?.limit,
      },
    });
  }

  store(input: {
    content: string;
    scope?: MemoryScope;
    agentId?: string;
    conversationKey?: string;
    importance?: number;
    tags?: string[];
    expiresInDays?: number;
    embed?: boolean;
  }) {
    return this.client.request<{ record: { id: string; scope: MemoryScope; embedded: boolean } }>(
      "POST",
      "/api/ai/memory",
      input
    );
  }

  search(input: { query: string; scopes?: MemoryScope[]; limit?: number }) {
    return this.client.request<{
      mode: "semantic" | "fallback";
      memories: Array<MemoryRecordDto & { score: number; similarity: number }>;
    }>("POST", "/api/ai/memory/search", input);
  }

  forget(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/ai/memory?id=${encodeURIComponent(id)}`);
  }
}

// ── Knowledge ────────────────────────────────────────────────────────────

export interface KnowledgeDocumentDto {
  id: string;
  title: string;
  filename?: string;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  chunkCount: number;
  checksum: string;
  createdAt?: string;
}

class KnowledgeClient {
  constructor(private readonly client: MoniClawClient) {}

  list() {
    return this.client.request<{ documents: KnowledgeDocumentDto[] }>("GET", "/api/ai/knowledge/documents");
  }

  /** Ingest a public web page by URL. */
  ingestUrl(url: string) {
    return this.client.request<{ document: KnowledgeDocumentDto }>("POST", "/api/ai/knowledge/documents", { url });
  }

  /** Ingest a file buffer (Node). */
  async upload(file: { name: string; type?: string; data: Blob | ArrayBuffer | Uint8Array }) {
    const form = new FormData();
    const blob =
      file.data instanceof Blob ? file.data : new Blob([file.data as BlobPart], { type: file.type });
    form.append("file", blob, file.name);
    const apiKey = this.client.apiKey;
    const baseUrl = this.client.baseUrl;
    const res = await fetch(`${baseUrl}/api/ai/knowledge/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const envelope = (await res.json()) as Envelope<{ document: KnowledgeDocumentDto }>;
    if (!res.ok || !envelope.ok) {
      throw new MoniClawApiError(res.status, envelope.error ?? "http_error", envelope.message ?? `HTTP ${res.status}`);
    }
    return envelope.data!;
  }

  search(query: string, limit?: number) {
    return this.client.request<{
      results: Array<{ citation: string; similarity: number; content: string; documentId: string; chunkId: string }>;
      empty: boolean;
    }>("POST", "/api/ai/knowledge/search", { query, limit });
  }

  getChunks(documentId: string) {
    return this.client.request<{ chunks: Array<{ id: string; index: number; content: string; tokenCount: number }> }>(
      "GET",
      `/api/ai/knowledge/documents/${documentId}`
    );
  }

  deleteDocument(documentId: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/ai/knowledge/documents/${documentId}`);
  }
}

// ── Embeddings ───────────────────────────────────────────────────────────

class EmbeddingsClient {
  constructor(private readonly client: MoniClawClient) {}

  generate(texts: string[], options?: { model?: string; taskType?: string }) {
    return this.client.request<{
      vectors: number[][];
      dim: number;
      model: string;
      provider: string;
    }>("POST", "/api/ai/embeddings", { texts, ...options });
  }
}

// ── Providers ────────────────────────────────────────────────────────────

class ProvidersClient {
  constructor(private readonly client: MoniClawClient) {}

  list() {
    return this.client.request<{
      catalog: Array<{ id: string; label: string; freeTier: boolean; status: string }>;
      configs: Array<{
        id: string;
        provider: string;
        label: string;
        enabled: boolean;
        priority: number;
        healthStatus: string | null;
        keyMask: string | null;
      }>;
    }>("GET", "/api/ai/providers");
  }

  test(configId: string) {
    return this.client.request<{ ok: boolean; latencyMs: number; error?: string }>(
      "POST",
      "/api/ai/providers/test",
      { configId }
    );
  }
}

// ── Workflows ────────────────────────────────────────────────────────────

class WorkflowsClient {
  constructor(private readonly client: MoniClawClient) {}

  list() {
    return this.client.request<{
      workflows: Array<{ id: string; name: string; status: string; version: number; nodeCount: number }>;
    }>("GET", "/api/ai/workflows");
  }

  create(input: { name: string; description?: string; definition: Json }) {
    return this.client.request<{ workflow: { id: string; name: string; status: string } }>(
      "POST",
      "/api/ai/workflows",
      input
    );
  }

  execute(id: string, input: Record<string, unknown> = {}) {
    return this.client.request<{
      runId: string;
      status: "SUCCEEDED" | "FAILED";
      output: string | null;
      trace: Array<{ nodeId: string; type: string; status: string; output?: unknown; error?: string }>;
      latencyMs: number;
    }>("POST", `/api/ai/workflows/${id}/execute`, { input }, { timeoutMs: 120_000 });
  }
}

// ── Usage ────────────────────────────────────────────────────────────────

class UsageClient {
  constructor(private readonly client: MoniClawClient) {}

  summarize(days = 30) {
    return this.client.request<{
      requests: number;
      okRate: number;
      totalTokens: number;
      costUsd: number;
      toolCalls: number;
      avgLatencyMs: number;
      byProvider: Array<{ provider: string; requests: number; totalTokens: number; costUsd: number }>;
      byModel: Array<{ model: string; requests: number; totalTokens: number }>;
      daily: Array<{ day: string; tokens: number; requests: number }>;
      topErrors: Array<{ code: string; count: number }>;
    }>("GET", "/api/ai/usage", undefined, { query: { days } });
  }
}

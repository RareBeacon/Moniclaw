import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  ProviderError,
  toProviderError,
} from "../errors";
import {
  FREE_FIRST_ORDER,
  createChatProvider,
  createEmbeddingProvider,
  type ProviderId,
} from "../providers/registry";
import type { ChatProvider, EmbeddingProvider } from "../providers/provider";
import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  StreamEvent,
  UsageStats,
} from "../types";

/**
 * Provider-agnostic model router.
 *
 * Responsibilities: ordered candidate resolution (workspace BYOK first,
 * free-first default order), per-attempt timeouts, bounded retries with
 * exponential backoff + jitter for transient failures, automatic fail-over
 * to the next provider, cancellation propagation, and usage accounting on
 * BOTH success and failure paths.
 *
 * The router depends on Ports (interfaces), not on Prisma — the app layer
 * supplies the implementations (Dependency Inversion).
 */

// ── Ports (injected) ─────────────────────────────────────────────────────

export interface ResolvedProviderConfig {
  configId: string | null; // null for synthetic (env fallback / default)
  provider: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  priority: number;
  source: "workspace" | "env" | "synthetic";
}

export interface ProviderConfigSource {
  /** Enabled configs for the workspace, ascending priority. */
  resolve(workspaceId: string): Promise<ResolvedProviderConfig[]>;
  /** Persist health probe outcome (no-op for env/synthetic). */
  markHealth(configId: string | null, ok: boolean, error?: string): Promise<void>;
}

export interface UsageSink {
  record(event: {
    workspaceId: string;
    userId?: string | null;
    kind: "CHAT" | "EMBEDDING" | "TOOL" | "WORKFLOW";
    status: "OK" | "ERROR";
    provider: string;
    model: string;
    usage?: Partial<UsageStats>;
    toolCallCount?: number;
    errorCode?: string;
  }): Promise<void>;
}

// ── Router ───────────────────────────────────────────────────────────────

export interface RouterOptions {
  maxAttemptsPerProvider?: number; // default 2
  baseBackoffMs?: number; // default 400
  attemptTimeoutMs?: number; // default 60_000
  cacheProviders?: boolean; // default true (per-process adapter cache)
  /**
   * Override adapter construction (tests, custom in-house adapters).
   * When set, the provider registry is bypassed for chat / embeddings.
   */
  chatAdapterFactory?: (cfg: ResolvedProviderConfig) => ChatProvider;
  embedAdapterFactory?: (cfg: ResolvedProviderConfig) => EmbeddingProvider;
}

export interface RoutedRequestContext {
  workspaceId: string;
  userId?: string | null;
  requestId?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ModelRouter {
  private readonly adapterCache = new Map<string, ChatProvider>();
  private readonly embedderCache = new Map<string, EmbeddingProvider>();

  constructor(
    private readonly source: ProviderConfigSource,
    private readonly usage: UsageSink,
    private readonly options: RouterOptions = {}
  ) {}

  private get maxAttempts() {
    return this.options.maxAttemptsPerProvider ?? 2;
  }
  private get baseBackoff() {
    return this.options.baseBackoffMs ?? 400;
  }
  private get attemptTimeout() {
    return this.options.attemptTimeoutMs ?? 60_000;
  }

  /** Ordered candidate chain: workspace BYOK → env fallbacks → (none). */
  private async candidates(ctx: RoutedRequestContext): Promise<ResolvedProviderConfig[]> {
    const workspaceConfigs = await this.source.resolve(ctx.workspaceId);
    if (workspaceConfigs.length) return workspaceConfigs;
    return [];
  }

  /** Instantiate (or fetch cached) a chat adapter for a resolved config. */
  private chatAdapter(cfg: ResolvedProviderConfig): ChatProvider {
    if (this.options.chatAdapterFactory) return this.options.chatAdapterFactory(cfg);
    const key = `${cfg.provider}:${cfg.apiKey ? cfg.apiKey.slice(-6) : ""}:${cfg.baseUrl ?? ""}:${cfg.defaultModel ?? ""}`;
    const cached = this.adapterCache.get(key);
    if (cached && this.options.cacheProviders !== false) return cached;
    const adapter = createChatProvider(
      cfg.provider,
      { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl },
      { model: cfg.defaultModel }
    );
    this.adapterCache.set(key, adapter);
    return adapter;
  }

  private embedAdapter(cfg: ResolvedProviderConfig): EmbeddingProvider {
    if (this.options.embedAdapterFactory) return this.options.embedAdapterFactory(cfg);
    const key = `embed:${cfg.provider}:${cfg.apiKey ? cfg.apiKey.slice(-6) : ""}:${cfg.baseUrl ?? ""}:${cfg.defaultModel ?? ""}`;
    const cached = this.embedderCache.get(key);
    if (cached && this.options.cacheProviders !== false) return cached;
    const adapter = createEmbeddingProvider(
      cfg.provider,
      { apiKey: cfg.apiKey, baseUrl: cfg.baseUrl },
      { model: cfg.defaultModel }
    );
    this.embedderCache.set(key, adapter);
    return adapter;
  }

  /** Buffered chat with retries + failover. */
  async chat(ctx: RoutedRequestContext, request: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const candidates = await this.candidates(ctx);
    if (!candidates.length) throw new NoProviderConfiguredError(ctx.workspaceId);

    const attempts: Array<{ provider: string; kind: ProviderError["kind"]; message: string }> = [];
    const ordered = request.provider
      ? candidates.filter((c) => c.provider === request.provider)
      : candidates;
    if (!ordered.length) throw new NoProviderConfiguredError(ctx.workspaceId);

    for (const cfg of ordered) {
      let adapter: ChatProvider;
      try {
        adapter = this.chatAdapter(cfg);
      } catch (err) {
        const e = toProviderError(err, cfg.provider, "configure");
        attempts.push({ provider: cfg.provider, kind: e.kind, message: e.message });
        continue; // next provider
      }

      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        try {
          const response = await adapter.chat({
            ...request,
            timeoutMs: request.timeoutMs ?? this.attemptTimeout,
          });
          response.attempt = attempts.length + attempt;
          await this.usage.record({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            kind: "CHAT",
            status: "OK",
            provider: response.provider,
            model: response.model,
            usage: response.usage,
            toolCallCount: response.toolCalls.length,
          });
          await this.source.markHealth(cfg.configId, true);
          return response;
        } catch (err) {
          const error = toProviderError(err, cfg.provider, "chat");
          if (request.signal?.aborted) throw error; // caller cancelled — stop
          attempts.push({ provider: cfg.provider, kind: error.kind, message: error.message });
          await this.logFailure(ctx, cfg, request, error, Date.now() - started);
          if (!error.retryable) break; // auth/model/invalid → next provider
          if (attempt < this.maxAttempts) {
            await sleep(this.baseBackoff * 2 ** (attempt - 1) + Math.random() * 120);
          }
        }
      }
    }

    throw new AllProvidersFailedError(attempts);
  }

  /**
   * Streaming chat. Retries happen ONLY before the first byte: once tokens
   * are flowing, the stream is committed to that provider (standard
   * enterprise behavior — partial output must not be restarted blindly).
   */
  async *streamChat(
    ctx: RoutedRequestContext,
    request: ChatRequest
  ): AsyncIterable<StreamEvent> {
    const candidates = await this.candidates(ctx);
    if (!candidates.length) throw new NoProviderConfiguredError(ctx.workspaceId);
    const ordered = request.provider
      ? candidates.filter((c) => c.provider === request.provider)
      : candidates;
    if (!ordered.length) throw new NoProviderConfiguredError(ctx.workspaceId);

    const attempts: Array<{ provider: string; kind: ProviderError["kind"]; message: string }> = [];
    const started = Date.now();

    for (const cfg of ordered) {
      let adapter: ChatProvider;
      try {
        adapter = this.chatAdapter(cfg);
      } catch (err) {
        const e = toProviderError(err, cfg.provider, "configure");
        attempts.push({ provider: cfg.provider, kind: e.kind, message: e.message });
        continue;
      }
      try {
        let committed = false;
        let toolCallCount = 0;
        let finalUsage: UsageStats | null = null;
        let finalModel = request.model ?? cfg.defaultModel ?? adapter.defaultModel;

        for await (const event of adapter.streamChat({
          ...request,
          timeoutMs: request.timeoutMs ?? this.attemptTimeout,
        })) {
          if (event.type === "text_delta" || event.type === "tool_call") committed = true;
          if (event.type === "tool_call") toolCallCount++;
          if (event.type === "usage") {
            finalUsage = event.usage;
            finalModel = event.model;
          }
          yield event;
        }

        await this.usage.record({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          kind: "CHAT",
          status: "OK",
          provider: cfg.provider,
          model: finalModel,
          usage: finalUsage ?? { latencyMs: Date.now() - started },
          toolCallCount,
        });
        await this.source.markHealth(cfg.configId, true);
        void committed; // committed-ness governs retry (below) on error paths
        return;
      } catch (err) {
        const error = toProviderError(err, cfg.provider, "stream");
        if (request.signal?.aborted) throw error;
        attempts.push({ provider: cfg.provider, kind: error.kind, message: error.message });
        await this.logFailure(ctx, cfg, request, error, Date.now() - started);
        // Stream already yielded partial output? Do NOT restart silently —
        // surface the failure and let the caller decide.
        break;
      }
    }

    throw new AllProvidersFailedError(attempts);
  }

  /** Embeddings with the same retry/failover policy (fewer attempts). */
  async embed(ctx: RoutedRequestContext, request: EmbedRequest): Promise<EmbedResponse> {
    const started = Date.now();
    const candidates = (await this.candidates(ctx)).filter(
      (c) => c.provider === "gemini" || c.provider === "ollama"
    );
    if (!candidates.length) {
      throw new NoProviderConfiguredError(
        `${ctx.workspaceId} (needs Gemini or Ollama for embeddings)`
      );
    }

    const attempts: Array<{ provider: string; kind: ProviderError["kind"]; message: string }> = [];
    for (const cfg of candidates) {
      for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
        try {
          const adapter = this.embedAdapter(cfg);
          const response = await adapter.embed(request);
          await this.usage.record({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            kind: "EMBEDDING",
            status: "OK",
            provider: response.provider,
            model: response.model,
            usage: response.usage,
          });
          await this.source.markHealth(cfg.configId, true);
          return response;
        } catch (err) {
          const error = toProviderError(err, cfg.provider, "embed");
          if (request.signal?.aborted) throw error;
          attempts.push({ provider: cfg.provider, kind: error.kind, message: error.message });
          await this.usage.record({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            kind: "EMBEDDING",
            status: "ERROR",
            provider: cfg.provider,
            model: request.model ?? cfg.defaultModel ?? "unknown",
            usage: { latencyMs: Date.now() - started },
            errorCode: error.kind,
          });
          if (!error.retryable) break;
          if (attempt < this.maxAttempts) {
            await sleep(this.baseBackoff * 2 ** (attempt - 1) + Math.random() * 80);
          }
        }
      }
    }
    throw new AllProvidersFailedError(attempts);
  }

  /** Probe every enabled config and persist health. */
  async healthCheckAll(
    ctx: RoutedRequestContext
  ): Promise<Array<{ provider: string; ok: boolean; latencyMs: number; error?: string }>> {
    const candidates = await this.candidates(ctx);
    const results = await Promise.all(
      candidates.map(async (cfg) => {
        try {
          const adapter = this.chatAdapter(cfg);
          const health = await adapter.healthCheck();
          await this.source.markHealth(cfg.configId, health.ok, health.error);
          return { provider: cfg.provider, ...health };
        } catch (err) {
          const e = toProviderError(err, cfg.provider, "health");
          await this.source.markHealth(cfg.configId, false, e.message);
          return { provider: cfg.provider, ok: false, latencyMs: 0, error: e.message };
        }
      })
    );
    return results;
  }

  private async logFailure(
    ctx: RoutedRequestContext,
    cfg: ResolvedProviderConfig,
    request: ChatRequest,
    error: ProviderError,
    latencyMs: number
  ) {
    await this.usage.record({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      kind: "CHAT",
      status: "ERROR",
      provider: cfg.provider,
      model: request.model ?? cfg.defaultModel ?? "unknown",
      usage: { latencyMs },
      errorCode: error.kind,
    });
    await this.source.markHealth(cfg.configId, false, `${error.kind}: ${error.message}`);
  }
}

/** Default free-first chain when a workspace has no BYOK configs yet —
 * used by config UIs to explain routing, and by tests. */
export function defaultFreeFirstChain(): ProviderId[] {
  return [...FREE_FIRST_ORDER];
}

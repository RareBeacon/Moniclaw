import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RATE_LIMIT_REST_DEFAULT_S,
  RATE_LIMIT_REST_MAX_S,
  RATE_LIMIT_REST_MIN_S,
  isRateLimited,
  rateLimitAlertCopy,
  rateLimitDedupKey,
  rateLimitRestUntil,
  withoutRestedKeys,
  RATE_LIMIT_HREF,
} from "../lib/ai/key-rotation";
import {
  ModelRouter,
  type ProviderConfigSource,
  type ResolvedProviderConfig,
  type UsageSink,
} from "../packages/ai-runtime/model-router/router";
import { ProviderError } from "../packages/ai-runtime/errors";
import type { ChatProvider } from "../packages/ai-runtime/providers/provider";
import type { ChatResponse } from "../packages/ai-runtime/types";

// ── Pure helpers ─────────────────────────────────────────────────────────

test("restUntil defaults to one hour with no provider hint", () => {
  const now = new Date("2026-08-02T06:00:00Z");
  const until = rateLimitRestUntil(now, null);
  assert.equal(until.getTime() - now.getTime(), RATE_LIMIT_REST_DEFAULT_S * 1000);
});

test("restUntil honors the provider's Retry-After hint", () => {
  const now = new Date("2026-08-02T06:00:00Z");
  const until = rateLimitRestUntil(now, 900);
  assert.equal(until.getTime() - now.getTime(), 900_000);
});

test("restUntil clamps absurd hints into [1min, 1day]", () => {
  const now = new Date("2026-08-02T06:00:00Z");
  assert.equal(
    rateLimitRestUntil(now, 2).getTime() - now.getTime(),
    RATE_LIMIT_REST_MIN_S * 1000
  );
  assert.equal(
    rateLimitRestUntil(now, 10_000_000).getTime() - now.getTime(),
    RATE_LIMIT_REST_MAX_S * 1000
  );
  assert.equal(
    rateLimitRestUntil(now, Number.NaN).getTime() - now.getTime(),
    RATE_LIMIT_REST_DEFAULT_S * 1000
  );
});

test("isRateLimited: null and expired markers are usable, future markers rest", () => {
  const now = new Date("2026-08-02T06:00:00Z");
  assert.equal(isRateLimited({ rateLimitedUntil: null }, now), false);
  assert.equal(
    isRateLimited({ rateLimitedUntil: new Date(now.getTime() - 1000) }, now),
    false
  );
  assert.equal(
    isRateLimited({ rateLimitedUntil: new Date(now.getTime() + 1000) }, now),
    true
  );
});

test("withoutRestedKeys drops only resting keys and preserves priority order", () => {
  const now = new Date("2026-08-02T06:00:00Z");
  const a = { id: "a", rateLimitedUntil: null as Date | null };
  const b = { id: "b", rateLimitedUntil: new Date(now.getTime() + 60_000) };
  const c = { id: "c", rateLimitedUntil: new Date(now.getTime() - 60_000) };
  const d = { id: "d", rateLimitedUntil: null };
  assert.deepEqual(
    withoutRestedKeys([a, b, c, d], now).map((r) => r.id),
    ["a", "c", "d"]
  );
});

test("dedup key is per-config; alert copy names the key, provider, and rest window", () => {
  assert.notEqual(rateLimitDedupKey("cfg-1"), rateLimitDedupKey("cfg-2"));
  const until = new Date("2026-08-02T07:00:00Z");
  const copy = rateLimitAlertCopy({ label: "OpenRouter #2", provider: "OPENROUTER" }, until);
  assert.equal(copy.kind, "ai.provider.rate_limited");
  assert.ok(copy.title.includes("OpenRouter #2"));
  assert.ok(copy.body.includes("openrouter"));
  assert.ok(copy.body.includes(until.toISOString()));
  assert.equal(copy.href, RATE_LIMIT_HREF);
});

// ── Router behavior (multi-key failover + hook) ──────────────────────────

class FakeProvider implements ChatProvider {
  readonly label = "Fake";
  readonly defaultModel = "fake-1";
  readonly supportsTools = true;
  readonly supportsJsonMode = true;
  readonly supportsStreaming = true;
  calls = 0;
  constructor(
    readonly id: string,
    private readonly behavior: () => Promise<ChatResponse>
  ) {}
  async chat(): Promise<ChatResponse> {
    this.calls += 1;
    return this.behavior();
  }
  async *streamChat() {
    yield { type: "text_delta" as const, text: "hi" };
    yield { type: "done" as const, finishReason: "stop" as const };
  }
  async healthCheck() {
    return { ok: true, latencyMs: 1 };
  }
}

function okResponse(provider: string): ChatResponse {
  return {
    content: `ok from ${provider}`,
    toolCalls: [],
    model: "fake-1",
    provider,
    usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6, latencyMs: 1, costMicros: 0 },
    finishReason: "stop",
    attempt: 1,
  };
}

test("a 429'd key hands off to the next key of the SAME provider and the source is told to rest it", async () => {
  const limited: Array<{ configId: string | null; retryAfterSeconds: number | null }> = [];
  const configs: ResolvedProviderConfig[] = [
    { configId: "cfg-key-A", provider: "openrouter", apiKey: "sk-a", priority: 1, source: "workspace" },
    { configId: "cfg-key-B", provider: "openrouter", apiKey: "sk-b", priority: 2, source: "workspace" },
  ];
  const source: ProviderConfigSource = {
    async resolve() {
      return configs;
    },
    async markHealth() {},
    async markRateLimited(configId, retryAfterSeconds) {
      limited.push({ configId, retryAfterSeconds });
    },
  };
  const events: unknown[] = [];
  const sink: UsageSink = {
    async record(event) {
      events.push(event);
    },
  };
  const keyA = new FakeProvider("openrouter", async () => {
    throw new ProviderError("rate_limit", "openrouter", "429 quota exceeded", {
      status: 429,
      retryAfterSeconds: 120,
    });
  });
  const keyB = new FakeProvider("openrouter", async () => okResponse("openrouter"));

  const router = new ModelRouter(source, sink, {
    baseBackoffMs: 1,
    maxAttemptsPerProvider: 2,
    chatAdapterFactory: (c) => (c.configId === "cfg-key-A" ? keyA : keyB),
  });

  const res = await router.chat(
    { workspaceId: "w-1", userId: "u-1" },
    { messages: [{ role: "user", content: "hello" }] }
  );

  assert.equal(res.content, "ok from openrouter");
  assert.equal(keyB.calls, 1, "second key served");
  assert.ok(keyA.calls >= 1, "first key attempted");
  assert.deepEqual(limited, [
    { configId: "cfg-key-A", retryAfterSeconds: 120 },
    // one logFailure per rate-limit attempt (same-key retry semantics)
    { configId: "cfg-key-A", retryAfterSeconds: 120 },
  ]);
});

test("sources WITHOUT the hook keep working (backward compatible port)", async () => {
  const source: ProviderConfigSource = {
    async resolve() {
      return [{ configId: "cfg-1", provider: "openrouter", apiKey: "k", priority: 1, source: "workspace" }];
    },
    async markHealth() {},
    // no markRateLimited — optional port
  };
  const sink: UsageSink = { async record() {} };
  const alwaysLimited = new FakeProvider("openrouter", async () => {
    throw new ProviderError("rate_limit", "openrouter", "429");
  });
  const router = new ModelRouter(source, sink, {
    baseBackoffMs: 1,
    maxAttemptsPerProvider: 2,
    chatAdapterFactory: () => alwaysLimited,
  });
  await assert.rejects(
    router.chat({ workspaceId: "w" }, { messages: [{ role: "user", content: "hi" }] }),
    /All AI providers failed|rate_limit/
  );
});

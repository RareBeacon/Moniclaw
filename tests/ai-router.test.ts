import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ModelRouter,
  type ProviderConfigSource,
  type ResolvedProviderConfig,
  type UsageSink,
} from "../packages/ai-runtime/model-router/router";
import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  ProviderError,
} from "../packages/ai-runtime/errors";
import type { ChatProvider } from "../packages/ai-runtime/providers/provider";
import type { ChatResponse, UsageStats } from "../packages/ai-runtime/types";

// ── Test doubles ─────────────────────────────────────────────────────────

class FakeProvider implements ChatProvider {
  readonly id: string;
  readonly label = "Fake";
  readonly defaultModel = "fake-1";
  readonly supportsTools = true;
  readonly supportsJsonMode = true;
  readonly supportsStreaming = true;
  calls = 0;

  constructor(
    id: string,
    private readonly behavior: (call: number) => Promise<ChatResponse>
  ) {
    this.id = id;
  }

  async chat(): Promise<ChatResponse> {
    this.calls += 1;
    return this.behavior(this.calls);
  }

  async *streamChat() {
    yield { type: "text_delta" as const, text: "hi" };
    yield { type: "done" as const, finishReason: "stop" as const };
  }

  async healthCheck() {
    return { ok: true, latencyMs: 1 };
  }
}

const USAGE: UsageStats = {
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  latencyMs: 3,
  costMicros: 0,
};

function successResponse(provider: string): ChatResponse {
  return {
    content: `ok from ${provider}`,
    toolCalls: [],
    model: "fake-1",
    provider,
    usage: USAGE,
    finishReason: "stop",
    attempt: 1,
  };
}

function makeSource(configs: ResolvedProviderConfig[]): ProviderConfigSource & {
  health: Array<{ configId: string | null; ok: boolean }>;
} {
  const health: Array<{ configId: string | null; ok: boolean }> = [];
  return {
    health,
    async resolve() {
      return configs;
    },
    async markHealth(configId, ok) {
      health.push({ configId, ok });
    },
  };
}

function makeUsage() {
  const events: Array<{ kind: string; status: string; provider: string; errorCode?: string }> = [];
  const sink: UsageSink = {
    async record(event) {
      events.push({
        kind: event.kind,
        status: event.status,
        provider: event.provider,
        errorCode: event.errorCode,
      });
    },
  };
  return { events, sink };
}

function cfg(provider: ResolvedProviderConfig["provider"], priority = 1): ResolvedProviderConfig {
  return {
    configId: `${provider}-cfg`,
    provider,
    apiKey: "key",
    priority,
    source: "workspace",
  };
}

const CTX = { workspaceId: "w-test", userId: "u-test" };
const REQ = { messages: [{ role: "user" as const, content: "hello" }] };

function routerFor(
  source: ProviderConfigSource,
  sink: UsageSink,
  factories: Record<string, FakeProvider>
) {
  return new ModelRouter(source, sink, {
    baseBackoffMs: 1, // keep the suite fast
    maxAttemptsPerProvider: 2,
    chatAdapterFactory: (c) => {
      const fake = factories[c.provider];
      if (!fake) throw new Error(`no fake for ${c.provider}`);
      return fake;
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

test("fails over to the next provider when the first one errors", async () => {
  const failing = new FakeProvider("gemini", async () => {
    throw new ProviderError("rate_limit", "gemini", "quota exhausted");
  });
  const healthy = new FakeProvider("openrouter", async () => successResponse("openrouter"));
  const source = makeSource([cfg("gemini", 1), cfg("openrouter", 2)]);
  const { events, sink } = makeUsage();

  const router = routerFor(source, sink, { gemini: failing, openrouter: healthy });
  const res = await router.chat(CTX, REQ);

  assert.equal(res.provider, "openrouter");
  assert.equal(res.content, "ok from openrouter");
  // gemini retried twice (retryable rate_limit), then openrouter succeeded on attempt 1.
  assert.equal(failing.calls, 2);
  assert.equal(healthy.calls, 1);
  assert.equal(res.attempt, 3);
  // Usage recorded for failures AND the success.
  assert.deepEqual(
    events.map((e) => e.status),
    ["ERROR", "ERROR", "OK"]
  );
  // Health probes: both gemini attempts marked unhealthy, then openrouter healthy.
  assert.deepEqual(source.health, [
    { configId: "gemini-cfg", ok: false },
    { configId: "gemini-cfg", ok: false },
    { configId: "openrouter-cfg", ok: true },
  ]);
});

test("non-retryable auth errors skip retries and move on immediately", async () => {
  const badKey = new FakeProvider("gemini", async () => {
    throw new ProviderError("auth", "gemini", "invalid api key");
  });
  const healthy = new FakeProvider("ollama", async () => successResponse("ollama"));
  const source = makeSource([cfg("gemini", 1), cfg("ollama", 2)]);
  const { sink } = makeUsage();

  const router = routerFor(source, sink, { gemini: badKey, ollama: healthy });
  const res = await router.chat(CTX, REQ);

  assert.equal(res.provider, "ollama");
  assert.equal(badKey.calls, 1); // zero retries on auth
});

test("throws NoProviderConfiguredError when nothing resolves", async () => {
  const source = makeSource([]);
  const { sink } = makeUsage();
  const router = routerFor(source, sink, {});
  await assert.rejects(() => router.chat(CTX, REQ), NoProviderConfiguredError);
});

test("throws AllProvidersFailedError with the attempt log when all fail", async () => {
  const a = new FakeProvider("gemini", async () => {
    throw new ProviderError("network", "gemini", "socket hangup");
  });
  const b = new FakeProvider("openrouter", async () => {
    throw new ProviderError("auth", "openrouter", "bad key");
  });
  const source = makeSource([cfg("gemini", 1), cfg("openrouter", 2)]);
  const { sink } = makeUsage();

  const router = routerFor(source, sink, { gemini: a, openrouter: b });
  const err = await router.chat(CTX, REQ).catch((e: unknown) => e);
  assert.ok(err instanceof AllProvidersFailedError);
  assert.equal(err.attempts.length, 3); // gemini×2 (retryable) + openrouter×1
  assert.equal(err.attempts[0]!.provider, "gemini");
  assert.equal(err.attempts[2]!.kind, "auth");
});

test("provider pinning restricts candidates to the named provider", async () => {
  const a = new FakeProvider("gemini", async () => successResponse("gemini"));
  const b = new FakeProvider("openrouter", async () => successResponse("openrouter"));
  const source = makeSource([cfg("gemini", 1), cfg("openrouter", 2)]);
  const { sink } = makeUsage();

  const router = routerFor(source, sink, { gemini: a, openrouter: b });
  const res = await router.chat(CTX, { ...REQ, provider: "openrouter" });
  assert.equal(res.provider, "openrouter");
  assert.equal(a.calls, 0);

  await assert.rejects(
    () => router.chat(CTX, { ...REQ, provider: "anthropic" }),
    NoProviderConfiguredError
  );
});

test("caller cancellation aborts immediately without further retries", async () => {
  const controller = new AbortController();
  const slow = new FakeProvider("gemini", async () => {
    controller.abort();
    throw new ProviderError("timeout", "gemini", "deadline");
  });
  const source = makeSource([cfg("gemini", 1), cfg("openrouter", 2)]);
  const second = new FakeProvider("openrouter", async () => successResponse("openrouter"));
  const { sink } = makeUsage();

  const router = routerFor(source, sink, { gemini: slow, openrouter: second });
  await assert.rejects(
    () => router.chat(CTX, { ...REQ, signal: controller.signal }),
    ProviderError
  );
  assert.equal(slow.calls, 1);
  assert.equal(second.calls, 0); // cancelled → never proceeded
});

test("streaming yields events and records usage once finished", async () => {
  const ok = new FakeProvider("gemini", async () => successResponse("gemini"));
  const source = makeSource([cfg("gemini", 1)]);
  const { events, sink } = makeUsage();
  const router = routerFor(source, sink, { gemini: ok });

  const seen: string[] = [];
  for await (const ev of router.streamChat(CTX, REQ)) seen.push(ev.type);
  assert.deepEqual(seen, ["text_delta", "done"]);
  assert.deepEqual(
    events.map((e) => [e.kind, e.status]),
    [["CHAT", "OK"]]
  );
});

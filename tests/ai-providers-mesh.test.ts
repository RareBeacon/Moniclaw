import test from "node:test";
import assert from "node:assert/strict";

import {
  PROVIDER_IDS,
  PROVIDER_IDS_UPPER,
  PROVIDER_CATALOG,
  FREE_FIRST_ORDER,
  createChatProvider,
  createEmbeddingProvider,
  envFallbackProviders,
  providerMeta,
  providerMetaUpper,
} from "../packages/ai-runtime/providers/registry";
import { AnthropicProvider } from "../packages/ai-runtime/providers/anthropic";
import { OpenAiCompatibleProvider } from "../packages/ai-runtime/providers/openai-compatible";
import { ProviderError } from "../packages/ai-runtime/errors";

/**
 * Phase 11 (AI gateway, v1) — the provider mesh: catalog integrity, adapter
 * wiring per vendor, custom-endpoint honesty, env fallback ordering, and the
 * real Anthropic wire format (mocked HTTP, no network).
 */

// ── catalog integrity ────────────────────────────────────────────────────

test("catalog exposes 11 shipped providers with sane metas", () => {
  assert.equal(PROVIDER_CATALOG.length, 11);
  assert.deepEqual([...PROVIDER_IDS], PROVIDER_CATALOG.map((p) => p.id));
  for (const meta of PROVIDER_CATALOG) {
    assert.equal(meta.status, "shipped", `${meta.id} must ship a real adapter`);
    if (meta.requiresKey && !meta.requiresBaseUrl) assert.ok(meta.keyUrl, `${meta.id} should hint where to get a key`);
    if (!meta.requiresBaseUrl && meta.id !== "custom") assert.ok(meta.defaultModel.length > 0, `${meta.id} needs a default model`);
  }
  assert.deepEqual(PROVIDER_IDS_UPPER, PROVIDER_IDS.map((i) => i.toUpperCase()));
  // Free-first: every free-tier KEY provider reachable via env appears in order.
  const freeEnvOrder = FREE_FIRST_ORDER.filter((id) => providerMeta(id).freeTier);
  assert.deepEqual(freeEnvOrder.slice(0, 4), ["gemini", "groq", "openrouter", "ollama"]);
  assert.equal(providerMetaUpper("GROQ").id, "groq");
  assert.equal(providerMetaUpper("CUSTOM").requiresBaseUrl, true);
});

test("every catalog id builds a chat adapter (keyed ones with credentials)", () => {
  for (const meta of PROVIDER_CATALOG) {
    const adapter = createChatProvider(meta.id, {
      apiKey: meta.requiresKey || meta.id === "custom" ? "sk-test" : undefined,
      baseUrl: meta.id === "custom" ? "https://example.test/v1" : undefined,
    }, meta.id === "custom" ? { model: "some-model" } : undefined);
    assert.ok(adapter, meta.id);
    assert.equal(typeof adapter.chat, "function");
    assert.equal(typeof adapter.healthCheck, "function");
  }
});

test("custom endpoint requires baseUrl AND model — honest ProviderError otherwise", () => {
  assert.throws(
    () => createChatProvider("custom", { apiKey: "k" }),
    (e) => e instanceof ProviderError && e.message.includes("Base URL")
  );
  assert.throws(
    () => createChatProvider("custom", { apiKey: "k", baseUrl: "https://x/v1" }),
    (e) => e instanceof ProviderError && e.message.includes("Default model")
  );
  const ok = createChatProvider("custom", { baseUrl: "https://x/v1" }, { model: "m" }) as OpenAiCompatibleProvider;
  assert.ok(ok instanceof OpenAiCompatibleProvider);
  assert.equal(ok.defaultModel, "m");
});

test("keyed providers refuse keyless construction with guidance", () => {
  for (const id of ["gemini", "openrouter", "openai", "anthropic", "deepseek", "mistral", "groq", "xai", "together"] as const) {
    assert.throws(() => createChatProvider(id, {}), ProviderError, id);
  }
});

test("embeddings stay honest: Gemini/Ollama only (768-dim contract)", () => {
  assert.ok(createEmbeddingProvider("gemini", { apiKey: "k" }));
  assert.ok(createEmbeddingProvider("ollama", { baseUrl: "http://127.0.0.1:11434" }));
  for (const id of ["openai", "anthropic", "groq", "openrouter", "custom"] as const) {
    assert.throws(
      () => createEmbeddingProvider(id, { apiKey: "k", baseUrl: "https://x/v1" }),
      (e) => e instanceof ProviderError && e.kind === "model",
      id
    );
  }
});

test("env fallback ordering is free-first and env-var driven", () => {
  const saved = { ...process.env };
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OLLAMA_BASE_URL;
    process.env.GROQ_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    const ids = envFallbackProviders().map((p) => p.id);
    assert.deepEqual(ids, ["groq", "openai"], "order follows FREE_FIRST_ORDER");
    process.env.GEMINI_API_KEY = "gem";
    const ids2 = envFallbackProviders().map((p) => p.id);
    assert.deepEqual(ids2, ["gemini", "groq", "openai"]);
  } finally {
    process.env = saved;
  }
});

// ── Anthropic wire format (mocked fetch) ─────────────────────────────────

type FetchCall = { url: string; init: RequestInit };

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("anthropic chat: system promotion, tool_use mapping, usage, finish reasons", async () => {
  const provider = new AnthropicProvider("sk-ant-test", "claude-haiku-4-5");
  const { calls, restore } = mockFetch(() =>
    new Response(
      JSON.stringify({
        model: "claude-haiku-4-5",
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Checking the weather. " },
          { type: "tool_use", id: "toolu_1", name: "weather", input: { city: "Lagos" } },
        ],
        usage: { input_tokens: 42, output_tokens: 17 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  );
  try {
    const res = await provider.chat({
      messages: [
        { role: "system", content: "You are precise." },
        { role: "user", content: "Weather in Lagos?" },
      ],
      tools: [{ name: "weather", description: "lookup", parameters: { type: "object" } }],
    });
    assert.equal(res.content, "Checking the weather. ");
    assert.deepEqual(res.toolCalls, [{ id: "toolu_1", name: "weather", arguments: { city: "Lagos" } }]);
    assert.equal(res.finishReason, "tool_calls");
    assert.equal(res.usage.promptTokens, 42);
    assert.equal(res.usage.completionTokens, 17);
    assert.equal(res.usage.totalTokens, 59);

    // Request shape: versioned headers, system as top-level, max_tokens defaulted.
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(calls[0]!.url, "https://api.anthropic.com/v1/messages");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["x-api-key"], "sk-ant-test");
    assert.equal((calls[0]!.init.headers as Record<string, string>)["anthropic-version"], "2023-06-01");
    assert.equal(body.system, "You are precise.");
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.messages.length, 1);
    assert.equal(body.tools[0].input_schema.type, "object");
  } finally {
    restore();
  }
});

test("anthropic chat maps tool results into tool_result blocks", async () => {
  const provider = new AnthropicProvider("k");
  const { calls, restore } = mockFetch(() =>
    new Response(JSON.stringify({ content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage: {} }), { status: 200 })
  );
  try {
    await provider.chat({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "", toolCalls: [{ id: "t1", name: "x", arguments: {} }] },
        { role: "tool", content: "", toolResults: [{ id: "t1", name: "x", content: "result-body" }] },
      ],
    });
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.messages[1].content[0].type, "tool_use");
    assert.equal(body.messages[2].role, "user");
    assert.deepEqual(body.messages[2].content[0], { type: "tool_result", tool_use_id: "t1", content: "result-body" });
  } finally {
    restore();
  }
});

test("anthropic stream: text deltas, accumulated tool json, usage, done", async () => {
  const provider = new AnthropicProvider("k");
  const sse = [
    'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-haiku-4-5","usage":{"input_tokens":10}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_9","name":"calc"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"n\\":"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"42}"}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":9}}',
    'event: message_stop\ndata: {"type":"message_stop"}',
    "",
  ].join("\n\n");
  const { restore } = mockFetch(() =>
    new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })
  );
  try {
    const events = [];
    for await (const e of provider.streamChat({ messages: [{ role: "user", content: "calc 42" }] })) {
      events.push(e);
    }
    const texts = events.filter((e) => e.type === "text_delta").map((e) => e.type === "text_delta" ? e.text : "");
    assert.deepEqual(texts, ["Hel", "lo"]);
    const tool = events.find((e) => e.type === "tool_call");
    assert.ok(tool && tool.type === "tool_call");
    assert.deepEqual(tool.toolCall, { id: "toolu_9", name: "calc", arguments: { n: 42 } });
    const usage = events.find((e) => e.type === "usage");
    assert.ok(usage && usage.type === "usage");
    assert.equal(usage.usage.promptTokens, 10);
    assert.equal(usage.usage.completionTokens, 9);
    const done = events.at(-1);
    assert.ok(done && done.type === "done" && done.finishReason === "tool_calls");
  } finally {
    restore();
  }
});

test("anthropic health check: 200 ok, 401 honest auth error", async () => {
  const provider = new AnthropicProvider("k");
  let status = 200;
  const { calls, restore } = mockFetch(() => new Response(status === 200 ? "{}" : JSON.stringify({ error: { message: "invalid x-api-key" } }), { status }));
  try {
    const ok = await provider.healthCheck();
    assert.equal(ok.ok, true);
    status = 401;
    const bad = await provider.healthCheck();
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? "", /auth/);
    assert.match(bad.error ?? "", /invalid x-api-key/);
    assert.equal(calls[0]!.url, "https://api.anthropic.com/v1/models");
  } finally {
    restore();
  }
});

test("anthropic chat: API error surfaces as classified ProviderError", async () => {
  const provider = new AnthropicProvider("k");
  const { restore } = mockFetch(() =>
    new Response(JSON.stringify({ error: { message: "credit balance too low" } }), { status: 400 })
  );
  try {
    await assert.rejects(provider.chat({ messages: [{ role: "user", content: "hi" }] }), ProviderError);
  } finally {
    restore();
  }
});

test("class capabilities are honest flags", () => {
  const anthropic = new AnthropicProvider("k");
  assert.equal(anthropic.supportsTools, true);
  assert.equal(anthropic.supportsJsonMode, false); // no enforced JSON upstream
  assert.equal(anthropic.supportsStreaming, true);
  const groq = createChatProvider("groq", { apiKey: "k" });
  assert.equal(groq.supportsTools, true);
  assert.equal(groq.supportsStreaming, true);
});

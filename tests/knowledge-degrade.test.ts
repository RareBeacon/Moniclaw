/**
 * Knowledge search degradation contract: when the workspace's embedder is
 * unavailable or THROWS (e.g. chat-only free-tier provider without an
 * embeddings endpoint), search() returns an honest empty result — never a
 * thrown error that would fail research runs, campaign drafts or tool calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { KnowledgeService } from "../packages/ai-runtime/knowledge/service";

const stubDb = {} as never; // search() must not reach the DB in these paths

test("search returns [] when no embedder is configured", async () => {
  const svc = new KnowledgeService(stubDb, () => null);
  assert.deepEqual(await svc.search({ workspaceId: "w1", query: "pricing" }), []);
});

test("search returns [] when the embedder throws (chat-only provider)", async () => {
  const svc = new KnowledgeService(stubDb, () => ({
    embed: async () => {
      throw new Error("No AI provider is configured for w1 (needs Gemini or Ollama for embeddings)");
    },
  }));
  assert.deepEqual(await svc.search({ workspaceId: "w1", query: "pricing" }), []);
});

test("search returns [] when the embedder yields an empty vector", async () => {
  const svc = new KnowledgeService(stubDb, () => ({
    embed: async () => ({
      vectors: [],
      model: "test-embedding",
      provider: "test",
      dim: 0,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, latencyMs: 0, costMicros: 0 },
    }),
  }));
  assert.deepEqual(await svc.search({ workspaceId: "w1", query: "pricing" }), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";

import { UsageTracker } from "../packages/ai-runtime/usage/tracker";

/** In-memory double for the small slice of Prisma the tracker uses. */
function fakeDb() {
  const created: Array<Record<string, unknown>> = [];
  const db = {
    aiUsageEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
      aggregate: async () => ({
        _sum: {
          promptTokens: 120,
          completionTokens: 80,
          totalTokens: 200,
          costMicros: 1_500_000n, // $1.50
          toolCallCount: 3,
        },
        _count: { _all: 10 },
        _avg: { latencyMs: 412.4 },
      }),
      groupBy: async ({ by }: { by: string[] }) => {
        if (by.includes("provider")) {
          return [
            { provider: "gemini", _sum: { totalTokens: 150, costMicros: 0n }, _count: { _all: 7 } },
            { provider: "openrouter", _sum: { totalTokens: 50, costMicros: 1_500_000n }, _count: { _all: 3 } },
          ];
        }
        if (by.includes("model")) {
          return [{ model: "gemini-2.5-flash", _sum: { totalTokens: 200 }, _count: { _all: 10 } }];
        }
        return [{ errorCode: "rate_limit", _count: { _all: 2 } }];
      },
      count: async () => 9,
    },
    $queryRaw: async () => [{ day: "2026-07-31", tokens: 200n, requests: 10n }],
  } as unknown as PrismaClient;
  return { created, db };
}

test("record persists a fully-defaulted event row", async () => {
  const { created, db } = fakeDb();
  const tracker = new UsageTracker(db);
  await tracker.record({
    workspaceId: "w1",
    userId: "u1",
    kind: "CHAT",
    status: "OK",
    provider: "gemini",
    model: "gemini-2.5-flash",
    usage: { promptTokens: 12, completionTokens: 4, totalTokens: 16, latencyMs: 88, costMicros: 0 },
    toolCallCount: 1,
  });
  assert.equal(created.length, 1);
  assert.equal(created[0]!.promptTokens, 12);
  assert.equal(created[0]!.costMicros, 0n);
  assert.equal(created[0]!.toolCallCount, 1);
});

test("record tolerates missing usage and DB failures (never throws)", async () => {
  const { db } = fakeDb();
  const tracker = new UsageTracker(db);
  await tracker.record({
    workspaceId: "w1",
    kind: "CHAT",
    status: "ERROR",
    provider: "openrouter",
    model: "unknown",
    errorCode: "rate_limit",
  });

  const failing = {
    aiUsageEvent: {
      create: async () => {
        throw new Error("db down");
      },
    },
  } as unknown as PrismaClient;
  const warn = console.warn;
  let warned = 0;
  console.warn = () => {
    warned += 1;
  };
  try {
    await new UsageTracker(failing).record({
      workspaceId: "w1",
      kind: "CHAT",
      status: "OK",
      provider: "gemini",
      model: "m",
    });
  } finally {
    console.warn = warn;
  }
  assert.equal(warned, 1); // swallowed, but observable
});

test("summarize converts micros to USD and bigint rows to numbers", async () => {
  const { db } = fakeDb();
  const summary = await new UsageTracker(db).summarize("w1", 30);
  assert.equal(summary.requests, 10);
  assert.equal(summary.totalTokens, 200);
  assert.equal(summary.costUsd, 1.5);
  assert.equal(summary.avgLatencyMs, 412);
  assert.equal(summary.okRate, 0.9);
  assert.deepEqual(summary.byProvider.map((p) => p.provider), ["gemini", "openrouter"]);
  assert.equal(summary.byProvider[1]!.costUsd, 1.5);
  assert.deepEqual(summary.daily, [{ day: "2026-07-31", tokens: 200, requests: 10 }]);
  assert.deepEqual(summary.topErrors, [{ code: "rate_limit", count: 2 }]);
});

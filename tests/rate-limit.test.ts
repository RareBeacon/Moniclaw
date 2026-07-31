import { test } from "node:test";
import assert from "node:assert/strict";

import {
  __resetRateLimitStore,
  rateLimit,
  RATE_LIMITS,
} from "../lib/rate-limit";

test("allows up to the limit then blocks with retry timing", () => {
  __resetRateLimitStore();
  const key = "test:basic";

  for (let i = 0; i < 3; i++) {
    const result = rateLimit(key, 3, 60_000);
    assert.equal(result.success, true);
  }

  const blocked = rateLimit(key, 3, 60_000);
  assert.equal(blocked.success, false);
  if (!blocked.success) {
    assert.ok(blocked.retryAfterSeconds >= 1);
    assert.ok(blocked.retryAfterSeconds <= 60);
  }
});

test("separate keys have independent buckets", () => {
  __resetRateLimitStore();
  for (let i = 0; i < 2; i++) rateLimit("test:a", 2, 60_000);
  assert.equal(rateLimit("test:a", 2, 60_000).success, false);
  assert.equal(rateLimit("test:b", 2, 60_000).success, true);
});

test("token window slides: oldest hit expires first", async () => {
  __resetRateLimitStore();
  const key = "test:slide";
  assert.equal(rateLimit(key, 1, 120).success, true);
  assert.equal(rateLimit(key, 1, 120).success, false);
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(rateLimit(key, 1, 120).success, true);
});

test("named policies are sane", () => {
  assert.ok(RATE_LIMITS.login.limit <= 10);
  assert.ok(RATE_LIMITS.register.windowMs >= 60_000);
  assert.ok(RATE_LIMITS.invite.limit >= 10);
});

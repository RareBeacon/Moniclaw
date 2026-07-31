import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCredits, formatDuration, formatDateTime } from "../lib/format";

test("formatCredits uses locale grouping", () => {
  assert.equal(formatCredits(25000), "25,000");
  assert.equal(formatCredits(0), "0");
});

test("formatDuration renders human units", () => {
  const start = new Date("2026-07-31T10:00:00Z").toISOString();
  assert.equal(formatDuration(start, new Date("2026-07-31T10:00:42Z").toISOString()), "42s");
  assert.equal(formatDuration(start, new Date("2026-07-31T10:06:07Z").toISOString()), "6m 7s");
  assert.equal(formatDuration(start, new Date("2026-07-31T12:01:00Z").toISOString()), "2h 1m");
  assert.equal(formatDuration(null, null), "—");
});

test("formatDateTime handles nulls and real dates", () => {
  assert.equal(formatDateTime(null), "—");
  assert.notEqual(formatDateTime("2026-07-31T10:00:00Z"), "—");
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { chunkText, estimateTokens } from "../packages/ai-runtime/knowledge/chunker";

test("estimateTokens is the documented ~4 chars/token heuristic", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("short text yields a single chunk", () => {
  const chunks = chunkText("Hello world.\n\nSecond paragraph.");
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0]!.content.includes("Hello world."));
  assert.ok(chunks[0]!.content.includes("Second paragraph."));
  assert.equal(chunks[0]!.index, 0);
  assert.ok(chunks[0]!.tokenCount > 0);
});

test("paragraphs pack up to the token target then split", () => {
  // 160 words × 5 chars = 800 chars ≈ 200 tokens/paragraph; target 450 fits
  // two paragraphs per chunk (400 ≤ 450, 600 does not).
  const paragraph = "word ".repeat(160).trim();
  const text = Array.from({ length: 5 }, () => paragraph).join("\n\n");
  const chunks = chunkText(text, { targetTokens: 450, overlapTokens: 0 });
  assert.equal(chunks.length, 3); // 2 + 2 + 1
  for (const [i, c] of chunks.entries()) assert.equal(c.index, i);
});

test("overlap carries a tail into the next chunk", () => {
  // Sentence-sized paragraphs (~10 tokens each); target 45, overlap 40 →
  // each chunk's tail paragraphs re-appear as the head of the next.
  const sentence = "one two three four five six seven eight nine ten eleven twelve"; // 48 chars ≈ 12 tokens
  const text = Array.from({ length: 8 }, (_, i) => `${i}:${sentence}`).join("\n\n");
  const chunks = chunkText(text, { targetTokens: 45, overlapTokens: 24 });
  assert.ok(chunks.length >= 3);
  // Later chunks must start with content that already appeared in the chunk
  // before them (the overlap tail).
  assert.ok(
    chunks[1]!.content.split("\n\n")[0]!.includes(":") &&
      chunks[0]!.content.includes(chunks[1]!.content.split("\n\n")[0]!)
  );
});

test("oversized paragraphs are hard-split", () => {
  const giant = "x".repeat(450 * 4 * 4); // ~4× target, single paragraph
  const chunks = chunkText(giant, { targetTokens: 450, overlapTokens: 60 });
  assert.ok(chunks.length >= 3);
  for (const c of chunks) assert.ok(c.tokenCount <= 500);
});

test("maxChunks throws instead of silently truncating", () => {
  const paragraph = "word ".repeat(510).trim(); // ~510 tokens → own chunk
  const text = Array.from({ length: 4 }, () => paragraph).join("\n\n");
  assert.throws(
    () => chunkText(text, { targetTokens: 450, overlapTokens: 0, maxChunks: 2 }),
    /chunk limit/
  );
});

test("empty input yields no chunks", () => {
  assert.deepEqual(chunkText("  \n\n \n"), []);
});

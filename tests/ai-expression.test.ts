import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateExpression } from "../packages/ai-runtime/tools/builtin/expression";
import { calculatorTool } from "../packages/ai-runtime/tools/builtin/utility";

test("arithmetic precedence incl. power and parentheses", () => {
  assert.equal(evaluateExpression("2+3*4"), 14);
  assert.equal(evaluateExpression("(2+3)*4"), 20);
  assert.equal(evaluateExpression("2^3^2"), 512); // right-associative
  assert.equal(evaluateExpression("(12*8)+4^2"), 112);
  assert.equal(evaluateExpression("10 % 3"), 1);
  assert.equal(evaluateExpression("7 / 2"), 3.5);
});

test("unary minus and decimals", () => {
  assert.equal(evaluateExpression("-3 + 5"), 2);
  assert.equal(evaluateExpression("-(2+2)"), -4);
  assert.equal(evaluateExpression("0.1 + 0.2"), 0.30000000000000004);
});

test("rejects malformed or hostile input", () => {
  assert.throws(() => evaluateExpression(""));
  assert.throws(() => evaluateExpression("1 +"));
  assert.throws(() => evaluateExpression("2 * * 3"));
  assert.throws(() => evaluateExpression("a".repeat(600))); // length guard
  assert.throws(() => evaluateExpression("1; DROP TABLE users"));
});

test("division by zero throws instead of returning Infinity", () => {
  assert.throws(() => evaluateExpression("1/0"));
});

test("calculator tool returns structured output", async () => {
  const out = (await calculatorTool.execute(
    { expression: "(12*8)+4^2" },
    { workspaceId: "w1", toolPermissions: {} }
  )) as { expression: string; value: number };
  assert.equal(out.value, 112);
  // Non-finite results are rejected by the tool wrapper.
  await assert.rejects(() =>
    calculatorTool.execute({ expression: "0/0" }, { workspaceId: "w1", toolPermissions: {} })
  );
});

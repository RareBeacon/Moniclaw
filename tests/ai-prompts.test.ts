import { test } from "node:test";
import assert from "node:assert/strict";

import {
  composeSystemPrompt,
  renderPrompt,
  PromptRenderError,
} from "../packages/ai-runtime/prompts/renderer";

test("renders declared variables with values", () => {
  const result = renderPrompt(
    "Summarize {{topic}} for {{audience}}.",
    [
      { name: "topic", required: true },
      { name: "audience", required: false, default: "operators" },
    ],
    { topic: "refunds" }
  );
  assert.equal(result.rendered, "Summarize refunds for operators.");
  assert.deepEqual(result.used.sort(), ["audience", "topic"]);
  assert.deepEqual(result.warnings, []);
});

test("missing required variable throws PromptRenderError naming it", () => {
  assert.throws(
    () =>
      renderPrompt(
        "Hi {{name}}.",
        [{ name: "name", required: true }],
        {}
      ),
    (err: unknown) =>
      err instanceof PromptRenderError && (err as PromptRenderError).variable === "name"
  );
});

test("required variable satisfied by its default does not throw", () => {
  const result = renderPrompt(
    "Tone: {{tone}}.",
    [{ name: "tone", required: true, default: "neutral" }],
    {}
  );
  assert.equal(result.rendered, "Tone: neutral.");
});

test("undeclared placeholders stay intact with a warning", () => {
  const result = renderPrompt("Deploy {{service}} now.", [], {});
  assert.equal(result.rendered, "Deploy {{service}} now.");
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /Undeclared placeholder/);
});

test("declared-but-valueless optional variable renders empty with a warning", () => {
  const result = renderPrompt(
    "Note:{{note}}!",
    [{ name: "note", required: false }],
    {}
  );
  assert.equal(result.rendered, "Note:!");
  assert.match(result.warnings[0]!, /rendered empty/);
});

test("supplied-but-unused values are flagged (typo detection)", () => {
  const result = renderPrompt(
    "Hello {{name}}.",
    [{ name: "name", required: true }],
    { name: "Ada", naam: "Abel" }
  );
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0]!, /"naam" is not used/);
});

test("placeholders with whitespace still match", () => {
  const result = renderPrompt("{{ topic }}", [{ name: "topic", required: true }], {
    topic: "T",
  });
  assert.equal(result.rendered, "T");
});

test("composeSystemPrompt joins present layers with blank lines only", () => {
  assert.equal(
    composeSystemPrompt({
      system: "You are careful.",
      workspace: "Workspace: Acme.",
      task: "Task: reconcile.",
    }),
    "You are careful.\n\nWorkspace: Acme.\n\nTask: reconcile."
  );
  assert.equal(composeSystemPrompt({ agent: "  Agent only.  " }), "Agent only.");
  assert.equal(composeSystemPrompt({}), "");
});

/**
 * Agent Runtime error taxonomy — AgentError mapping, HTTP status table, and
 * the structural ProviderError → upstream_failed bridge (packages decoupled).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { AgentError, AGENT_HTTP_STATUS, toAgentError, type AgentErrorKind } from "../packages/agent-runtime/errors";

const ALL_KINDS: AgentErrorKind[] = [
  "validation", "not_found", "permission_denied", "agent_unavailable",
  "run_conflict", "budget_exceeded", "cancelled", "needs_approval",
  "delegation_denied", "upstream_failed", "internal",
];

test("every AgentErrorKind has an HTTP status", () => {
  for (const kind of ALL_KINDS) {
    assert.ok(AGENT_HTTP_STATUS[kind] >= 400 && AGENT_HTTP_STATUS[kind] < 600, `${kind} mapped`);
  }
});

test("toAgentError passes AgentError through untouched", () => {
  const err = new AgentError("budget_exceeded", "cap hit");
  assert.equal(toAgentError(err), err);
});

test("toAgentError maps ProviderError to upstream_failed", () => {
  // Structural twin of the Phase-3 ProviderError — no cross-package import.
  const providerErr = Object.assign(new Error("429 from model api"), {
    name: "ProviderError", kind: "rate_limit", provider: "openai", retryable: true,
  });
  const mapped = toAgentError(providerErr);
  assert.equal(mapped.kind, "upstream_failed");
  assert.equal(AGENT_HTTP_STATUS[mapped.kind], 502);
});

test("toAgentError maps NoProviderConfiguredError to upstream_failed (model-less workspace)", () => {
  const noProvider = Object.assign(
    new Error("No AI provider is configured for ws. Add one under Dashboard."),
    { name: "NoProviderConfiguredError" }
  );
  const mapped = toAgentError(noProvider);
  assert.equal(mapped.kind, "upstream_failed");
  assert.match(mapped.message, /No AI provider is configured/);
});

test("toAgentError maps AllProvidersFailedError to upstream_failed", () => {
  const allFailed = Object.assign(new Error("All AI providers failed (openai:timeout)"), {
    name: "AllProvidersFailedError",
    attempts: [{ provider: "openai", kind: "timeout", message: "x" }],
  });
  assert.equal(toAgentError(allFailed).kind, "upstream_failed");
});

test("toAgentError falls back for unknown errors and non-error values", () => {
  assert.equal(toAgentError(new Error("boom")).kind, "internal");
  assert.equal(toAgentError("string failure").kind, "internal");
  assert.equal(toAgentError(null).kind, "internal");
  assert.equal(toAgentError(new Error("boom"), "cancelled").kind, "cancelled");
});

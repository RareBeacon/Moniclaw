import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateDomain, hostMatches, hostOf, matchAny, normalizePattern } from "../packages/computer-use/permissions/domains";
import { PermissionService } from "../packages/computer-use/permissions/service";
import type { PolicyRepository, PolicyRow } from "../packages/computer-use/ports";

const BASE: Pick<PolicyRow, "allowedDomains" | "blockedDomains" | "confirmationDomains" | "defaultAllowed"> = {
  allowedDomains: [],
  blockedDomains: [],
  confirmationDomains: [],
  defaultAllowed: true,
};

test("hostMatches: exact host only", () => {
  assert.equal(hostMatches("example.com", "example.com"), true);
  assert.equal(hostMatches("sub.example.com", "example.com"), false);
  assert.equal(hostMatches("example.com", "other.com"), false);
});

test("hostMatches: one-level wildcard matches apex + any subdomain depth under it", () => {
  assert.equal(hostMatches("example.com", "*.example.com"), true);
  assert.equal(hostMatches("app.example.com", "*.example.com"), true);
  assert.equal(hostMatches("deep.app.example.com", "*.example.com"), true);
  assert.equal(hostMatches("example.com.evil.net", "*.example.com"), false);
});

test("hostMatches: star catches all", () => {
  assert.equal(hostMatches("anything.net", "*"), true);
});

test("normalizePattern trims case/dots", () => {
  assert.equal(normalizePattern("  .Example.COM/ "), "example.com");
});

test("hostOf extracts hostname and rejects junk", () => {
  assert.equal(hostOf("https://App.Example.com:443/x"), "app.example.com");
  assert.equal(hostOf("not a url"), null);
});

test("matchAny returns the normalized winning pattern", () => {
  assert.equal(matchAny("a.example.com", ["*.example.com"]), "*.example.com");
  assert.equal(matchAny("nope.org", ["*.example.com"]), null);
});

test("evaluateDomain order: blocked > confirmation > allowed > default", () => {
  const policy = {
    allowedDomains: ["safe.example.com"],
    blockedDomains: ["*.evil.com"],
    confirmationDomains: ["risky.example.com"],
    defaultAllowed: true,
  };
  assert.deepEqual(evaluateDomain("https://a.evil.com/x", policy), { decision: "blocked", matched: "*.evil.com" });
  assert.deepEqual(evaluateDomain("https://risky.example.com/", policy), { decision: "confirm", matched: "risky.example.com" });
  assert.deepEqual(evaluateDomain("https://safe.example.com/", policy), { decision: "allowed", matched: "safe.example.com" });
  // Blocked wins over allowed when both match.
  const both = { ...BASE, allowedDomains: ["*.x.com"], blockedDomains: ["*.x.com"] };
  assert.deepEqual(evaluateDomain("https://a.x.com", both), { decision: "blocked", matched: "*.x.com" });
  // Confirmation wins over broad allowlist.
  const confirmOverAllow = { ...BASE, allowedDomains: ["*.y.com"], confirmationDomains: ["a.y.com"], defaultAllowed: false };
  assert.deepEqual(evaluateDomain("https://a.y.com", confirmOverAllow), { decision: "confirm", matched: "a.y.com" });
});

test("evaluateDomain default-deny when defaultAllowed=false and nothing matches", () => {
  const policy = { ...BASE, defaultAllowed: false };
  assert.deepEqual(evaluateDomain("https://unknown.io", policy), { decision: "blocked", matched: "default-deny" });
});

test("evaluateDomain blocks invalid URLs", () => {
  assert.deepEqual(evaluateDomain("javascript:alert(1)", BASE), { decision: "blocked", matched: "invalid-url" });
});

// ── PermissionService tier checks ─────────────────────────────────────────

function policy(partial: Partial<PolicyRow>): PolicyRow {
  return {
    workspaceId: "ws1", readOnly: false, navigationOnly: false,
    allowJavascript: false, allowDownloads: true, allowUploads: true, allowClipboard: false,
    allowedDomains: [], blockedDomains: [], confirmationDomains: [], defaultAllowed: true,
    ...partial,
  };
}

function serviceWith(row: PolicyRow): PermissionService {
  const repo: PolicyRepository = {
    getPolicy: async () => row,
    savePolicy: async () => {},
  };
  return new PermissionService(repo);
}

test("readOnly allows reads, blocks navigate/interact/javascript", () => {
  const svc = serviceWith(policy({ readOnly: true }));
  assert.equal(svc.canWith(policy({ readOnly: true }), "read").allowed, true);
  assert.equal(svc.canWith(policy({ readOnly: true }), "navigate").allowed, false);
  assert.equal(svc.canWith(policy({ readOnly: true }), "interact").allowed, false);
});

test("navigationOnly allows read+navigate, blocks interact/input", () => {
  const p = policy({ navigationOnly: true });
  const svc = serviceWith(p);
  assert.equal(svc.canWith(p, "read").allowed, true);
  assert.equal(svc.canWith(p, "navigate").allowed, true);
  assert.equal(svc.canWith(p, "interact").allowed, false);
  assert.equal(svc.canWith(p, "input").allowed, false);
});

test("feature gates: javascript/downloads/uploads/clipboard flags", () => {
  const p = policy({ allowJavascript: false, allowDownloads: false, allowUploads: true, allowClipboard: false });
  const svc = serviceWith(p);
  assert.equal(svc.canWith(p, "javascript").allowed, false);
  assert.equal(svc.canWith(p, "files:download").allowed, false);
  assert.equal(svc.canWith(p, "files:upload").allowed, true);
  assert.equal(svc.canWith(p, "clipboard").allowed, false);
  const enabled = serviceWith(policy({ allowJavascript: true }));
  assert.equal(enabled.canWith(policy({ allowJavascript: true }), "javascript").allowed, true);
});

test("assertNavigation throws on blocked and flags confirmation", async () => {
  const p = policy({ blockedDomains: ["bad.io"], confirmationDomains: ["risky.io"], defaultAllowed: true });
  const svc = serviceWith(p);
  assert.throws(() => svc.assertNavigation(p, "https://bad.io"), /blocked/i);
  assert.deepEqual(svc.assertNavigation(p, "https://risky.io"), { needsConfirmation: true, matched: "risky.io" });
  assert.deepEqual(svc.assertNavigation(p, "https://fine.io"), { needsConfirmation: false, matched: null });
});

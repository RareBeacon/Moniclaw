import { test } from "node:test";
import assert from "node:assert/strict";

import { FIRST_PARTY_TEMPLATES } from "../lib/templates/catalog";
import { resolveToolPolicy, defaultAllowlist } from "../packages/agent-runtime/policy";
import { workerBudgetSchema } from "../packages/agent-runtime/types";

/**
 * Phase 8 shipping rule: a template that can't dispatch never ships. Every
 * manifest is validated against the SAME resolvers the orchestrator uses.
 */

test("catalog: slugs are unique, kebab-case, and fields are honest text", () => {
  const slugs = new Set<string>();
  for (const t of FIRST_PARTY_TEMPLATES) {
    assert.match(t.slug, /^[a-z0-9][a-z0-9-]*$/, t.slug);
    assert.ok(!slugs.has(t.slug), `duplicate slug ${t.slug}`);
    slugs.add(t.slug);
    assert.ok(t.name.length >= 3 && t.summary.length >= 20, `${t.slug}: real name/summary`);
    assert.ok(t.description.length >= 60, `${t.slug}: real description`);
    assert.ok(t.manifest.goal.length >= 40, `${t.slug}: goal is a real objective`);
    assert.ok(t.manifest.instructions.length >= 40, `${t.slug}: real operator constraints`);
    assert.ok(t.manifest.skills.length >= 2, `${t.slug}: at least two skills`);
    assert.ok(!t.summary.includes("{{") && !t.description.includes("{{"), `${t.slug}: no placeholders`);
  }
  assert.ok(FIRST_PARTY_TEMPLATES.length >= 8, "v1 ships a meaningful first-party set");
});

test("catalog: every manifest parses under the orchestrator's resolvers", () => {
  for (const t of FIRST_PARTY_TEMPLATES) {
    // Tool policy parses (and stays delegation-free unless explicitly opted in).
    const policy = resolveToolPolicy(t.manifest.toolPolicy);
    assert.equal(policy.allowDelegation, false, `${t.slug}: templates never delegate by default`);
    // Budget parses and stays INSIDE safe operator caps.
    const budget = workerBudgetSchema.parse(t.manifest.budget);
    assert.ok(budget.maxSteps <= 25, `${t.slug}: step cap within global default`);
    assert.ok(budget.maxTokens <= 400_000, `${t.slug}: token cap within global default`);
    assert.ok(budget.maxCostMicros <= 2_000_000, `${t.slug}: cost cap within global default`);
    // Worker type is one the policy engine knows how to arm.
    assert.ok(["general", "research", "ops"].includes(t.workerType), `${t.slug}: known workerType`);
    // Trigger/schedule coherence.
    if (t.manifest.trigger === "SCHEDULE") {
      assert.ok(t.manifest.schedule?.trim(), `${t.slug}: SCHEDULE needs a cron expression`);
      assert.match(t.manifest.schedule!, /^\S+ \S+ \S+ \S+ \S+$/, `${t.slug}: 5-field cron`);
    }
    // Installed status must never start live.
    assert.ok(["DRAFT", "SHADOW"].includes(t.manifest.status), `${t.slug}: installs start safe`);
  }
});

test("catalog: effective tool surface is non-empty and resolvable (no phantom tools)", () => {
  for (const t of FIRST_PARTY_TEMPLATES) {
    const policy = resolveToolPolicy(t.manifest.toolPolicy);
    const base = policy.allow.length ? policy.allow : defaultAllowlist(t.workerType);
    const effective = base.filter((name) => !policy.deny.includes(name));
    assert.ok(effective.length >= 4, `${t.slug}: worker can actually do its job`);
    // Explicit allowlists must be subsets of the worker-type allowlist —
    // packages must not arm tools beyond their declared discipline by accident.
    if (policy.allow.length) {
      const discipline = new Set(defaultAllowlist(t.workerType));
      for (const name of policy.allow) {
        assert.ok(discipline.has(name), `${t.slug}: ${name} outside ${t.workerType} discipline`);
      }
    }
  }
});

test("catalog: categories and icons stay within the UI vocabulary", () => {
  const categories = new Set(["Research", "Operations", "Sales", "Support"]);
  const icons = new Set(["Target", "Radar", "FileBarChart", "Map", "MonitorSmartphone", "Inbox", "NotebookPen", "ReceiptText"]);
  for (const t of FIRST_PARTY_TEMPLATES) {
    assert.ok(categories.has(t.category), `${t.slug}: known category`);
    assert.ok(icons.has(t.icon), `${t.slug}: ${t.icon} has a mapped icon`);
  }
});

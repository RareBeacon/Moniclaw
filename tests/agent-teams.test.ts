import test from "node:test";
import assert from "node:assert/strict";

import { composeTeamBriefing, slugify, type TeamRosterBrief } from "../lib/agents/team-briefing";
import {
  teamCreateApiSchema,
  teamUpdateApiSchema,
  teamRunApiSchema,
} from "../lib/validations/agents";

/**
 * Phase 7 — multi-agent teams: briefing composition (the leader's playbook),
 * slug rules, and the REST/validation contracts. DB-touching flows are
 * covered by the agent E2E battery (structural assertions).
 */

function fakeTeam(over?: Partial<TeamRosterBrief>): TeamRosterBrief {
  return {
    name: "Outbound crew",
    description: "Find and woo logistics leaders.",
    members: [
      {
        promptHint: "Use for prospect research first.",
        agent: { name: "Scout", slug: "scout", description: "Researches companies." },
      },
      {
        promptHint: null,
        agent: { name: "Scribe", slug: "scribe", description: "Drafts persuasive outreach. Patiently." },
      },
    ],
    ...over,
  };
}

test("briefing enumerates members with slugs and hints", () => {
  const b = composeTeamBriefing(fakeTeam());
  assert.match(b, /You lead the team "Outbound crew"/);
  assert.match(b, /Find and woo logistics leaders\./);
  assert.match(b, /Scout \(slug "scout"\) — Use for prospect research first\./);
  // member without a hint → falls back to the agent description's first sentence
  assert.match(b, /Scribe \(slug "scribe"\) — Drafts persuasive outreach/);
  assert.match(b, /synthesize member outcomes/i);
});

test("briefing is capped so goals stay within budget", () => {
  const longTeam = fakeTeam({
    members: Array.from({ length: 12 }, (_, i) => ({
      promptHint: "x".repeat(220),
      agent: { name: `Agent ${i}`, slug: `agent-${i}`, description: "d" },
    })),
  });
  const b = composeTeamBriefing(longTeam);
  assert.ok(b.length <= 1400, `expected ≤1400 chars, got ${b.length}`);
});

test("slugify produces URL-safe slugs with fallbacks", () => {
  assert.equal(slugify("Outbound Crew Alpha"), "outbound-crew-alpha");
  assert.equal(slugify("  --Research & Ops!!  "), "research-ops");
  assert.equal(slugify("équipe"), "quipe");
  assert.equal(slugify("!!!"), "team");
  assert.ok(slugify("x".repeat(120)).length <= 50);
});

test("create schema: sane defaults, member cap, leader-not-member caught by service not schema", () => {
  const ok = teamCreateApiSchema.safeParse({ name: "Crew", members: [] });
  assert.equal(ok.success, true);
  if (ok.success) assert.deepEqual(ok.data.members, []);

  const tooMany = teamCreateApiSchema.safeParse({
    name: "Crew",
    members: Array.from({ length: 13 }, (_, i) => ({ agentId: crypto.randomUUID(), position: i })),
  });
  assert.equal(tooMany.success, false);

  const badMember = teamCreateApiSchema.safeParse({
    name: "Crew",
    members: [{ agentId: "not-a-uuid" }],
  });
  assert.equal(badMember.success, false);
});

test("budget override validates through the shared worker budget contract", () => {
  const ok = teamCreateApiSchema.safeParse({ name: "Crew", budget: { maxSteps: 12, maxDepth: 2 } });
  assert.equal(ok.success, true);
  const bad = teamCreateApiSchema.safeParse({ name: "Crew", budget: { maxSteps: -4 } });
  assert.equal(bad.success, false);
});

test("update schema is partial; run schema demands a concrete goal", () => {
  assert.equal(teamUpdateApiSchema.safeParse({ description: "new mission" }).success, true);
  assert.equal(teamRunApiSchema.safeParse({ goal: "go" }).success, false); // < 3
  assert.equal(teamRunApiSchema.safeParse({ goal: "Research these five accounts." }).success, true);
  assert.equal(teamRunApiSchema.safeParse({ goal: "x".repeat(2001) }).success, false);
});

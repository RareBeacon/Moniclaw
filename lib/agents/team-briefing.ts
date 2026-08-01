/**
 * Pure team helpers — no DB/runtime imports, directly unit-testable.
 * The service layer (teams.ts) consumes these; tests import only this file.
 */

const SLUG_BASE_RE = /[^a-z0-9]+/g;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(SLUG_BASE_RE, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base || "team";
}

/** Structural roster view for briefing composition (Prisma rows satisfy it). */
export interface TeamRosterBrief {
  name: string;
  description: string | null;
  members: Array<{
    promptHint: string | null;
    agent: { name: string; slug: string; description: string };
  }>;
}

const BRIEFING_CAP = 1400;

/** The leader's delegation playbook, prepended to every team-run goal. */
export function composeTeamBriefing(team: TeamRosterBrief): string {
  const lines: string[] = [
    `You lead the team "${team.name}"${team.description ? ` — ${team.description}` : ""}.`,
    `Coordinate by calling the agent_delegate tool. Prefer delegating over doing everything yourself; synthesize member outcomes into one final answer. Members:`,
  ];
  for (const m of team.members) {
    const focus = m.promptHint
      ? m.promptHint
      : m.agent.description.split(/[.!?]\s/)[0]?.slice(0, 140) ?? "";
    lines.push(`- ${m.agent.name} (slug "${m.agent.slug}")${focus ? ` — ${focus}` : ""}`);
  }
  const full = lines.join("\n");
  return full.length > BRIEFING_CAP ? `${full.slice(0, BRIEFING_CAP - 1)}…` : full;
}

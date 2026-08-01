"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, Trash2 } from "lucide-react";

import {
  createAgentTeam,
  updateAgentTeam,
  deleteAgentTeam,
  runAgentTeam,
} from "@/lib/actions/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Phase 7 — team forms. One roster editor serves both create and edit;
 * the runner dispatches through the same orchestrated path as solo runs.
 */

export type TeamAgentOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  workerType: string;
  description: string;
};

export type TeamRosterInitial = {
  name: string;
  description: string | null;
  leaderAgentId: string | null;
  members: Array<{ agentId: string; promptHint: string | null }>;
  budget: { maxSteps?: number; maxTokens?: number; maxDepth?: number };
};

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const areaClass =
  "min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function numOrUndef(v: string): number | undefined {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function TeamRosterForm({
  agents,
  initial,
  teamId,
}: {
  agents: TeamAgentOption[];
  initial?: TeamRosterInitial;
  teamId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(teamId);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [leaderId, setLeaderId] = React.useState(initial?.leaderAgentId ?? "");
  const [selected, setSelected] = React.useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.members ?? []).map((m) => [m.agentId, m.promptHint ?? ""]))
  );
  const [maxSteps, setMaxSteps] = React.useState(initial?.budget.maxSteps ? String(initial.budget.maxSteps) : "");
  const [maxTokens, setMaxTokens] = React.useState(initial?.budget.maxTokens ? String(initial.budget.maxTokens) : "");
  const [maxDepth, setMaxDepth] = React.useState(initial?.budget.maxDepth ? String(initial.budget.maxDepth) : "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const selectableAgents = agents.filter((a) => a.id !== leaderId && a.status !== "ARCHIVED");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const members = Object.entries(selected).map(([agentId, hint], i) => ({
      agentId,
      promptHint: hint.trim() || null,
      position: i,
    }));
    const budget: Record<string, number> = {};
    const steps = numOrUndef(maxSteps);
    const tokens = numOrUndef(maxTokens);
    const depth = numOrUndef(maxDepth);
    if (steps) budget.maxSteps = steps;
    if (tokens) budget.maxTokens = tokens;
    if (depth) budget.maxDepth = depth;

    const payload = {
      name,
      description: description.trim() || null,
      leaderAgentId: leaderId || null,
      members,
      ...(Object.keys(budget).length ? { budget } : {}),
    };

    const result = editing && teamId
      ? await updateAgentTeam(teamId, payload)
      : await createAgentTeam(payload);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!editing && result.value) {
      router.push(`/dashboard/teams/${result.value}`);
      return;
    }
    setSaved(true);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="team-name">Team name</Label>
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} placeholder="Outbound research crew" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="team-leader">Leader agent</Label>
          <select
            id="team-leader"
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            className={fieldClass}
            required
          >
            <option value="" disabled>Pick the leader…</option>
            {agents.filter((a) => a.status !== "ARCHIVED").map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.status.toLowerCase()}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            The leader receives the goal, plans, and delegates to members. Its
            tool policy must allow delegation — the run refuses honestly otherwise.
          </p>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="team-description">Mission (optional)</Label>
        <textarea
          id="team-description"
          className={areaClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="What this team exists to accomplish — shown to the leader on every run."
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Members (up to 12 — the leader is separate)</legend>
        {selectableAgents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No other agents yet — create workers under Agents first, then pick them here.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {selectableAgents.map((a) => {
              const checked = selected[a.id] !== undefined;
              return (
                <li key={a.id} className="rounded-lg border p-3">
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={checked}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[a.id] = "";
                          else delete next[a.id];
                          return next;
                        })
                      }
                    />
                    <span className="text-sm font-medium">{a.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {a.workerType}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.status.toLowerCase()}</span>
                  </label>
                  {checked && (
                    <input
                      className={cn(fieldClass, "mt-2")}
                      placeholder="Playbook hint for the leader (when to use this member)"
                      value={selected[a.id]}
                      maxLength={240}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [a.id]: e.target.value }))}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Team budget (optional — child runs split it automatically)</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="b-steps">Max steps</Label>
            <Input id="b-steps" type="number" min={1} value={maxSteps} onChange={(e) => setMaxSteps(e.target.value)} placeholder="inherit" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-tokens">Max tokens</Label>
            <Input id="b-tokens" type="number" min={1000} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="inherit" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-depth">Max delegation depth</Label>
            <Input id="b-depth" type="number" min={1} max={5} value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} placeholder="inherit" />
          </div>
        </div>
      </fieldset>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || name.trim().length < 2 || !leaderId}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? "Save team" : "Create team"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

export function TeamRunForm({
  teamId,
  delegationReady,
}: {
  teamId: string;
  delegationReady: boolean;
}) {
  const router = useRouter();
  const [goal, setGoal] = React.useState("");
  const [mode, setMode] = React.useState<"LIVE" | "SHADOW">("LIVE");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [runId, setRunId] = React.useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setRunId(null);
    const result = await runAgentTeam(teamId, { goal, mode });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.value) setRunId(result.value);
    router.refresh();
  };

  return (
    <form onSubmit={run} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="team-goal">Objective for this run</Label>
        <textarea
          id="team-goal"
          className={areaClass}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          required
          minLength={3}
          maxLength={2000}
          placeholder="e.g. Research the five logistics companies on our shortlist, draft outreach for their COOs, and return one consolidated brief."
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Run mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "LIVE" | "SHADOW")}
          className={cn(fieldClass, "w-36")}
        >
          <option value="LIVE">LIVE</option>
          <option value="SHADOW">SHADOW</option>
        </select>
        <Button type="submit" disabled={pending || goal.trim().length < 3 || !delegationReady}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Run team
        </Button>
      </div>
      {!delegationReady && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-400">
          The leader&apos;s tool policy does not allow delegation yet — enable
          &quot;allowDelegation&quot; on that agent (Agents → edit → tool
          policy), then the team can run. Safe-by-default: capabilities are
          explicit, never implied.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {runId && (
        <p className="text-sm text-emerald-600">
          Team run queued.{" "}
          <Link href={`/dashboard/runs/${runId}`} className="font-medium underline underline-offset-2">
            Watch it live →
          </Link>
        </p>
      )}
    </form>
  );
}

export function DeleteTeamButton({ teamId, name }: { teamId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm(`Delete team "${name}"? Historical runs keep their lineage — only the roster is removed.`)) return;
        setPending(true);
        await deleteAgentTeam(teamId);
        router.push("/dashboard/teams");
        router.refresh();
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
      <span className="ml-2 text-destructive">Delete team</span>
    </Button>
  );
}

"use client";

import * as React from "react";
import { Loader2, OctagonX, Play, RotateCcw } from "lucide-react";

import {
  cancelAgentRun,
  dispatchAgent,
  resumeAgentRun,
  updateAgentWorkerConfig,
} from "@/lib/actions/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Phase-5 worker client controls. Server actions live in lib/actions/agents;
 * these components only manage pending/notice state and field→schema conversions
 * (USD → micros, minutes → ms, comma lists → string[]).
 */

function Notice({ state }: { state: { error?: string; ok?: boolean } }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="rounded-lg bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        Done.
      </p>
    );
  }
  return null;
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ── Dispatch ─────────────────────────────────────────────────────────────

export function DispatchForm({
  agentId,
  defaultMode,
  disabled,
}: {
  agentId: string;
  defaultMode: "LIVE" | "SHADOW";
  disabled?: boolean;
}) {
  const [state, setState] = React.useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const goal = (form.elements.namedItem("goal") as HTMLTextAreaElement).value.trim();
    const mode = (form.elements.namedItem("mode") as HTMLSelectElement).value as "LIVE" | "SHADOW";
    setPending(true);
    setState({});
    const result = await dispatchAgent(agentId, {
      ...(goal ? { goal } : {}),
      mode,
    });
    setPending(false);
    setState(result);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Notice state={state} />
      <div className="space-y-2">
        <Label htmlFor="dispatch-goal">
          Goal override{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="dispatch-goal"
          name="goal"
          maxLength={4000}
          placeholder="Refine this run's objective. Blank = the worker's standing goal."
          className="min-h-[84px]"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="dispatch-mode">Mode</Label>
          <select
            id="dispatch-mode"
            name="mode"
            defaultValue={defaultMode}
            className={selectClass}
            disabled={disabled}
          >
            <option value="SHADOW">Shadow — dry run</option>
            <option value="LIVE">Live</option>
          </select>
        </div>
        <Button type="submit" disabled={pending || disabled}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          Queue run
        </Button>
      </div>
    </form>
  );
}

// ── Run controls (kill switch / resume) ──────────────────────────────────

export function RunControlButtons({
  runId,
  status,
}: {
  runId: string;
  status: string;
}) {
  const [state, setState] = React.useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = React.useState<string | null>(null);

  const act = async (
    key: string,
    fn: (id: string) => Promise<{ error?: string; ok?: boolean }>
  ) => {
    if (pending) return;
    setPending(key);
    setState({});
    const result = await fn(runId);
    setPending(null);
    setState(result);
  };

  const cancellable = status === "QUEUED" || status === "RUNNING";
  const resumable = status === "NEEDS_APPROVAL";
  if (!cancellable && !resumable) return null;

  return (
    <div className="space-y-3">
      <Notice state={state} />
      <div className="flex flex-wrap gap-2">
        {resumable && (
          <Button
            type="button"
            size="sm"
            onClick={() => act("resume", resumeAgentRun)}
            disabled={pending !== null}
          >
            {pending === "resume" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden />
            )}
            Resume after decision
          </Button>
        )}
        {cancellable && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => act("cancel", cancelAgentRun)}
            disabled={pending !== null}
          >
            {pending === "cancel" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <OctagonX className="h-4 w-4" aria-hidden />
            )}
            Kill run
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Worker configuration ─────────────────────────────────────────────────

export type WorkerConfigDefaults = {
  workerType: "general" | "research" | "ops";
  goal: string;
  instructions: string;
  allow: string;
  deny: string;
  allowDelegation: boolean;
  maxSteps: number;
  maxTokens: number;
  maxCostUsd: number;
  maxDurationMinutes: number;
  maxConcurrentRuns: number;
  maxDepth: number;
  trigger: "MANUAL" | "SCHEDULE" | "WEBHOOK" | "EVENT";
  schedule: string;
};

function csv(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function WorkerConfigForm({
  agentId,
  defaults,
}: {
  agentId: string;
  defaults: WorkerConfigDefaults;
}) {
  const [state, setState] = React.useState<{ error?: string; ok?: boolean }>({});
  const [pending, setPending] = React.useState(false);
  const [trigger, setTrigger] = React.useState(defaults.trigger);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    const num = (key: string, fallback: number) => {
      const raw = String(data.get(key) ?? "").trim();
      const parsed = Number(raw);
      return raw && Number.isFinite(parsed) ? parsed : fallback;
    };
    setPending(true);
    setState({});
    const result = await updateAgentWorkerConfig(agentId, {
      workerType: String(data.get("workerType") ?? defaults.workerType),
      goal: String(data.get("goal") ?? "").trim() || null,
      instructions: String(data.get("instructions") ?? "").trim() || null,
      toolPolicy: {
        allow: csv(String(data.get("allow") ?? "")),
        deny: csv(String(data.get("deny") ?? "")),
        allowDelegation: data.get("allowDelegation") === "on",
      },
      budget: {
        maxSteps: Math.round(num("maxSteps", defaults.maxSteps)),
        maxTokens: Math.round(num("maxTokens", defaults.maxTokens)),
        maxCostMicros: Math.round(num("maxCostUsd", defaults.maxCostUsd) * 1_000_000),
        maxDurationMs: Math.round(num("maxDurationMinutes", defaults.maxDurationMinutes) * 60_000),
        maxConcurrentRuns: Math.round(num("maxConcurrentRuns", defaults.maxConcurrentRuns)),
        maxDepth: Math.round(num("maxDepth", defaults.maxDepth)),
      },
      trigger: String(data.get("trigger") ?? defaults.trigger),
      schedule: String(data.get("schedule") ?? "").trim() || null,
    });
    setPending(false);
    setState(result);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Notice state={state} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cfg-worker-type">Worker type</Label>
          <select
            id="cfg-worker-type"
            name="workerType"
            defaultValue={defaults.workerType}
            className={selectClass}
          >
            <option value="general">General worker</option>
            <option value="research">Research worker</option>
            <option value="ops">Ops worker</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cfg-trigger">Trigger</Label>
          <select
            id="cfg-trigger"
            name="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as WorkerConfigDefaults["trigger"])}
            className={selectClass}
          >
            <option value="MANUAL">Manual</option>
            <option value="SCHEDULE">Schedule — cron</option>
            <option value="WEBHOOK">Webhook</option>
            <option value="EVENT">Event</option>
          </select>
        </div>
        {trigger === "SCHEDULE" && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cfg-schedule">Cron expression</Label>
            <Input
              id="cfg-schedule"
              name="schedule"
              defaultValue={defaults.schedule}
              placeholder="0 6 * * 1-5  (weekdays 06:00, UTC)"
            />
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cfg-goal">Standing goal</Label>
          <Textarea
            id="cfg-goal"
            name="goal"
            defaultValue={defaults.goal}
            maxLength={4000}
            className="min-h-[100px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cfg-instructions">Operator instructions</Label>
          <Textarea
            id="cfg-instructions"
            name="instructions"
            defaultValue={defaults.instructions}
            maxLength={4000}
            className="min-h-[100px]"
          />
        </div>
      </div>

      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Run budgets
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-steps">Max steps</Label>
            <Input id="cfg-max-steps" name="maxSteps" type="number" min={1} max={200} defaultValue={defaults.maxSteps} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-tokens">Max tokens</Label>
            <Input id="cfg-max-tokens" name="maxTokens" type="number" min={1} max={10000000} defaultValue={defaults.maxTokens} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-cost">Max cost (USD / run)</Label>
            <Input id="cfg-max-cost" name="maxCostUsd" type="number" min={0} step="0.01" defaultValue={defaults.maxCostUsd} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-duration">Max duration (min)</Label>
            <Input id="cfg-max-duration" name="maxDurationMinutes" type="number" min={1} max={60} defaultValue={defaults.maxDurationMinutes} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-concurrent">Concurrent runs</Label>
            <Input id="cfg-max-concurrent" name="maxConcurrentRuns" type="number" min={1} max={20} defaultValue={defaults.maxConcurrentRuns} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-max-depth">Delegation depth</Label>
            <Input id="cfg-max-depth" name="maxDepth" type="number" min={0} max={4} defaultValue={defaults.maxDepth} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tool policy
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-allow">
              Allow list{" "}
              <span className="font-normal text-muted-foreground">(comma-separated; blank = worker defaults)</span>
            </Label>
            <Textarea id="cfg-allow" name="allow" defaultValue={defaults.allow} className="min-h-[72px] font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-deny">
              Deny list{" "}
              <span className="font-normal text-muted-foreground">(always wins)</span>
            </Label>
            <Textarea id="cfg-deny" name="deny" defaultValue={defaults.deny} className="min-h-[72px] font-mono text-xs" />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="allowDelegation"
            defaultChecked={defaults.allowDelegation}
            className="h-4 w-4 rounded border-input"
          />
          Allow this worker to delegate subtasks to other agents
        </label>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save configuration
        </Button>
      </div>
    </form>
  );
}

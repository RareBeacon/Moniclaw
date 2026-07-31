"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleMinus,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { useFormState } from "react-dom";

import {
  deleteWorkflow,
  saveWorkflow,
  type AiFormState,
} from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: AiFormState = {};

/** Starter graph: memory recall → ai step conditioned on a check → output. */
const GRAPH_TEMPLATE = JSON.stringify(
  {
    nodes: [
      {
        id: "recall",
        type: "memory",
        config: {
          action: "read",
          query: "{{input.topic}}",
          scope: "LONG_TERM",
          limit: 3,
        },
      },
      {
        id: "draft",
        type: "ai",
        config: {
          system: "You are a precise operations analyst. Use the recalled context when relevant.",
          message:
            "Topic: {{input.topic}}\n\nRecalled context:\n{{recall.results}}\n\nWrite a three-sentence briefing.",
        },
      },
      {
        id: "done",
        type: "output",
        config: { template: "{{draft.text}}" },
      },
    ],
    edges: [
      { from: "recall", to: "draft" },
      { from: "draft", to: "done" },
    ],
  },
  null,
  2
);

type TraceEntry = {
  nodeId: string;
  type: string;
  status: "succeeded" | "failed" | "skipped";
  startedAt: string;
  finishedAt: string;
  output?: unknown;
  error?: string;
};

type RunResult = {
  runId: string;
  status: "SUCCEEDED" | "FAILED";
  output: string | null;
  trace: TraceEntry[];
  latencyMs: number;
};

export function WorkflowEditor({
  workflow,
}: {
  workflow?: { id: string; name: string; description: string | null; definition: string };
}) {
  const [state, formAction] = useFormState(saveWorkflow, initial);
  const [pending, setPending] = React.useState(false);
  const [definition, setDefinition] = React.useState(workflow?.definition ?? "");
  const [clientError, setClientError] = React.useState<string | null>(null);

  React.useEffect(() => setPending(false), [state]);

  const validate = (): boolean => {
    setClientError(null);
    try {
      const parsed = JSON.parse(definition);
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        setClientError("Graph must be an object with `nodes` and `edges` arrays.");
        return false;
      }
      return true;
    } catch (err) {
      setClientError(`Invalid JSON: ${(err as Error).message}`);
      return false;
    }
  };

  return (
    <form
      action={formAction}
      onSubmit={() => {
        if (!validate()) return;
        setPending(true);
      }}
      className="space-y-4"
    >
      {workflow ? <input type="hidden" name="id" value={workflow.id} /> : null}
      <input type="hidden" name="definition" value={definition} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wf-name">Name</Label>
          <Input
            id="wf-name"
            name="name"
            required
            maxLength={80}
            defaultValue={workflow?.name}
            placeholder="Weekly operations briefing"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-desc">Description</Label>
          <Input
            id="wf-desc"
            name="description"
            maxLength={200}
            defaultValue={workflow?.description ?? ""}
            placeholder="What this graph produces"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="wf-definition">Graph definition (JSON)</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setDefinition(GRAPH_TEMPLATE);
              setClientError(null);
            }}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Load starter template
          </Button>
        </div>
        <Textarea
          id="wf-definition"
          value={definition}
          onChange={(e) => setDefinition(e.target.value)}
          spellCheck={false}
          placeholder="Paste a graph, or load the starter template."
          className="min-h-72 font-mono text-xs leading-5"
          required
        />
        <p className="text-xs text-muted-foreground">
          Nodes: prompt · ai · tool · http · condition · loop · wait · memory ·
          output (exactly one output). Reference values with{" "}
          <code className="font-mono">{"{{nodeId.path}}"}</code> and{" "}
          <code className="font-mono">{"{{input.field}}"}</code>.
        </p>
      </div>

      {(state.error || clientError) && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {state.error ?? clientError}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
          Workflow saved.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
        {workflow ? "Save new version" : "Create workflow"}
      </Button>
    </form>
  );
}

export function RunWorkflowPanel({ id }: { id: string }) {
  const [input, setInput] = React.useState('{\n  "topic": "vendor onboarding"\n}');
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RunResult | null>(null);

  const run = async () => {
    setError(null);
    setResult(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Input must be a JSON object.");
      }
    } catch (err) {
      setError(`Invalid input JSON: ${(err as Error).message}`);
      return;
    }
    setRunning(true);
    try {
      const res = await fetch(`/api/ai/workflows/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: parsed }),
      });
      const body = (await res.json()) as
        | { ok: true; data: RunResult }
        | { ok: false; message?: string };
      if (!res.ok || !body.ok) {
        setError("message" in body && body.message ? body.message : `Run failed (${res.status}).`);
      } else {
        setResult(body.data);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`run-input-${id}`}>Run input (JSON)</Label>
        <Textarea
          id={`run-input-${id}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          className="min-h-20 font-mono text-xs leading-5"
        />
      </div>
      <Button type="button" size="sm" onClick={run} disabled={running}>
        {running ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="mr-2 h-4 w-4" aria-hidden />
        )}
        {running ? "Running…" : "Run workflow"}
      </Button>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {result.status === "SUCCEEDED" ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Succeeded
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
                <XCircle className="h-4 w-4" aria-hidden /> Failed
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              run {result.runId.slice(0, 8)} · {result.latencyMs}ms
            </span>
          </div>

          {result.output !== null && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs leading-5">
              {result.output}
            </pre>
          )}

          <ul className="mt-3 space-y-1.5">
            {result.trace.map((t, i) => (
              <li
                key={`${t.nodeId}-${i}`}
                className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
              >
                <TraceIcon status={t.status} />
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-medium">{t.nodeId}</span>
                  <span className="ml-2 text-muted-foreground">{t.type}</span>
                  {t.error && <p className="mt-1 text-red-600">{t.error}</p>}
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(t.finishedAt).getTime() - new Date(t.startedAt).getTime()}ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TraceIcon({ status }: { status: TraceEntry["status"] }) {
  if (status === "succeeded")
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />;
  if (status === "failed")
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden />;
  return <CircleMinus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

export function DeleteWorkflowButton({ id }: { id: string }) {
  const [state, setState] = React.useState<AiFormState>({});
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-muted-foreground hover:text-red-600"
      disabled={pending}
      title={state.error ?? "Delete workflow"}
      onClick={async () => {
        if (!window.confirm("Delete this workflow? Its run history is kept.")) return;
        setPending(true);
        setState(await deleteWorkflow(id));
        setPending(false);
      }}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden />
      )}
      <span className="sr-only">Delete workflow</span>
    </Button>
  );
}

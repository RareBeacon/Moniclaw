"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Loader2, Send, TerminalSquare } from "lucide-react";

import { runPlanAction, runQuickAction, type BrowserFormState } from "@/lib/actions/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flash } from "./forms";

const initial: BrowserFormState = {};

type StreamFrame = {
  type: string; status?: string; seq?: number; attempt?: number; action?: string;
  durationMs?: number; error?: string; healed?: boolean; message?: string;
};

/** Live execution console — pick a session, run actions, watch the SSE stream. */
export function LiveConsole({
  sessions,
  runningExecutions,
}: {
  sessions: Array<{ id: string; browser: string; kind: string; status: string; currentUrl: string | null }>;
  runningExecutions: Array<{ id: string; sessionId: string; status: string; stepCount: number; goal: string | null }>;
}) {
  const [sessionId, setSessionId] = React.useState(sessions[0]?.id ?? "");
  const [executionId, setExecutionId] = React.useState(runningExecutions[0]?.id ?? "");
  const [frames, setFrames] = React.useState<StreamFrame[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const sourceRef = React.useRef<EventSource | null>(null);
  const logRef = React.useRef<HTMLDivElement>(null);

  const stopStream = React.useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
    setStreaming(false);
  }, []);

  React.useEffect(() => stopStream, [stopStream]);

  const startStream = (id: string) => {
    if (!id) return;
    stopStream();
    setFrames([]);
    setStreaming(true);
    const source = new EventSource(`/api/browser/executions/${id}/stream`);
    source.onmessage = (msg) => {
      try {
        const frame = JSON.parse(msg.data) as StreamFrame;
        setFrames((prev) => [...prev.slice(-199), frame]);
        if (frame.type === "done" || frame.type === "timeout") stopStream();
      } catch { /* ignore malformed frame */ }
    };
    source.onerror = () => stopStream();
    sourceRef.current = source;
  };

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [frames]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="session-pick">Session</Label>
          <select
            id="session-pick"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {sessions.length === 0 ? <option value="">No live sessions — create one first</option> : null}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)} · {s.browser} · {s.kind} · {s.currentUrl?.slice(0, 40) ?? "about:blank"}
              </option>
            ))}
          </select>
        </div>

        <QuickActionForm sessionId={sessionId} />
        <PlanRunnerForm sessionId={sessionId} onQueued={(id) => { setExecutionId(id); startStream(id); }} />
      </div>

      <div className="grid gap-3">
        <div className="flex items-end gap-2">
          <div className="grid grow gap-1.5">
            <Label htmlFor="execution-pick">Watch execution</Label>
            <select
              id="execution-pick"
              value={executionId}
              onChange={(e) => setExecutionId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Pick an execution…</option>
              {runningExecutions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id.slice(0, 8)} · {x.status} · {x.stepCount} steps{x.goal ? ` · ${x.goal.slice(0, 30)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={() => startStream(executionId)} disabled={!executionId || streaming}>
            {streaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TerminalSquare className="mr-2 h-4 w-4" />}
            {streaming ? "Streaming" : "Stream"}
          </Button>
        </div>

        <div ref={logRef} className="h-[420px] overflow-y-auto rounded-lg border bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
          {frames.length === 0 ? (
            <p className="text-zinc-500">Stream output appears here — run a plan or attach to a running execution.</p>
          ) : (
            frames.map((f, i) => (
              <div key={i} className="py-0.5">
                {f.type === "status" ? (
                  <span className="text-sky-400">● status → {f.status}{f.error ? ` (${f.error.slice(0, 80)})` : ""}</span>
                ) : f.type === "step" ? (
                  <span className={f.status === "FAILED" ? "text-red-400" : f.healed || f.status === "RECOVERED" ? "text-amber-400" : "text-emerald-400"}>
                    #{f.seq}·a{f.attempt} {f.action} → {f.status}{typeof f.durationMs === "number" ? ` (${f.durationMs}ms)` : ""}{f.healed ? " [healed]" : ""}{f.error ? ` — ${f.error.slice(0, 100)}` : ""}
                  </span>
                ) : f.type === "done" ? (
                  <span className="text-sky-300">■ finished → {f.status}</span>
                ) : (
                  <span className="text-zinc-400">{f.type}: {f.message ?? ""}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function QuickActionForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState(runQuickAction, initial);
  const [pending, setPending] = React.useState(false);
  React.useEffect(() => setPending(false), [state]);
  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="grid gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Quick action (runs inline)</p>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="preset">Preset</Label>
          <select id="preset" name="preset" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="navigate">Navigate</option>
            <option value="screenshot">Screenshot</option>
            <option value="extract_text">Extract text</option>
            <option value="extract_links">Extract links</option>
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="url">URL (navigate only)</Label>
          <Input id="url" name="url" type="url" placeholder="https://example.com" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="fullPage" className="h-4 w-4 rounded border-input" /> Full page (screenshot)
      </label>
      <div>
        <Button type="submit" disabled={pending || !sessionId}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Run
        </Button>
      </div>
      <Flash state={state} />
    </form>
  );
}

function PlanRunnerForm({ sessionId, onQueued }: { sessionId: string; onQueued: (id: string) => void }) {
  const [state, formAction] = useFormState(runPlanAction, initial);
  const [pending, setPending] = React.useState(false);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    setPending(false);
    if (state.ok && state.executionId) {
      onQueued(state.executionId);
      ref.current?.reset();
    }
  }, [state, onQueued]);
  return (
    <form ref={ref} action={formAction} onSubmit={() => setPending(true)} className="grid gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Run a step plan (queued pipeline with recovery + recording)</p>
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="grid gap-1.5">
        <Label htmlFor="goal">Goal (recorded on the execution)</Label>
        <Input id="goal" name="goal" maxLength={500} placeholder="Sign in and export the latest invoice" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="stepsJson">Steps (JSON array of {"{action, args}"})</Label>
        <textarea
          id="stepsJson" name="stepsJson" rows={7} required
          defaultValue={'[\n  {"action":"navigate","args":{"url":"https://example.com"}},\n  {"action":"extract_text","args":{}},\n  {"action":"take_screenshot","args":{"fullPage":true}}\n]'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <Button type="submit" disabled={pending || !sessionId}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Queue plan
        </Button>
      </div>
      <Flash state={state} />
    </form>
  );
}

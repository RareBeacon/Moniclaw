"use client";

import * as React from "react";
import { Loader2, Play } from "lucide-react";

import { setAgentStatus, startRun } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";

const promotable = ["SHADOW", "SUPERVISED", "AUTONOMOUS", "PAUSED"] as const;

export function AgentControls({
  agentId,
  status,
}: {
  agentId: string;
  status: string;
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const changeStatus = async (next: string) => {
    setPending(`status:${next}`);
    setNotice(null);
    const result = await setAgentStatus(agentId, next);
    setPending(null);
    if (result.error) setNotice(result.error);
  };

  const run = async () => {
    setPending("run");
    setNotice(null);
    const result = await startRun(agentId);
    setPending(null);
    setNotice(result.error ?? "Run queued.");
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Change agent status"
          defaultValue=""
          onChange={(e) => changeStatus(e.target.value)}
          disabled={pending !== null}
          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Set status…
          </option>
          {promotable.map((s) => (
            <option key={s} value={s} disabled={s === status}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={pending !== null || status === "DRAFT" || status === "PAUSED"}
          title={
            status === "DRAFT"
              ? "Promote out of draft first"
              : status === "PAUSED"
                ? "Unpause to run"
                : "Queue a run now"
          }
        >
          {pending === "run" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden />
          )}
          Run
        </Button>
      </div>
      {notice && (
        <p role="status" className="max-w-[220px] text-right text-[0.7rem] leading-4 text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}

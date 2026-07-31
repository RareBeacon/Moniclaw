"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import { decideApproval } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [pending, setPending] = React.useState<"APPROVED" | "REJECTED" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const decide = async (decision: "APPROVED" | "REJECTED") => {
    setPending(decision);
    setError(null);
    const result = await decideApproval(approvalId, decision);
    setPending(null);
    if (result.error) setError(result.error);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
          onClick={() => decide("REJECTED")}
          disabled={pending !== null}
        >
          {pending === "REJECTED" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden />
          )}
          Reject
        </Button>
        <Button size="sm" onClick={() => decide("APPROVED")} disabled={pending !== null}>
          {pending === "APPROVED" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          Approve
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[0.7rem] text-destructive">{error}</p>
      )}
    </div>
  );
}

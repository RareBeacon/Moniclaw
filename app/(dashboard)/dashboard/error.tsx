"use client";

import { useEffect } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the observability pipeline once wired; log for now.
    console.error("[dashboard:error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <ServerCrash className="h-7 w-7 text-destructive" aria-hidden />
      </span>
      <div>
        <h1 className="text-xl font-semibold">The workspace hit a snag</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This is usually the database connection — check that{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">DATABASE_URL</code>{" "}
          is set and reachable, then try again.
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        <RefreshCw className="h-4 w-4" aria-hidden />
        Retry
      </Button>
    </div>
  );
}

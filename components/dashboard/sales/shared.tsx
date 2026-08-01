"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared primitives for the sales dashboard client islands. */

export type SalesState = { error?: string; ok?: boolean; id?: string; created?: number };

export function Notice({ state }: { state: SalesState }) {
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
        Saved.
      </p>
    );
  }
  return null;
}

export const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const selectClass = fieldClass;

export const textareaClass =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PendingButton({
  pending,
  children,
  className,
  variant,
  size,
  type = "submit",
  onClick,
  disabled,
}: {
  pending: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn(className)}
      onClick={onClick}
      disabled={pending || disabled}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}

/** Small hook: wraps a server action with pending + notice state. */
export function useSalesAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<SalesState>,
  onSuccess?: (state: SalesState) => void
) {
  const [state, setState] = React.useState<SalesState>({});
  const [pending, setPending] = React.useState(false);

  const run = React.useCallback(
    async (...args: TArgs) => {
      if (pending) return;
      setPending(true);
      setState({});
      try {
        const result = await action(...args);
        setState(result);
        if (result.ok) onSuccess?.(result);
      } catch {
        setState({ error: "Something went wrong — the incident has been logged." });
      } finally {
        setPending(false);
      }
    },
    [action, onSuccess, pending]
  );

  return { state, pending, run };
}

import { cn } from "@/lib/utils";

const agentStatusStyles: Record<string, string> = {
  DRAFT: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  SHADOW: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  SUPERVISED: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  AUTONOMOUS: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PAUSED: "bg-zinc-500/10 text-zinc-500",
  ARCHIVED: "bg-zinc-500/10 text-zinc-500",
};

const runStatusStyles: Record<string, string> = {
  QUEUED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  RUNNING: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  NEEDS_APPROVAL: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  SUCCEEDED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  FAILED: "bg-red-500/10 text-red-600 dark:text-red-400",
  CANCELED: "bg-zinc-500/10 text-zinc-500",
};

const labels: Record<string, string> = {
  NEEDS_APPROVAL: "Needs approval",
};

export function StatusBadge({
  status,
  kind,
  className,
}: {
  status: string;
  kind: "agent" | "run";
  className?: string;
}) {
  const styles = kind === "agent" ? agentStatusStyles : runStatusStyles;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-zinc-500/10 text-zinc-500",
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {labels[status] ?? status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

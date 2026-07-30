import { cn } from "@/lib/utils";

/** Faint engineering grid with radial fade — used behind hero and demo panels. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
    >
      <div className="absolute inset-0 bg-grid mask-radial-fade" />
    </div>
  );
}

/** Soft primary glow, positioned via className. */
export function Glow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full bg-primary/20 blur-[120px] dark:bg-primary/25",
        className
      )}
    />
  );
}

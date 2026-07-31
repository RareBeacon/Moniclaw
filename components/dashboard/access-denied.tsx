import { ShieldAlert } from "lucide-react";

/** Rendered when a role lacks the read capability for a gated page. */
export function AccessDenied({ required }: { required: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/50 px-8 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
        <ShieldAlert className="h-6 w-6 text-amber-500" aria-hidden />
      </span>
      <div>
        <h2 className="font-semibold">Restricted by your role</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
          This area requires <strong className="text-foreground">{required}</strong>{" "}
          access. Ask an Owner or Admin to adjust your role — every change is
          audit-logged, so the request stays quick and clean.
        </p>
      </div>
    </div>
  );
}

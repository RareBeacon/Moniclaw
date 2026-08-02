"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, Check } from "lucide-react";

/**
 * Install a template → mints a real SHADOW/DRAFT worker in the workspace.
 * The confirm step restates the permission manifest so nothing installs
 * without the operator seeing what the worker may touch.
 */
export function InstallButton({
  slug,
  name,
  toolNames,
  disabled,
  installedCount,
}: {
  slug: string;
  name: string;
  toolNames: string[];
  disabled: boolean;
  installedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [installed, setInstalled] = React.useState(false);

  const install = async () => {
    const tools = toolNames.length ? toolNames.join(", ") : "no tools";
    if (
      !window.confirm(
        `Install "${name}"?\n\nIt will be created as a SHADOW worker (dry-run until you promote it) ` +
          `with access to: ${tools}.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${slug}/install`, { method: "POST" });
      const payload = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.message ?? `Install failed (${res.status}).`);
      } else {
        setInstalled(true);
        router.refresh();
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={install}
        disabled={disabled || busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : installed ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        {installed ? "Installed" : installedCount > 0 ? "Install another" : "Install"}
      </button>
      {error && <span className="text-[0.7rem] text-destructive">{error}</span>}
    </span>
  );
}

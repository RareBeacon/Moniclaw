"use client";

import * as React from "react";
import { Download, FileDown, Loader2, Trash2 } from "lucide-react";

import { deleteAsset, generateUsageExport } from "@/lib/actions/files";
import { Button } from "@/components/ui/button";

export function GenerateExportButton() {
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={async () => {
          setPending(true);
          setMessage(null);
          setOk(false);
          const result = await generateUsageExport();
          setPending(false);
          if (result.error) setMessage(result.error);
          else setOk(true);
        }}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden />
        )}
        Export last 90 days (CSV)
      </Button>
      {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
      {ok && (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
          Export ready — see the list below.
        </p>
      )}
    </div>
  );
}

export function DeleteAssetButton({
  assetId,
  canDelete,
}: {
  assetId: string;
  canDelete: boolean;
}) {
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!canDelete) return null;

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        aria-label="Delete file"
        title="Delete file"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await deleteAsset(assetId);
          setPending(false);
          if (result.error) setError(result.error);
        }}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Delete"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Keep
      </Button>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function DownloadLink({ assetId, name }: { assetId: string; name: string }) {
  return (
    <a
      href={`/api/assets/${assetId}`}
      download={name}
      aria-label={`Download ${name}`}
      title={`Download ${name}`}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Download className="h-4 w-4" aria-hidden />
    </a>
  );
}

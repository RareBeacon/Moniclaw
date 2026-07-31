"use client";

import * as React from "react";
import { FileUp, Globe, Loader2, Trash2 } from "lucide-react";

import { ingestKnowledgeFile, type AiFormState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm";

export function KnowledgeUploadForm() {
  const [state, setState] = React.useState<AiFormState>({});
  const [pending, setPending] = React.useState(false);
  const [fileKey, setFileKey] = React.useState(0);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setPending(true);
        const result = await ingestKnowledgeFile(data);
        setState(result);
        setPending(false);
        if (!result.error) setFileKey((k) => k + 1);
      }}
    >
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="kb-file">Upload a document</Label>
        <Input id="kb-file" name="file" type="file" required accept={ACCEPT} key={fileKey} />
        <p className="text-xs text-muted-foreground">
          PDF, DOCX, TXT, MD, CSV, JSON, or HTML — extracted, chunked,
          embedded, and searchable in seconds.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileUp className="mr-2 h-4 w-4" aria-hidden />
        )}
        {pending ? "Indexing…" : "Index document"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

export function KnowledgeUrlForm() {
  const [state, setState] = React.useState<AiFormState>({});
  const [pending, setPending] = React.useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const url = (new FormData(form).get("url") as string)?.trim();
        setPending(true);
        setState({});
        try {
          const res = await fetch("/api/ai/knowledge/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const body = (await res.json()) as
            | { ok: true; data: { document: { title: string; chunkCount: number } } }
            | { ok: false; message?: string };
          if (!res.ok || !body.ok) {
            setState({ error: "message" in body && body.message ? body.message : `Ingest failed (${res.status}).` });
          } else {
            setState({ ok: true, result: `Indexed "${body.data.document.title}" into ${body.data.document.chunkCount} chunks. Reloading…` });
            window.setTimeout(() => window.location.reload(), 900);
          }
        } catch (err) {
          setState({ error: (err as Error).message });
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="kb-url">…or ingest a web page</Label>
        <Input id="kb-url" name="url" type="url" required placeholder="https://docs.example.com/policy" />
        <p className="text-xs text-muted-foreground">
          Fetched through the SSRF-guarded HTTP tool — private networks are blocked.
        </p>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Globe className="mr-2 h-4 w-4" aria-hidden />
        )}
        {pending ? "Fetching…" : "Index page"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

function FormFeedback({ state }: { state: AiFormState }) {
  if (state.error) {
    return (
      <p className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
        {state.result ?? "Done."}
      </p>
    );
  }
  return null;
}

export function DeleteDocumentButton({ id, disabled }: { id: string; disabled: boolean }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-muted-foreground hover:text-red-600"
      disabled={disabled || pending}
      title={error ?? (disabled ? "Requires Manager role" : "Remove document")}
      onClick={async () => {
        if (!window.confirm("Remove this document and its chunks from the knowledge base?")) return;
        setPending(true);
        setError(null);
        try {
          const res = await fetch(`/api/ai/knowledge/documents/${id}`, { method: "DELETE" });
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { message?: string } | null;
            setError(body?.message ?? `Delete failed (${res.status}).`);
          } else {
            window.location.reload();
          }
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="h-4 w-4" aria-hidden />
      )}
      <span className="sr-only">Remove document</span>
    </Button>
  );
}

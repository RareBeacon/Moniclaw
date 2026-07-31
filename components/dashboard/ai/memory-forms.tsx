"use client";

import * as React from "react";
import { Check, Loader2, Search, Trash2 } from "lucide-react";
import { useFormState } from "react-dom";

import { forgetMemory, writeMemory, type AiFormState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AiFormState = {};

export function WriteMemoryForm() {
  const [state, formAction] = useFormState(writeMemory, initial);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    setPending(false);
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} onSubmit={() => setPending(true)} className="mt-4 grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="content">Fact or note</Label>
        <textarea
          id="content"
          name="content"
          required
          minLength={3}
          maxLength={8000}
          rows={3}
          placeholder="e.g. The support team prefers escalation summaries in bullet form, max 120 words."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="scope">Scope</Label>
          <select id="scope" name="scope" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="WORKSPACE">Workspace</option>
            <option value="AGENT">Agent</option>
            <option value="LONG_TERM">Long-term</option>
            <option value="CONVERSATION">Conversation</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="importance">Importance (0–100)</Label>
          <Input id="importance" name="importance" type="number" min={0} max={100} defaultValue={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expiresInDays">Expires in days (optional)</Label>
          <Input id="expiresInDays" name="expiresInDays" type="number" min={1} max={3650} placeholder="never" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tagsCsv">Tags (comma-separated)</Label>
          <Input id="tagsCsv" name="tagsCsv" placeholder="support, tone" />
        </div>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="h-4 w-4" /> {state.result ?? "Stored."}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Store memory
        </Button>
      </div>
    </form>
  );
}

type SearchHit = {
  id: string;
  scope: string;
  content: string;
  score: number;
  similarity: number;
  importance: number;
};

export function MemorySearchForm() {
  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [mode, setMode] = React.useState<string | null>(null);
  const [hits, setHits] = React.useState<SearchHit[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/memory/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message ?? `Search failed (${res.status})`);
      setHits(json.data.memories);
      setMode(json.data.mode);
    } catch (err) {
      setError((err as Error).message);
      setHits(null);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex gap-2"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Recall by meaning — e.g. “how does the team handle refunds?”"
          className="flex-1"
        />
        <Button type="submit" variant="outline" disabled={pending || !query.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>
      {mode && (
        <p className="mt-2 text-xs text-muted-foreground">
          {mode === "semantic" ? "Semantic ranking (vector similarity + importance + recency)" : "Fallback ranking (importance + recency — configure embeddings for semantic recall)"}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {hits && (
        <ul className="mt-3 space-y-2">
          {hits.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nothing in memory matches that. Store the fact directly or let
              conversations accumulate it.
            </li>
          )}
          {hits.map((hit) => (
            <li key={hit.id} className="rounded-lg border p-3 text-sm">
              <p className="leading-6">{hit.content}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {hit.scope.toLowerCase()} · score {hit.score} · similarity {hit.similarity} · importance {hit.importance}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ForgetMemoryButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Forget this memory"
      className="text-muted-foreground transition hover:text-destructive"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await forgetMemory(id);
        setPending(false);
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

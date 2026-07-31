"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useFormState } from "react-dom";
import type { KnowledgeEntry } from "@prisma/client";

import {
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
  type KnowledgeActionState,
} from "@/lib/actions/knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";

const initialState: KnowledgeActionState = {};

type EntrySummary = Pick<
  KnowledgeEntry,
  "id" | "title" | "body" | "tags" | "updatedAt"
> & { author?: string | null };

export function KnowledgeBoard({
  entries,
  canWrite,
}: {
  entries: EntrySummary[];
  canWrite: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [composing, setComposing] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(q) ||
        entry.body.toLowerCase().includes(q) ||
        entry.tags.some((tag) => tag.includes(q))
    );
  }, [entries, query]);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, content, tags…"
            aria-label="Search knowledge"
            className="pl-9"
          />
        </div>
        {canWrite && (
          <Button onClick={() => setComposing((v) => !v)}>
            {composing ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {composing ? "Cancel" : "New entry"}
          </Button>
        )}
      </div>

      {composing && canWrite && (
        <div className="mt-4 rounded-2xl border bg-card p-6">
          <NewEntryForm onDone={() => setComposing(false)} />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {query
            ? `Nothing matches “${query}”.`
            : "No entries yet — write the first one."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/dashboard/knowledge/${entry.id}`}
                className="flex h-full flex-col gap-2.5 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <h2 className="font-semibold">{entry.title}</h2>
                <p className="line-clamp-3 flex-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {entry.body}
                </p>
                <p className="flex flex-wrap items-center gap-2 pt-1 text-[0.7rem] text-muted-foreground">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-secondary px-2 py-0.5">
                      #{tag}
                    </span>
                  ))}
                  <span className="ml-auto">
                    {entry.author ? `${entry.author} · ` : ""}
                    {formatRelative(entry.updatedAt)}
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewEntryForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useFormState(createKnowledgeEntry, initialState);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (state.error) setPending(false);
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="kb-title">Title</Label>
        <Input id="kb-title" name="title" placeholder='e.g. "Refund policy — vendor portal limits"' />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kb-body">Content</Label>
        <Textarea
          id="kb-body"
          name="body"
          placeholder="Write the operational knowledge agents and teammates should cite…"
          className="min-h-[140px]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="kb-tags">
          Tags <span className="text-muted-foreground">(comma-separated, up to 8)</span>
        </Label>
        <Input id="kb-tags" name="tags" placeholder="finance, refunds, vendor-portal" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save entry
      </Button>
    </form>
  );
}

export function EditEntryForm({
  entry,
}: {
  entry: Pick<KnowledgeEntry, "id" | "title" | "body" | "tags">;
}) {
  const [state, setState] = React.useState<KnowledgeActionState>({});
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setSaved(false);
    const result = await updateKnowledgeEntry(entry.id, new FormData(e.currentTarget));
    setPending(false);
    setState(result);
    if (result.ok) setSaved(true);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="edit-kb-title">Title</Label>
        <Input id="edit-kb-title" name="title" defaultValue={entry.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-kb-body">Content</Label>
        <Textarea
          id="edit-kb-body"
          name="body"
          defaultValue={entry.body}
          className="min-h-[200px]"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-kb-tags">Tags</Label>
        <Input id="edit-kb-tags" name="tags" defaultValue={entry.tags.join(", ")} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save changes
        </Button>
        {saved && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function DeleteEntryButton({ entryId, canDelete }: { entryId: string; canDelete: boolean }) {
  const [confirm, setConfirm] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!canDelete) return null;

  return (
    <div className="flex items-center gap-2">
      {confirm ? (
        <>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const result = await deleteKnowledgeEntry(entryId);
              setPending(false);
              if (result.error) setError(result.error);
              else window.location.assign("/dashboard/knowledge");
            }}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Delete permanently
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </Button>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

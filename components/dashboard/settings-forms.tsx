"use client";

import * as React from "react";
import { Check, Loader2, ShieldAlert } from "lucide-react";
import { useFormState } from "react-dom";

import {
  deleteWorkspace,
  updateWorkspaceSettings,
  type ActionState,
} from "@/lib/actions/workspace";
import { BRAND_COLORS } from "@/lib/validations/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: ActionState = {};

const SWATCHES: Record<(typeof BRAND_COLORS)[number], string> = {
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
  blue: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

export function WorkspaceSettingsForm({
  name,
  slug,
  brandColor,
  canEdit,
}: {
  name: string;
  slug: string;
  brandColor: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useFormState(updateWorkspaceSettings, initialState);
  const [selectedColor, setSelectedColor] = React.useState(brandColor);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (state.error) setPending(false);
    if (state.ok) {
      setPending(false);
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-5">
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input id="ws-name" name="name" defaultValue={name} disabled={!canEdit} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ws-slug">Slug</Label>
          <Input
            id="ws-slug"
            name="slug"
            defaultValue={slug}
            disabled={!canEdit}
            aria-describedby="ws-slug-hint"
            spellCheck={false}
          />
          <p id="ws-slug-hint" className="text-xs text-muted-foreground">
            Used in URLs and API calls — lowercase, numbers, hyphens.
          </p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium leading-none">Brand color</legend>
        <input type="hidden" name="brandColor" value={selectedColor} />
        <div className="flex gap-2.5 pt-1" role="radiogroup" aria-label="Brand color">
          {BRAND_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selectedColor === color}
              aria-label={color}
              disabled={!canEdit}
              onClick={() => setSelectedColor(color)}
              className={cn(
                "h-8 w-8 rounded-full transition-all",
                SWATCHES[color],
                selectedColor === color
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : "opacity-60 hover:opacity-100"
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Tinted accents on workspace chrome, invitations, and agent identities.
        </p>
      </fieldset>

      {canEdit && (
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : saved ? (
              <Check className="h-4 w-4 text-emerald-500" aria-hidden />
            ) : null}
            {saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}

export function DeleteWorkspaceForm({ slug }: { slug: string }) {
  const [state, formAction] = useFormState(deleteWorkspace, initialState);
  const [confirmText, setConfirmText] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (state.error) setPending(false);
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={() => setPending(true)}
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <ShieldAlert className="h-4 w-4" aria-hidden />
        Danger zone
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Deleting the workspace archives agents, stops runs, and revokes every
        member&apos;s access. The audit record and exports are retained for
        compliance. This cannot be undone from the UI.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-2">
          <Label htmlFor="confirm-slug">
            Type <span className="font-mono font-semibold">{slug}</span> to confirm
          </Label>
          <Input
            id="confirm-slug"
            name="confirmSlug"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={slug}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || confirmText !== slug}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Delete workspace
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="mt-3 text-xs text-destructive">{state.error}</p>
      )}
    </form>
  );
}

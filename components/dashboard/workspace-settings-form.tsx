"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { useFormState } from "react-dom";

import { renameWorkspace, type ActionState } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

export function WorkspaceSettingsForm({
  currentName,
  canEdit,
}: {
  currentName: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useFormState(renameWorkspace, initialState);
  const [name, setName] = React.useState(currentName);
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
    <form
      action={formAction}
      onSubmit={() => setPending(true)}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="min-w-[240px] flex-1 space-y-2">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          id="workspace-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
        />
        {state.error && (
          <p role="alert" className="text-xs text-destructive">{state.error}</p>
        )}
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={pending || !canEdit || name.trim() === currentName}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : saved ? (
          <Check className="h-4 w-4 text-emerald-500" aria-hidden />
        ) : null}
        {saved ? "Saved" : "Rename"}
      </Button>
    </form>
  );
}

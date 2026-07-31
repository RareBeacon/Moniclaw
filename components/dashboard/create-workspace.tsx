"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useFormState } from "react-dom";

import { createWorkspace, type ActionState } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = {};

/** Shown when a signed-in user has no workspace (e.g. after deletion). */
export function CreateWorkspace() {
  const [state, formAction] = useFormState(createWorkspace, initialState);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (state.error) setPending(false);
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={() => setPending(true)}
      className="mx-auto mt-16 w-full max-w-sm space-y-4"
    >
      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="new-workspace-name">Workspace name</Label>
        <Input
          id="new-workspace-name"
          name="name"
          placeholder="Acme Industries"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending || name.trim().length < 2}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" aria-hidden />
            Create workspace
          </>
        )}
      </Button>
    </form>
  );
}

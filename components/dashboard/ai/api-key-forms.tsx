"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Loader2, XCircle } from "lucide-react";
import { useFormState } from "react-dom";

import { createApiKey, revokeApiKey, type AiFormState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AiFormState = {};

export function CreateApiKeyForm() {
  const [state, formAction] = useFormState(createApiKey, initial);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    setPending(false);
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={() => setPending(true)}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input id="key-name" name="name" required minLength={2} maxLength={60} placeholder="ci-pipeline" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key-ttl">Expires (days, optional)</Label>
          <Input
            id="key-ttl"
            name="expiresInDays"
            type="number"
            min={1}
            max={365}
            placeholder="90"
            className="w-32"
          />
        </div>
        <fieldset className="flex items-center gap-4 pb-2">
          <legend className="sr-only">Scopes</legend>
          {(["read", "write"] as const).map((scope) => (
            <label key={scope} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                defaultChecked={scope === "read"}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {scope}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" aria-hidden />
          )}
          Create key
        </Button>
      </form>

      {state.error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}

      {state.ok && state.result && (
        <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="text-sm font-medium text-emerald-700">
            Key created — copy it now. It will never be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 font-mono text-xs">
              {state.result}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(state.result!);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="mr-1.5 h-4 w-4 text-emerald-600" aria-hidden />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Send it as <code className="font-mono">Authorization: Bearer msk_…</code> — see{" "}
            <a href="/docs#api" className="text-primary underline-offset-4 hover:underline">
              the API docs
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 text-muted-foreground hover:text-red-600"
      disabled={pending}
      title={error ?? "Revoke key"}
      onClick={async () => {
        if (!window.confirm("Revoke this key? Integrations using it stop working immediately.")) return;
        setPending(true);
        const result = await revokeApiKey(id);
        setError(result.error ?? null);
        setPending(false);
      }}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <XCircle className="h-4 w-4" aria-hidden />
      )}
      <span className="sr-only">Revoke key</span>
    </Button>
  );
}

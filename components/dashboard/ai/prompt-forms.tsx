"use client";

import * as React from "react";
import { Check, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { useFormState } from "react-dom";

import {
  deletePromptTemplate,
  publishPromptVersion,
  savePromptTemplate,
  testPromptRender,
  type AiFormState,
} from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AiFormState = {};

type Variable = { name: string; description?: string; default?: string; required?: boolean };

export function PromptEditor() {
  const [state, formAction] = useFormState(savePromptTemplate, initial);
  const [pending, setPending] = React.useState(false);
  const [content, setContent] = React.useState("");
  const [variables, setVariables] = React.useState<Variable[]>([]);
  const [testValues, setTestValues] = React.useState<Record<string, string>>({});
  const [testOutput, setTestOutput] = React.useState<{ rendered: string; warnings: string[] } | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  React.useEffect(() => setPending(false), [state]);

  // Auto-detect {{placeholders}} to bootstrap the variable table.
  const detected = React.useMemo(() => {
    const names = new Set<string>();
    for (const m of content.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
      names.add(m[1]);
    }
    return [...names];
  }, [content]);

  React.useEffect(() => {
    setVariables((prev) => {
      const kept = prev.filter((v) => detected.includes(v.name));
      const added = detected
        .filter((n) => !kept.some((v) => v.name === n))
        .map((n) => ({ name: n, required: false }));
      return [...kept, ...added];
    });
  }, [detected]);

  const runTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestOutput(null);
    const result = await testPromptRender(
      content,
      JSON.stringify(variables),
      JSON.stringify(testValues)
    );
    setTesting(false);
    if (result.error) setTestError(result.error);
    else if (result.result) setTestOutput(JSON.parse(result.result));
  };

  const updateVar = (index: number, patch: Partial<Variable>) =>
    setVariables((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="mt-4 grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Template name</Label>
          <Input id="name" name="name" required minLength={2} placeholder="e.g. Support triage system" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kind">Kind</Label>
          <select id="kind" name="kind" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="TASK">Task</option>
            <option value="AGENT">Agent</option>
            <option value="WORKSPACE">Workspace</option>
            <option value="SYSTEM">System</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="content">Template</Label>
        <textarea
          id="content"
          name="content"
          required
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"You are a triage specialist for {{company}}.\nSummarize the inbound request in {{style}} form."}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{"Variables use {{snake_case}} syntax and are validated at render time."}</p>
      </div>

      {variables.length > 0 && (
        <fieldset className="rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">Variables ({variables.length})</legend>
          <ul className="space-y-3">
            {variables.map((v, i) => (
              <li key={v.name} className="grid items-center gap-2 sm:grid-cols-[160px_1fr_1fr_auto]">
                <code className="rounded bg-muted px-2 py-1 text-xs">{v.name}</code>
                <Input
                  placeholder="Description"
                  value={v.description ?? ""}
                  onChange={(e) => updateVar(i, { description: e.target.value })}
                />
                <Input
                  placeholder="Default value (optional)"
                  value={v.default ?? ""}
                  onChange={(e) => updateVar(i, { default: e.target.value || undefined })}
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={!!v.required}
                    onChange={(e) => updateVar(i, { required: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  required
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <input type="hidden" name="variables" value={JSON.stringify(variables)} />

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Version notes</Label>
        <Input id="notes" name="notes" placeholder="What changed in this version?" />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="h-4 w-4" /> {state.result}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Save as new version
        </Button>
        <Button type="button" variant="outline" onClick={runTest} disabled={testing || !content.trim()}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Test render
        </Button>
      </div>

      {(testOutput || testError) && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Render test</p>
          {testError && <p className="mt-2 text-sm text-destructive">{testError}</p>}
          {testOutput && (
            <>
              {variables.length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {variables.map((v) => (
                    <Input
                      key={v.name}
                      placeholder={`${v.name}${v.required ? " (required)" : ""}`}
                      value={testValues[v.name] ?? ""}
                      onChange={(e) => setTestValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                    />
                  ))}
                </div>
              )}
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-sm leading-6">
                {testOutput.rendered}
              </pre>
              {testOutput.warnings.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-600">
                  {testOutput.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}

export function PublishVersionButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending || done}
      onClick={async () => {
        setPending(true);
        await publishPromptVersion(id);
        setPending(false);
        setDone(true);
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? "Live" : "Publish"}
    </Button>
  );
}

export function DeleteVersionButton({ id }: { id: string }) {
  const [pending, setPending] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Delete version"
      className="text-muted-foreground transition hover:text-destructive"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await deletePromptTemplate(id);
        setPending(false);
      }}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}

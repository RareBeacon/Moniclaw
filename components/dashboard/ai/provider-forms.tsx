"use client";

import * as React from "react";
import {
  Check,
  CircleCheck,
  CircleX,
  Loader2,
  Plug,
  Trash2,
} from "lucide-react";
import { useFormState } from "react-dom";

import {
  createProviderConfig,
  deleteProviderConfig,
  testProviderConfig,
  updateAiSettings,
  updateProviderConfig,
  type AiFormState,
} from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initial: AiFormState = {};

type CatalogItem = {
  id: string;
  label: string;
  requiresKey: boolean;
  freeTier: boolean;
  status: "shipped" | "reserved";
  defaultModel: string;
  defaultBaseUrl: string | null;
};

export function AddProviderForm({ catalog }: { catalog: CatalogItem[] }) {
  const [state, formAction] = useFormState(createProviderFormAdapter, initial);
  const [provider, setProvider] = React.useState("GEMINI");
  const [pending, setPending] = React.useState(false);
  const selected = catalog.find((c) => c.id === provider);

  React.useEffect(() => setPending(false), [state]);

  return (
    <form
      action={formAction}
      onSubmit={() => setPending(true)}
      className="grid gap-4"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="provider">Provider</Label>
          <select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {catalog.map((c) => (
              <option key={c.id} value={c.id} disabled={c.status !== "shipped"}>
                {c.label}
                {c.freeTier ? " · free tier" : ""}
                {c.status !== "shipped" ? " (soon)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="label">Connection name</Label>
          <Input id="label" name="label" placeholder="e.g. Gemini free key" required minLength={2} />
        </div>
      </div>

      {selected?.requiresKey && (
        <div className="grid gap-1.5">
          <Label htmlFor="apiKey">API key</Label>
          <Input id="apiKey" name="apiKey" type="password" placeholder="Paste the key — encrypted at rest, shown nowhere after" required />
          <p className="text-xs text-muted-foreground">
            Gemini free keys: aistudio.google.com · OpenRouter: openrouter.ai/keys
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="defaultModel">Default model</Label>
          <Input id="defaultModel" name="defaultModel" placeholder={selected?.defaultModel ?? "model id"} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="priority">Priority (lower = first)</Label>
          <Input id="priority" name="priority" type="number" min={1} max={999} defaultValue={100} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="baseUrl">Base URL {provider !== "OLLAMA" ? "(optional)" : "*"}</Label>
          <Input
            id="baseUrl"
            name="baseUrl"
            placeholder={selected?.defaultBaseUrl ?? "http://localhost:11434"}
            required={provider === "OLLAMA"}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 rounded border-input" />
        Enable immediately
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="h-4 w-4" /> Connection verified and saved.
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Test & save connection
        </Button>
      </div>
    </form>
  );
}

// Wrap the server action to satisfy useFormState's (state, payload) shape.
async function createProviderFormAdapter(prev: AiFormState, formData: FormData) {
  return createProviderConfig(prev, formData);
}

export function ProviderConfigRow({
  config,
}: {
  config: {
    id: string;
    provider: string;
    label: string;
    enabled: boolean;
    priority: number;
    defaultModel: string | null;
    baseUrl: string | null;
    keyMask: string | null;
    healthStatus: string | null;
    healthCheckedAt: string | null;
    healthError: string | null;
  };
}) {
  const [testing, setTesting] = React.useState(false);
  const [toggling, setToggling] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const test = async () => {
    setTesting(true);
    setMessage(null);
    const result = await testProviderConfig(config.id);
    setTesting(false);
    setMessage(result.error ?? result.result ?? null);
  };

  const toggle = async () => {
    setToggling(true);
    const fd = new FormData();
    fd.set("id", config.id);
    fd.set("enabled", String(!config.enabled));
    await updateProviderConfig({}, fd);
    setToggling(false);
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${config.label}"? Routing will skip it immediately.`)) return;
    await deleteProviderConfig(config.id);
  };

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              config.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
            )}
          >
            <Plug className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {config.label}
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {config.provider}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              priority {config.priority}
              {config.defaultModel ? ` · ${config.defaultModel}` : ""}
              {config.keyMask ? ` · key ${config.keyMask}` : config.baseUrl ? ` · ${config.baseUrl}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HealthBadge status={config.healthStatus} error={config.healthError} />
          <Button type="button" variant="outline" size="sm" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={toggling}>
            {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : config.enabled ? "Disable" : "Enable"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={remove} aria-label={`Remove ${config.label}`}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      {message && (
        <p className={cn("mt-2 text-xs", message.startsWith("Healthy") ? "text-emerald-600" : "text-destructive")}>
          {message}
        </p>
      )}
    </li>
  );
}

function HealthBadge({ status, error }: { status: string | null; error: string | null }) {
  if (status === "ok") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        <CircleCheck className="h-3 w-3" /> healthy
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
        title={error ?? undefined}
      >
        <CircleX className="h-3 w-3" /> error
      </span>
    );
  }
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      untested
    </span>
  );
}

export function AiSettingsForm({
  settings,
  tools,
  toolPermissions,
}: {
  settings: {
    defaultProvider: string | null;
    defaultModel: string;
    memoryMaxRecords: number;
    memoryRetentionDays: number;
    memorySummarizeAfter: number;
    knowledgeMaxDocuments: number;
    knowledgeMaxFileMB: number;
    knowledgeMaxChunksPerDoc: number;
  };
  tools: Array<{ name: string; description: string; mutating: boolean }>;
  toolPermissions: Record<string, boolean>;
}) {
  const [state, formAction] = useFormState(updateAiSettings, initial);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setPending(false);
    if (state.ok) {
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state]);

  const field = (
    id: string,
    label: string,
    defaultValue: string | number,
    opts: { min?: number; max?: number } = {}
  ) => (
    <div className="grid gap-1.5" key={id}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type={typeof defaultValue === "number" ? "number" : "text"}
        defaultValue={defaultValue}
        min={opts.min}
        max={opts.max}
        required
      />
    </div>
  );

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="grid gap-6">
      <div className="grid gap-1.5">
        <Label htmlFor="defaultModel">Default model</Label>
        <Input id="defaultModel" name="defaultModel" defaultValue={settings.defaultModel} required />
        <p className="text-xs text-muted-foreground">
          Used when a request doesn&rsquo;t name a model. Override per-request anywhere.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Memory limits</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {field("memoryMaxRecords", "Max records", settings.memoryMaxRecords, { min: 100 })}
          {field("memoryRetentionDays", "Retention (days)", settings.memoryRetentionDays, { min: 1 })}
          {field("memorySummarizeAfter", "Summarize after (msgs)", settings.memorySummarizeAfter, { min: 10 })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Knowledge limits</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {field("knowledgeMaxDocuments", "Max documents", settings.knowledgeMaxDocuments, { min: 10 })}
          {field("knowledgeMaxFileMB", "Max file (MB)", settings.knowledgeMaxFileMB, { min: 1, max: 100 })}
          {field("knowledgeMaxChunksPerDoc", "Max chunks/doc", settings.knowledgeMaxChunksPerDoc, { min: 100 })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Tool permissions</legend>
        <p className="mt-1 text-xs text-muted-foreground">
          Mutating tools are disabled by default everywhere; read-only tools are
          enabled by default. Explicit choices below override both.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.name} className="flex items-start gap-2.5 rounded-lg border p-3">
              <input
                type="checkbox"
                id={`tool:${tool.name}`}
                name={`tool:${tool.name}`}
                defaultChecked={toolPermissions[tool.name] ?? !tool.mutating}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <label htmlFor={`tool:${tool.name}`} className="text-xs leading-5">
                <span className="block font-medium text-sm">{tool.name}</span>
                <span className="text-muted-foreground">
                  {tool.description.slice(0, 90)}
                  {tool.mutating ? " · mutating" : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

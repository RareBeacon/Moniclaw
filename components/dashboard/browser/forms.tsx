"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { Loader2, Play, Plus, Trash2, UploadCloud, XCircle, RotateCcw } from "lucide-react";

import {
  cancelExecutionAction, closeSessionAction, createProfileAction, createSessionAction,
  deleteDownloadAction, deleteProfileAction, deleteUploadAction, resumeExecutionAction,
  saveBrowserPolicyAction, saveBrowserSettingsAction, stageUploadAction,
  type BrowserFormState,
} from "@/lib/actions/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: BrowserFormState = {};

export function Flash({ state }: { state: BrowserFormState }) {
  if (!state.error && !state.result) return null;
  return (
    <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${state.error ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
      {state.error ?? state.result}
    </p>
  );
}

function Pending({ label }: { label: string }) {
  const [pending, setPending] = React.useState(false);
  return (
    <Button type="submit" size="sm" onClick={() => setPending(true)} disabled={pending}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────

export function CreateSessionForm({ profiles }: { profiles: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useFormState(createSessionAction, initial);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="kind">Isolation</Label>
          <select id="kind" name="kind" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="EPHEMERAL">Ephemeral (default)</option>
            <option value="PERSISTENT">Persistent profile</option>
            <option value="INCOGNITO">Incognito</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="profileId">Profile</Label>
          <select id="profileId" name="profileId" className="h-10 rounded-md border border-input bg-background px-3 text-sm" defaultValue="">
            <option value="">None</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="browser">Browser</Label>
          <select id="browser" name="browser" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Workspace default</option>
            <option value="CHROMIUM">Chromium</option>
            <option value="CHROME">Google Chrome</option>
            <option value="MSEDGE">Microsoft Edge</option>
            <option value="FIREFOX">Firefox</option>
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="startUrl">Start URL (optional, policy-checked)</Label>
        <Input id="startUrl" name="startUrl" type="url" placeholder="https://example.com" />
      </div>
      <div>
        <Pending label="Launch session" />
      </div>
      <Flash state={state} />
    </form>
  );
}

export function CloseSessionButton({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useFormState(closeSessionAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" variant="outline" size="sm" title="Close session">
        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Close
      </Button>
      {state.error ? <span className="ml-2 text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

// ── Profiles ─────────────────────────────────────────────────────────────

export function CreateProfileForm() {
  const [state, formAction] = useFormState(createProfileAction, initial);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={100} placeholder="vendor-portal" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" maxLength={300} placeholder="Logged-in vendor portal session" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="browser">Browser</Label>
          <select id="browser" name="browser" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="CHROMIUM">Chromium</option>
            <option value="CHROME">Google Chrome</option>
            <option value="MSEDGE">Microsoft Edge</option>
            <option value="FIREFOX">Firefox</option>
          </select>
        </div>
      </div>
      <div>
        <Button type="submit" size="sm" variant="outline"><Plus className="mr-1.5 h-3.5 w-3.5" /> New profile</Button>
      </div>
      <Flash state={state} />
    </form>
  );
}

export function DeleteProfileButton({ profileId }: { profileId: string }) {
  const [, formAction] = useFormState(deleteProfileAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="profileId" value={profileId} />
      <Button type="submit" variant="ghost" size="sm" title="Delete profile (wipes stored cookies/storage)">
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </form>
  );
}

// ── Executions ───────────────────────────────────────────────────────────

export function CancelExecutionButton({ executionId }: { executionId: string }) {
  const [, formAction] = useFormState(cancelExecutionAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="executionId" value={executionId} />
      <Button type="submit" variant="outline" size="sm"><XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancel</Button>
    </form>
  );
}

export function ResumeExecutionButton({ executionId }: { executionId: string }) {
  const [state, formAction] = useFormState(resumeExecutionAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="executionId" value={executionId} />
      <Button type="submit" variant="outline" size="sm"><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Resume</Button>
      {state.error ? <span className="ml-2 text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

// ── Files ────────────────────────────────────────────────────────────────

export function StageUploadForm() {
  const [state, formAction] = useFormState(stageUploadAction, initial);
  const [pending, setPending] = React.useState(false);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { setPending(false); if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={formAction} onSubmit={() => setPending(true)} className="flex items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="file">Stage a file for upload_file actions</Label>
        <Input id="file" name="file" type="file" required />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
        Stage file
      </Button>
      <Flash state={state} />
    </form>
  );
}

export function DeleteUploadButton({ id }: { id: string }) {
  const [, formAction] = useFormState(deleteUploadAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-red-500" /></Button>
    </form>
  );
}

export function DeleteDownloadButton({ id }: { id: string }) {
  const [, formAction] = useFormState(deleteDownloadAction, initial);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-red-500" /></Button>
    </form>
  );
}

// ── Settings + policy ────────────────────────────────────────────────────

type Settings = {
  defaultBrowser: string; headless: boolean; actionTimeoutMs: number; executionTimeoutMs: number;
  sessionIdleTimeoutSec: number; maxConcurrentSessions: number; dialogPolicy: string;
  screenshotOnFail: boolean; recordScreenshots: boolean; maxArtifactMB: number;
};

export function BrowserSettingsForm({ settings }: { settings: Settings }) {
  const [state, formAction] = useFormState(saveBrowserSettingsAction, initial);
  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="defaultBrowser">Default browser</Label>
          <select id="defaultBrowser" name="defaultBrowser" defaultValue={settings.defaultBrowser} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="CHROMIUM">Chromium</option>
            <option value="CHROME">Google Chrome</option>
            <option value="MSEDGE">Microsoft Edge</option>
            <option value="FIREFOX">Firefox</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dialogPolicy">Dialog policy</Label>
          <select id="dialogPolicy" name="dialogPolicy" defaultValue={settings.dialogPolicy} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="dismiss">Dismiss JS dialogs</option>
            <option value="accept">Accept JS dialogs</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxConcurrentSessions">Max concurrent sessions</Label>
          <Input id="maxConcurrentSessions" name="maxConcurrentSessions" type="number" min={1} max={10} defaultValue={settings.maxConcurrentSessions} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="actionTimeoutMs">Action timeout (ms)</Label>
          <Input id="actionTimeoutMs" name="actionTimeoutMs" type="number" min={1000} max={120000} step={500} defaultValue={settings.actionTimeoutMs} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="executionTimeoutMs">Execution timeout (ms)</Label>
          <Input id="executionTimeoutMs" name="executionTimeoutMs" type="number" min={5000} max={600000} step={1000} defaultValue={settings.executionTimeoutMs} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sessionIdleTimeoutSec">Idle session TTL (sec)</Label>
          <Input id="sessionIdleTimeoutSec" name="sessionIdleTimeoutSec" type="number" min={30} max={86400} defaultValue={settings.sessionIdleTimeoutSec} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="maxArtifactMB">Artifact cap (MB)</Label>
          <Input id="maxArtifactMB" name="maxArtifactMB" type="number" min={1} max={50} defaultValue={settings.maxArtifactMB} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ["headless", "Headless by default", settings.headless],
          ["screenshotOnFail", "Screenshot on failure", settings.screenshotOnFail],
          ["recordScreenshots", "Screenshot every step", settings.recordScreenshots],
        ] as const).map(([name, label, def]) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} defaultChecked={def} className="h-4 w-4 rounded border-input" />
            {label}
          </label>
        ))}
      </div>
      <div>
        <Pending label="Save settings" />
      </div>
      <Flash state={state} />
    </form>
  );
}

type Policy = {
  readOnly: boolean; navigationOnly: boolean; allowJavascript: boolean; allowDownloads: boolean;
  allowUploads: boolean; allowClipboard: boolean; allowedDomains: string[]; blockedDomains: string[];
  confirmationDomains: string[]; defaultAllowed: boolean;
};

export function BrowserPolicyForm({ policy }: { policy: Policy }) {
  const [state, formAction] = useFormState(saveBrowserPolicyAction, initial);
  return (
    <form action={formAction} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Permission tiers</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["readOnly", "Read-only (extraction/capture only)", policy.readOnly],
            ["navigationOnly", "Navigation only (+ navigate family)", policy.navigationOnly],
            ["allowJavascript", "Allow execute_javascript", policy.allowJavascript],
            ["allowDownloads", "Allow downloads", policy.allowDownloads],
            ["allowUploads", "Allow uploads", policy.allowUploads],
            ["allowClipboard", "Allow clipboard", policy.allowClipboard],
            ["defaultAllowed", "Default-allow unlisted domains", policy.defaultAllowed],
          ] as const).map(([name, label, def]) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={name} defaultChecked={def} className="h-4 w-4 rounded border-input" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        {([
          ["allowedDomains", "Allowlist (one per line, *.example.com)", policy.allowedDomains],
          ["blockedDomains", "Blocklist", policy.blockedDomains],
          ["confirmationDomains", "Confirmation required (approval gate)", policy.confirmationDomains],
        ] as const).map(([name, label, values]) => (
          <div key={name} className="grid gap-1.5">
            <Label htmlFor={name}>{label}</Label>
            <textarea
              id={name} name={name} rows={5}
              defaultValue={values.join("\n")}
              placeholder={"*.example.com\nexample.org"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Evaluation order: blocked &gt; confirmation &gt; allowed &gt; defaultAllowed.</p>
      <div>
        <Pending label="Save policy" />
      </div>
      <Flash state={state} />
    </form>
  );
}

export function RunIcon() { return <Play className="h-4 w-4" />; }

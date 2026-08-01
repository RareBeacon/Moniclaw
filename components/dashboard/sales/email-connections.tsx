"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, CircleAlert, MailCheck, PlugZap, Send, Star, Trash2 } from "lucide-react";

import {
  createEmailConnectionAction,
  deleteEmailConnectionAction,
  sendDraftNowAction,
  updateEmailConnectionAction,
  verifyEmailConnectionAction,
} from "@/lib/actions/sales";
import { SES_REGIONS, sesSmtpHost } from "@/lib/validations/sales";
import { Notice, PendingButton, fieldClass, selectClass, useSalesAction, type SalesState } from "./shared";
import { Button } from "@/components/ui/button";

/**
 * Email connections panel — connect Amazon SES (first-class: region → SMTP
 * host preset, :587 STARTTLS) or ANY SMTP provider (Gmail/Google Workspace,
 * Outlook/365, business mail relays). Passwords are write-only. Verification
 * does a real SMTP handshake and can deliver a real test email. Only
 * human-approved drafts ever flow through a connection.
 */

export interface EmailConnectionView {
  id: string;
  provider: string;
  label: string;
  senderName: string | null;
  senderEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUsername: string | null;
  region: string | null;
  status: string;
  isDefault: boolean;
  lastVerifiedAt: string | Date | null;
  lastError: string | null;
}

export function EmailConnectionsPanel({
  connections,
  canManage,
}: {
  connections: EmailConnectionView[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <MailCheck className="h-4.5 w-4.5 text-primary" aria-hidden />
            Email connections
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your verified Amazon SES identity or any business SMTP account. Approved drafts
            send through the default connection — via email, from YOUR address.
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {connections.length}/10
        </span>
      </div>

      {connections.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <p className="mt-5 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No email connected yet — approved drafts stay drafts until you connect an identity.
        </p>
      )}

      {canManage && <ConnectForm />}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "VERIFIED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
        <CircleAlert className="h-3 w-3" aria-hidden /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      Unverified
    </span>
  );
}

function ConnectionRow({ connection: c, canManage }: { connection: EmailConnectionView; canManage: boolean }) {
  const router = useRouter();
  const refresh = React.useCallback(() => router.refresh(), [router]);
  const verify = useSalesAction(verifyEmailConnectionAction, refresh);
  const setDefault = useSalesAction((id: string) => updateEmailConnectionAction(id, { isDefault: true }), refresh);
  const remove = useSalesAction(deleteEmailConnectionAction, refresh);
  const [testTo, setTestTo] = React.useState("");

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{c.label}</p>
            <StatusBadge status={c.status} />
            {c.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                <Star className="h-3 w-3" aria-hidden /> Default
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {c.provider === "AMAZON_SES" ? `Amazon SES${c.region ? ` · ${c.region}` : ""}` : "SMTP"}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {c.senderName ? `${c.senderName} <${c.senderEmail}>` : c.senderEmail} · {c.smtpHost}:{c.smtpPort}
            {c.smtpSecure ? " (TLS)" : " (STARTTLS)"}
            {c.lastVerifiedAt ? ` · verified ${new Date(c.lastVerifiedAt).toLocaleDateString()}` : ""}
          </p>
          {c.lastError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">Last error: {c.lastError}</p>
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="test recipient (optional)"
              className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
              aria-label={`Test recipient for ${c.label}`}
            />
            <PendingButton
              size="sm"
              variant="outline"
              type="button"
              pending={verify.pending}
              onClick={() => verify.run(c.id, testTo.trim() || undefined)}
            >
              <PlugZap className="h-3.5 w-3.5" aria-hidden />
              {testTo.trim() ? "Verify + send test" : "Verify"}
            </PendingButton>
            {!c.isDefault && (
              <PendingButton
                size="sm"
                variant="ghost"
                type="button"
                pending={setDefault.pending}
                onClick={() => setDefault.run(c.id)}
              >
                Set default
              </PendingButton>
            )}
            <PendingButton
              size="sm"
              variant="ghost"
              type="button"
              pending={remove.pending}
              onClick={() => {
                if (window.confirm(`Remove ${c.senderEmail} from this workspace? Approved drafts will need another connection to send.`)) {
                  remove.run(c.id);
                }
              }}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </PendingButton>
          </div>
        )}
      </div>
      <Notice state={merge(verify.state, setDefault.state, remove.state)} />
    </li>
  );
}

function merge(...states: SalesState[]): SalesState {
  for (const s of states) if (s.error) return s;
  for (const s of states) if (s.ok) return s;
  return {};
}

function ConnectForm() {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(createEmailConnectionAction, () => router.refresh());
  const [provider, setProvider] = React.useState<"AMAZON_SES" | "SMTP">("AMAZON_SES");
  const [region, setRegion] = React.useState<string>("eu-west-1");

  return (
    <form
      className="mt-6 rounded-xl border border-border/70 bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const selectedRegion = String(fd.get("region") || "");
        run({
          provider,
          label: String(fd.get("label") || ""),
          senderName: String(fd.get("senderName") || "") || null,
          senderEmail: String(fd.get("senderEmail") || ""),
          smtpHost: provider === "AMAZON_SES" ? sesSmtpHost(selectedRegion) : String(fd.get("smtpHost") || ""),
          smtpPort: provider === "AMAZON_SES" ? 587 : Number(fd.get("smtpPort") || 587),
          smtpSecure: provider === "AMAZON_SES" ? false : fd.get("smtpSecure") === "on",
          smtpUsername: String(fd.get("smtpUsername") || "") || null,
          password: String(fd.get("password") || "") || null,
          region: provider === "AMAZON_SES" ? selectedRegion : null,
          isDefault: fd.get("isDefault") === "on",
        });
        (e.target as HTMLFormElement).reset();
      }}
    >
      <p className="text-sm font-semibold">Connect an email identity</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-provider">Provider</label>
          <select
            id="ec-provider"
            className={selectClass}
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
          >
            <option value="AMAZON_SES">Amazon SES (verified identity)</option>
            <option value="SMTP">Other SMTP (Gmail, Outlook, business mail…)</option>
          </select>
        </div>
        {provider === "AMAZON_SES" ? (
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-region">SES region</label>
            <select
              id="ec-region"
              name="region"
              className={selectClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {SES_REGIONS.map((r) => (
                <option key={r} value={r}>{r} — {sesSmtpHost(r)}</option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-host">SMTP host</label>
              <input id="ec-host" name="smtpHost" required placeholder="smtp.gmail.com" className={fieldClass} />
            </div>
          </>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-label">Label</label>
          <input id="ec-label" name="label" required placeholder="Founder mail" className={fieldClass} />
        </div>
        {provider === "SMTP" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-port">Port</label>
              <input id="ec-port" name="smtpPort" type="number" min={1} max={65535} defaultValue={587} className={fieldClass} />
            </div>
            <label className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <input name="smtpSecure" type="checkbox" className="h-4 w-4 rounded border-input" />
              SSL/TLS (:465)
            </label>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-sender-email">From address (verified identity)</label>
          <input id="ec-sender-email" name="senderEmail" type="email" required placeholder="you@yourcompany.com" className={fieldClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-sender-name">Sender name (optional)</label>
          <input id="ec-sender-name" name="senderName" placeholder="Ada from Acme" className={fieldClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-username">
            {provider === "AMAZON_SES" ? "SES SMTP username" : "SMTP username"}
          </label>
          <input id="ec-username" name="smtpUsername" autoComplete="off" placeholder={provider === "AMAZON_SES" ? "AKIA…" : "you@yourcompany.com"} className={fieldClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground" htmlFor="ec-password">
            {provider === "AMAZON_SES" ? "SES SMTP password" : "SMTP password / app password"}
          </label>
          <input id="ec-password" name="password" type="password" autoComplete="new-password" placeholder="Stored encrypted — never shown again" className={fieldClass} />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <input name="isDefault" type="checkbox" className="h-4 w-4 rounded border-input" />
        Use as the default sender for approved drafts
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? "Connecting…" : "Connect"}
        </Button>
        <Notice state={state} />
      </div>
    </form>
  );
}

/** Manager "send now" control on an APPROVED/SCHEDULED draft. */
export function SendDraftNowButton({ draftId, disabled }: { draftId: string; disabled?: boolean }) {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(sendDraftNowAction, () => router.refresh());
  return (
    <div className="flex items-center gap-3">
      <PendingButton
        size="sm"
        type="button"
        pending={pending}
        disabled={disabled}
        onClick={() => run(draftId)}
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        Send now
      </PendingButton>
      <Notice state={state} />
    </div>
  );
}

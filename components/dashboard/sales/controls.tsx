"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive, CheckCircle2, FlaskConical, Globe, Loader2, MailCheck,
  Pause, Play, SendHorizonal, Trash2, UserCheck, XCircle,
} from "lucide-react";

import {
  completeActivityAction,
  closeDealAction,
  decideDraftAction,
  deleteCompanyAction,
  deleteContactAction,
  deleteDealAction,
  deleteDraftAction,
  deleteSearchAction,
  enrollContactsAction,
  moveDealAction,
  qualifyContactAction,
  requestResearchAction,
  rescheduleDraftAction,
  saveSearchAction,
  setCampaignStatusAction,
  setEnrollmentStatusAction,
  submitDraftAction,
  updateDraftAction,
} from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice, PendingButton, SalesState, selectClass, useSalesAction } from "./shared";

/** Quick single-purpose controls used by the sales dashboard pages. */

// ── Research ─────────────────────────────────────────────────────────────

export function ResearchButton({ companyId, status }: { companyId: string; status: string }) {
  const router = useRouter();
  const runAction = React.useCallback((id: string) => requestResearchAction(id), []);
  const { state, pending, run } = useSalesAction(runAction, () => router.refresh());
  const busy = pending || status === "QUEUED" || status === "RUNNING";
  return (
    <div className="flex items-center gap-2">
      <PendingButton pending={pending} size="sm" variant={status === "COMPLETED" ? "outline" : "default"}
        type="button" onClick={() => void run(companyId)} disabled={busy}>
        <FlaskConical className="h-3.5 w-3.5" />
        {status === "QUEUED" || status === "RUNNING"
          ? "Researching…"
          : status === "COMPLETED"
            ? "Re-run research"
            : "Research company"}
      </PendingButton>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

// ── Activities ────────────────────────────────────────────────────────────

export function CompleteActivityButton({ activityId }: { activityId: string }) {
  const router = useRouter();
  const action = React.useCallback((id: string) => completeActivityAction(id), []);
  const { pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <PendingButton pending={pending} size="sm" variant="outline" type="button" onClick={() => void run(activityId)}>
      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
    </PendingButton>
  );
}

// ── Contacts ──────────────────────────────────────────────────────────────

export function QualifyContactButton({ contactId, status }: { contactId: string; status: string }) {
  const router = useRouter();
  const action = React.useCallback((id: string) => qualifyContactAction(id), []);
  const { state, pending, run } = useSalesAction(action, () => router.refresh());
  if (status === "QUALIFIED" || status === "CUSTOMER") return null;
  return (
    <div className="flex items-center gap-2">
      <PendingButton pending={pending} size="sm" variant="outline" type="button" onClick={() => void run(contactId)}>
        <UserCheck className="h-3.5 w-3.5" /> Mark qualified
      </PendingButton>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

// ── Deals ─────────────────────────────────────────────────────────────────

export function DealStageSelect({
  dealId,
  stageId,
  stages,
  disabled,
}: {
  dealId: string;
  stageId: string;
  stages: Array<{ id: string; name: string }>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const action = React.useCallback((id: string, next: string) => moveDealAction(id, next), []);
  const { pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <select
      className={selectClass + " h-8 text-xs w-40"}
      value={stageId}
      disabled={pending || disabled}
      onChange={(e) => void run(dealId, e.target.value)}
      aria-label="Move deal to stage"
    >
      {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}

export function CloseDealButtons({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const action = React.useCallback((id: string, status: "WON" | "LOST", lostReason?: string) => closeDealAction(id, status, lostReason), []);
  const { state, pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-8 w-44 text-xs" placeholder="Lost reason (if LOST)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <PendingButton pending={pending} size="sm" type="button" onClick={() => void run(dealId, "WON")}>Won</PendingButton>
      <PendingButton pending={pending} size="sm" variant="outline" type="button" onClick={() => void run(dealId, "LOST", reason || undefined)}>Lost</PendingButton>
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

// ── Campaigns ─────────────────────────────────────────────────────────────

export function CampaignStatusControls({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter();
  const action = React.useCallback((id: string, next: string) => setCampaignStatusAction(id, next), []);
  const { state, pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === "DRAFT" || status === "PAUSED") && (
        <PendingButton pending={pending} size="sm" type="button" onClick={() => void run(campaignId, "ACTIVE")}>
          <Play className="h-3.5 w-3.5" /> Activate
        </PendingButton>
      )}
      {status === "ACTIVE" && (
        <PendingButton pending={pending} size="sm" variant="outline" type="button" onClick={() => void run(campaignId, "PAUSED")}>
          <Pause className="h-3.5 w-3.5" /> Pause
        </PendingButton>
      )}
      {(status === "ACTIVE" || status === "PAUSED") && (
        <PendingButton pending={pending} size="sm" variant="outline" type="button" onClick={() => void run(campaignId, "COMPLETED")}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Complete
        </PendingButton>
      )}
      {status !== "ARCHIVED" && (
        <PendingButton pending={pending} size="sm" variant="ghost" type="button" onClick={() => void run(campaignId, "ARCHIVED")}>
          <Archive className="h-3.5 w-3.5" /> Archive
        </PendingButton>
      )}
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
    </div>
  );
}

export function EnrollForm({
  campaignId,
  contacts,
}: {
  campaignId: string;
  contacts: Array<{ id: string; name: string; status: string; companyId: string | null }>;
}) {
  const router = useRouter();
  const action = React.useCallback((id: string, ids: string[]) => enrollContactsAction(id, ids), []);
  const { state, pending, run } = useSalesAction(action, () => router.refresh());
  const [selected, setSelected] = React.useState<string[]>([]);
  const eligible = contacts.filter((c) => c.status !== "LOST");

  return (
    <div className="grid gap-3">
      <div className="max-h-56 overflow-auto rounded-lg border border-border">
        {eligible.length === 0 && <p className="p-3 text-xs text-muted-foreground">No contacts yet — add contacts first.</p>}
        {eligible.map((c) => (
          <label key={c.id} className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2 text-sm last:border-0 hover:bg-muted/40">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={selected.includes(c.id)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))}
            />
            <span className="flex-1">{c.name}</span>
            <span className="text-xs text-muted-foreground">{c.status}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <PendingButton pending={pending} size="sm" type="button" disabled={selected.length === 0}
          onClick={() => void run(campaignId, selected)}>
          <MailCheck className="h-3.5 w-3.5" /> Enroll {selected.length || ""} contact{selected.length === 1 ? "" : "s"}
        </PendingButton>
        {(state.ok || state.error) && <Notice state={state.created !== undefined ? { ...state, ok: state.ok } : state} />}
        {state.ok && state.created !== undefined && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{state.created} new enrollment{state.created === 1 ? "" : "s"}.</p>
        )}
      </div>
    </div>
  );
}

export function EnrollmentControls({
  campaignId,
  enrollmentId,
  status,
}: {
  campaignId: string;
  enrollmentId: string;
  status: string;
}) {
  const router = useRouter();
  const action = React.useCallback(
    (cid: string, eid: string, next: string) => setEnrollmentStatusAction(cid, eid, next),
    []
  );
  const { pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <div className="flex gap-1.5">
      {status === "ACTIVE" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run(campaignId, enrollmentId, "PAUSED")}>Pause</Button>
      )}
      {status === "PAUSED" && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => void run(campaignId, enrollmentId, "ACTIVE")}>Resume</Button>
      )}
      {(status === "ACTIVE" || status === "PAUSED") && (
        <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => void run(campaignId, enrollmentId, "UNSUBSCRIBED")}>
          Unsubscribe
        </Button>
      )}
    </div>
  );
}

// ── Drafts ────────────────────────────────────────────────────────────────

export function DraftEditor({
  draft,
  canReview,
}: {
  draft: {
    id: string; status: string; channel: string; subject: string | null; body: string;
    scheduledAt: Date | string | null; rejectionNote: string | null;
  };
  canReview: boolean;
}) {
  const router = useRouter();
  const [subject, setSubject] = React.useState(draft.subject ?? "");
  const [body, setBody] = React.useState(draft.body);
  const [note, setNote] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const editable = draft.status === "DRAFT";

  const updateAction = React.useCallback((id: string, patch: { subject?: string | null; body?: string }) => updateDraftAction(id, patch), []);
  const update = useSalesAction(updateAction, () => router.refresh());
  const submit = useSalesAction(submitDraftAction, () => router.refresh());
  const decide = useSalesAction(decideDraftAction, () => router.refresh());
  const reschedule = useSalesAction(rescheduleDraftAction, () => router.refresh());
  const del = useSalesAction(deleteDraftAction, () => router.push("/dashboard/sales/drafts"));

  const error = update.state.error ?? submit.state.error ?? decide.state.error ?? reschedule.state.error ?? del.state.error;

  return (
    <div className="grid gap-4">
      {draft.rejectionNote && (
        <p className="rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          Rejection feedback: {draft.rejectionNote}
        </p>
      )}
      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dr-subject">Subject</Label>
          <Input id="dr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} disabled={!editable} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-body">Body — everything is reviewed by a human before anything can send</Label>
          <Textarea id="dr-body" value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={20000} disabled={!editable} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editable && (
          <>
            <PendingButton pending={update.pending} size="sm" variant="outline" type="button"
              onClick={() => void update.run(draft.id, { subject: subject || null, body })}>
              Save changes
            </PendingButton>
            <PendingButton pending={submit.pending} size="sm" type="button" onClick={() => void submit.run(draft.id)}>
              <SendHorizonal className="h-3.5 w-3.5" /> Submit for review
            </PendingButton>
            <PendingButton pending={del.pending} size="sm" variant="ghost" className="text-destructive" type="button"
              onClick={() => void del.run(draft.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </PendingButton>
          </>
        )}
        {draft.status === "REJECTED" && (
          <>
            <PendingButton pending={update.pending} size="sm" variant="outline" type="button"
              onClick={() => void update.run(draft.id, { subject: subject || null, body })}>
              Save changes
            </PendingButton>
            <PendingButton pending={submit.pending} size="sm" type="button" onClick={() => void submit.run(draft.id)}>
              <SendHorizonal className="h-3.5 w-3.5" /> Resubmit
            </PendingButton>
            <PendingButton pending={del.pending} size="sm" variant="ghost" className="text-destructive" type="button"
              onClick={() => void del.run(draft.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </PendingButton>
          </>
        )}
        {draft.status === "PENDING_REVIEW" && canReview && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <Input className="h-9 flex-1 min-w-52 text-xs" placeholder="Decision note (optional — kept on the audit trail)"
              value={note} onChange={(e) => setNote(e.target.value)} />
            <PendingButton pending={decide.pending} size="sm" variant="outline" className="text-destructive" type="button"
              onClick={() => void decide.run(draft.id, "REJECTED", note || undefined)}>
              <XCircle className="h-3.5 w-3.5" /> Reject
            </PendingButton>
            <PendingButton pending={decide.pending} size="sm" type="button"
              onClick={() => void decide.run(draft.id, "APPROVED", note || undefined)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </PendingButton>
          </div>
        )}
        {draft.status === "PENDING_REVIEW" && !canReview && (
          <p className="text-xs text-muted-foreground">Awaiting a manager&apos;s review.</p>
        )}
        {(draft.status === "APPROVED" || draft.status === "SCHEDULED") && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <Label htmlFor="dr-when" className="text-xs">Send at</Label>
            <Input id="dr-when" type="datetime-local" className="h-9 w-auto text-xs" value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} />
            <PendingButton pending={reschedule.pending} size="sm" variant="outline" type="button" disabled={!scheduledAt}
              onClick={() => void reschedule.run(draft.id, new Date(scheduledAt).toISOString())}>
              Schedule
            </PendingButton>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Saved searches / delete buttons ───────────────────────────────────────

export function SavedSearchControls({
  entity,
  filters,
  searches,
}: {
  entity: "companies" | "contacts" | "deals";
  filters: Record<string, unknown>;
  searches: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const save = useSalesAction(saveSearchAction, () => { setName(""); router.refresh(); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="h-9 w-48 text-xs" placeholder="Save filters as…" value={name} onChange={(e) => setName(e.target.value)} />
      <PendingButton pending={save.pending} size="sm" variant="outline" type="button" disabled={name.trim().length < 2}
        onClick={() => void save.run({ name: name.trim(), entity, filters })}>
        Save search
      </PendingButton>
      {save.state.error && <p role="alert" className="text-xs text-destructive">{save.state.error}</p>}
    </div>
  );
}

export function DeleteSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const action = React.useCallback((sid: string) => deleteSearchAction(sid), []);
  const { pending, run } = useSalesAction(action, () => router.refresh());
  return (
    <Button size="sm" variant="ghost" className="text-destructive h-7" disabled={pending} onClick={() => void run(id)} aria-label="Delete saved search">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

type DeletableKind = "company" | "contact" | "deal";
const DELETE_ACTIONS: Record<DeletableKind, (id: string) => Promise<SalesState>> = {
  company: deleteCompanyAction,
  contact: deleteContactAction,
  deal: deleteDealAction,
};

export function DeleteEntityButton({ kind, id, redirectTo }: { kind: DeletableKind; id: string; redirectTo: string }) {
  const router = useRouter();
  const action = React.useCallback((eid: string) => DELETE_ACTIONS[kind](eid), [kind]);
  const { state, pending, run } = useSalesAction(action, () => router.push(redirectTo));
  return (
    <span className="inline-flex items-center gap-2">
      <PendingButton pending={pending} size="sm" variant="ghost" className="text-destructive" type="button"
        onClick={() => void run(id)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </PendingButton>
      {state.error && <span role="alert" className="text-xs text-destructive">{state.error}</span>}
    </span>
  );
}

/** Small inline refresh control for research/pages when runs are in flight. */
export function RefreshButton() {
  const router = useRouter();
  const [spinning, setSpinning] = React.useState(false);
  return (
    <Button size="sm" variant="outline" type="button"
      onClick={() => { setSpinning(true); router.refresh(); setTimeout(() => setSpinning(false), 800); }}>
      {spinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
      Refresh
    </Button>
  );
}

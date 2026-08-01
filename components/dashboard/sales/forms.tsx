"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import {
  createCampaignAction,
  createCompanyAction,
  createContactAction,
  createDealAction,
  createPipelineAction,
  logActivityAction,
  saveSalesSettingsAction,
  updateCompanyAction,
  updateContactAction,
} from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice, PendingButton, fieldClass, selectClass, textareaClass, useSalesAction } from "./shared";

/** Field→schema conversions live here; actions validate server-side too. */

const csv = (v: FormDataEntryValue | null): string[] =>
  String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const str = (v: FormDataEntryValue | null): string | undefined => {
  const s = String(v ?? "").trim();
  return s || undefined;
};

// ── Company ───────────────────────────────────────────────────────────────

export function CompanyForm({
  companies,
  company,
}: {
  companies?: never;
  company?: {
    id: string; name: string; domain: string | null; industry: string | null;
    size: string | null; geography: string | null; tags: string[];
    segment: string | null; territory: string | null;
  };
}) {
  const router = useRouter();
  const action = React.useCallback(
    async (input: Record<string, unknown>) =>
      company ? updateCompanyAction(company.id, input) : createCompanyAction(input),
    [company]
  );
  const { state, pending, run } = useSalesAction(action, (s) => {
    if (s.id) router.push(`/dashboard/sales/companies/${s.id}`);
    else router.refresh();
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void run({
      name: str(fd.get("name")),
      domain: str(fd.get("domain")) ?? null,
      industry: str(fd.get("industry")) ?? null,
      size: str(fd.get("size")) ?? null,
      geography: str(fd.get("geography")) ?? null,
      tags: csv(fd.get("tags")),
      segment: str(fd.get("segment")) ?? null,
      territory: str(fd.get("territory")) ?? null,
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="co-name">Company name</Label>
        <Input id="co-name" name="name" required minLength={2} maxLength={120} defaultValue={company?.name ?? ""} placeholder="Acme Freight" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-domain">Domain</Label>
        <Input id="co-domain" name="domain" maxLength={200} defaultValue={company?.domain ?? ""} placeholder="acme.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-industry">Industry</Label>
        <Input id="co-industry" name="industry" maxLength={80} defaultValue={company?.industry ?? ""} placeholder="Logistics" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-size">Size band</Label>
        <select id="co-size" name="size" className={selectClass} defaultValue={company?.size ?? ""}>
          <option value="">Unknown</option>
          {["1-10", "11-50", "51-200", "201-1000", "1000+"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-geo">Geography</Label>
        <Input id="co-geo" name="geography" maxLength={120} defaultValue={company?.geography ?? ""} placeholder="Lagos, Nigeria" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-tags">Tags (comma-separated)</Label>
        <Input id="co-tags" name="tags" maxLength={400} defaultValue={company?.tags.join(", ") ?? ""} placeholder="tier-1, outbound-ready" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-segment">Segment</Label>
        <Input id="co-segment" name="segment" maxLength={60} defaultValue={company?.segment ?? ""} placeholder="mid-market" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="co-territory">Territory</Label>
        <Input id="co-territory" name="territory" maxLength={60} defaultValue={company?.territory ?? ""} placeholder="West Africa" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <PendingButton pending={pending}>{company ? "Save changes" : "Create company"}</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Contact ───────────────────────────────────────────────────────────────

export interface CompanyOption { id: string; name: string }

export function ContactForm({
  companies,
  defaultCompanyId,
  contact,
}: {
  companies: CompanyOption[];
  defaultCompanyId?: string | null;
  contact?: {
    id: string; name: string; companyId: string | null; title: string | null;
    email: string | null; linkedinUrl: string | null; phone: string | null; notes: string | null;
  };
}) {
  const router = useRouter();
  const action = React.useCallback(
    async (input: Record<string, unknown>) =>
      contact ? updateContactAction(contact.id, input) : createContactAction(input),
    [contact]
  );
  const { state, pending, run } = useSalesAction(action, (s) => {
    if (s.id) router.push(`/dashboard/sales/contacts/${s.id}`);
    else router.refresh();
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void run({
      name: str(fd.get("name")),
      companyId: str(fd.get("companyId")) ?? null,
      title: str(fd.get("title")) ?? null,
      email: str(fd.get("email")) ?? null,
      linkedinUrl: str(fd.get("linkedinUrl")) ?? null,
      phone: str(fd.get("phone")) ?? null,
      notes: str(fd.get("notes")) ?? null,
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="ct-name">Full name</Label>
        <Input id="ct-name" name="name" required minLength={2} maxLength={120} defaultValue={contact?.name ?? ""} placeholder="Ada Okafor" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-company">Company</Label>
        <select id="ct-company" name="companyId" className={selectClass} defaultValue={contact?.companyId ?? defaultCompanyId ?? ""}>
          <option value="">No company</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-title">Title</Label>
        <Input id="ct-title" name="title" maxLength={120} defaultValue={contact?.title ?? ""} placeholder="VP Operations" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-email">Email (public/authorized only)</Label>
        <Input id="ct-email" name="email" type="email" maxLength={200} defaultValue={contact?.email ?? ""} placeholder="ada@acme.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-linkedin">LinkedIn URL</Label>
        <Input id="ct-linkedin" name="linkedinUrl" type="url" maxLength={300} defaultValue={contact?.linkedinUrl ?? ""} placeholder="https://www.linkedin.com/in/…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ct-phone">Phone</Label>
        <Input id="ct-phone" name="phone" maxLength={40} defaultValue={contact?.phone ?? ""} placeholder="+234 …" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ct-notes">Notes</Label>
        <Textarea id="ct-notes" name="notes" maxLength={4000} defaultValue={contact?.notes ?? ""} placeholder="Context, how sourced, consent basis…" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <PendingButton pending={pending}>{contact ? "Save changes" : "Create contact"}</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Deal ──────────────────────────────────────────────────────────────────

export interface ContactOption { id: string; name: string; companyId: string | null }

export function DealForm({
  companies,
  contacts,
  defaultCompanyId,
}: {
  companies: CompanyOption[];
  contacts: ContactOption[];
  defaultCompanyId?: string | null;
}) {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(createDealAction, (s) => {
    if (s.id) router.push(`/dashboard/sales/deals`);
  });
  const [companyId, setCompanyId] = React.useState(defaultCompanyId ?? "");
  const relevantContacts = contacts.filter((c) => !companyId || c.companyId === companyId || c.companyId === null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const value = str(fd.get("valueUsd"));
    void run({
      companyId,
      primaryContactId: str(fd.get("primaryContactId")) ?? null,
      title: str(fd.get("title")),
      valueUsd: value ? Number(value) : null,
      expectedCloseAt: str(fd.get("expectedCloseAt")) ? new Date(String(fd.get("expectedCloseAt"))).toISOString() : null,
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="dl-company">Company</Label>
        <select id="dl-company" className={selectClass} required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Select a company…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dl-contact">Primary contact</Label>
        <select id="dl-contact" name="primaryContactId" className={selectClass}>
          <option value="">None yet</option>
          {relevantContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="dl-title">Deal title</Label>
        <Input id="dl-title" name="title" required minLength={2} maxLength={200} placeholder="Acme outbound pilot" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dl-value">Value (USD)</Label>
        <Input id="dl-value" name="valueUsd" type="number" min={0} step={100} placeholder="24000" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dl-close">Expected close</Label>
        <Input id="dl-close" name="expectedCloseAt" type="date" />
      </div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <PendingButton pending={pending}>Create deal</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────

export function ActivityForm({
  companyId,
  contactId,
  dealId,
  defaultType = "NOTE",
  companies,
}: {
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  defaultType?: "NOTE" | "TASK" | "CALL" | "MEETING" | "EMAIL" | "REMINDER";
  /** When provided without a fixed companyId, renders a company picker. */
  companies?: CompanyOption[];
}) {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(logActivityAction, () => router.refresh());
  const [type, setType] = React.useState(defaultType);
  const [pickedCompanyId, setPickedCompanyId] = React.useState("");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const due = str(fd.get("dueAt"));
    void run({
      type,
      subject: str(fd.get("subject")),
      body: str(fd.get("body")) ?? null,
      dueAt: due ? new Date(due).toISOString() : null,
      companyId: companyId ?? (pickedCompanyId || null),
      contactId: contactId ?? null,
      dealId: dealId ?? null,
    });
    form.reset();
  };

  const needsPicker = !companyId && !contactId && !dealId;

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ac-type">Type</Label>
          <select id="ac-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {["NOTE", "TASK", "CALL", "MEETING", "EMAIL", "REMINDER"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ac-subject">Subject</Label>
          <Input id="ac-subject" name="subject" required minLength={2} maxLength={200} placeholder={type === "NOTE" ? "What happened?" : "What needs doing?"} />
        </div>
      </div>
      {needsPicker && companies && (
        <div className="space-y-1.5">
          <Label htmlFor="ac-company">Company</Label>
          <select id="ac-company" className={selectClass} required value={pickedCompanyId} onChange={(e) => setPickedCompanyId(e.target.value)}>
            <option value="">Select a company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {type !== "NOTE" && (
        <div className="space-y-1.5">
          <Label htmlFor="ac-due">Due {type === "MEETING" ? "/ starts" : ""}</Label>
          <Input id="ac-due" name="dueAt" type="datetime-local" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ac-body">Details</Label>
        <Textarea id="ac-body" name="body" maxLength={8000} placeholder="Optional detail, links, call notes…" />
      </div>
      <div className="flex items-center gap-3">
        <PendingButton pending={pending} size="sm">Log {type.toLowerCase()}</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export function PipelineForm() {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(createPipelineAction, () => router.refresh());
  const [stages, setStages] = React.useState<Array<{ name: string; winProbability: number }>>([
    { name: "Prospecting", winProbability: 10 },
    { name: "Qualified", winProbability: 25 },
  ]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({ name: str(fd.get("name")), stages });
      }}
      className="grid gap-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="pl-name">Pipeline name</Label>
        <Input id="pl-name" name="name" required minLength={2} maxLength={80} placeholder="Enterprise outbound" />
      </div>
      <div className="space-y-2">
        <Label>Stages (ordered)</Label>
        {stages.map((stage, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={stage.name}
              onChange={(e) => setStages(stages.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))}
              placeholder={`Stage ${i + 1}`}
              className="flex-1"
            />
            <Input
              type="number" min={0} max={100} value={stage.winProbability}
              onChange={(e) => setStages(stages.map((s, j) => (j === i ? { ...s, winProbability: Number(e.target.value) } : s)))}
              className="w-24" title="Win probability %"
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove stage"
              onClick={() => setStages(stages.filter((_, j) => j !== i))} disabled={stages.length <= 1}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setStages([...stages, { name: "", winProbability: 50 }])}>
          <Plus className="h-3.5 w-3.5" /> Add stage
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <PendingButton pending={pending}>Create pipeline</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SettingsForm({
  settings,
}: {
  settings: {
    icpProfile: { industries: string[]; sizes: string[]; geographies: string[]; keywords: string[]; roles: string[] };
    defaultSendWindow: { daysOfWeek: number[]; startHour: number; endHour: number; timezone: string };
    senderName: string | null;
    senderTitle: string | null;
  };
}) {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(saveSalesSettingsAction, () => router.refresh());
  const [days, setDays] = React.useState<number[]>(settings.defaultSendWindow.daysOfWeek);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void run({
      icpProfile: {
        industries: csv(fd.get("industries")),
        sizes: csv(fd.get("sizes")),
        geographies: csv(fd.get("geographies")),
        keywords: csv(fd.get("keywords")),
        roles: csv(fd.get("roles")),
      },
      defaultSendWindow: {
        daysOfWeek: days.length ? days : [1, 2, 3, 4, 5],
        startHour: Number(fd.get("startHour") ?? 9),
        endHour: Number(fd.get("endHour") ?? 17),
        timezone: str(fd.get("timezone")) ?? "UTC",
      },
      senderName: str(fd.get("senderName")) ?? null,
      senderTitle: str(fd.get("senderTitle")) ?? null,
    });
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-8">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-base font-semibold">Ideal customer profile</legend>
        {(
          [
            ["industries", "Industries", "logistics, fintech", settings.icpProfile.industries],
            ["sizes", "Size bands", "51-200, 201-1000", settings.icpProfile.sizes],
            ["geographies", "Geographies", "Nigeria, Ghana", settings.icpProfile.geographies],
            ["keywords", "Keywords", "freight, fulfilment", settings.icpProfile.keywords],
            ["roles", "Buyer roles", "VP Ops, Head of Growth", settings.icpProfile.roles],
          ] as const
        ).map(([key, label, placeholder, value]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`icp-${key}`}>{label} (comma-separated)</Label>
            <Input id={`icp-${key}`} name={key} defaultValue={value.join(", ")} placeholder={placeholder} />
          </div>
        ))}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="text-base font-semibold">Default campaign send window</legend>
        <div className="flex flex-wrap gap-2">
          {DOW.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setDays(days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort())}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${days.includes(i) ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background text-muted-foreground hover:border-primary/50"}`}
              aria-pressed={days.includes(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sw-start">Starts (hour, UTC)</Label>
            <Input id="sw-start" name="startHour" type="number" min={0} max={23} defaultValue={settings.defaultSendWindow.startHour} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sw-end">Ends (hour, UTC)</Label>
            <Input id="sw-end" name="endHour" type="number" min={0} max={23} defaultValue={settings.defaultSendWindow.endHour} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sw-tz">Timezone label</Label>
            <Input id="sw-tz" name="timezone" maxLength={60} defaultValue={settings.defaultSendWindow.timezone} placeholder="UTC" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Windows are evaluated in UTC — campaigns inherit this unless they override it.</p>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-base font-semibold">Sender identity (used in templates)</legend>
        <div className="space-y-1.5">
          <Label htmlFor="se-name">Sender name</Label>
          <Input id="se-name" name="senderName" maxLength={120} defaultValue={settings.senderName ?? ""} placeholder="Tunde Adeyemi" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="se-title">Sender title</Label>
          <Input id="se-title" name="senderTitle" maxLength={120} defaultValue={settings.senderTitle ?? ""} placeholder="Account Executive" />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <PendingButton pending={pending}>Save settings</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Campaign (create with steps editor) ───────────────────────────────────

export interface StepDraft {
  kind: "DRAFT_EMAIL" | "LINKEDIN_CONNECT" | "TASK" | "WAIT";
  subject: string;
  bodyTemplate: string;
  delayValue: number;
  delayUnit: "HOURS" | "DAYS";
}

export function CampaignForm() {
  const router = useRouter();
  const { state, pending, run } = useSalesAction(createCampaignAction, (s) => {
    if (s.id) router.push(`/dashboard/sales/campaigns/${s.id}`);
  });
  const [steps, setSteps] = React.useState<StepDraft[]>([
    {
      kind: "DRAFT_EMAIL",
      subject: "{{companyName}} × MoniClaw",
      bodyTemplate: "Hi {{contactFirstName}},\n\nSaw {{companyName}} in {{companyIndustry}} — {{senderName}} here from {{workspaceName}}. Worth a 15-minute chat?\n\nBest,\n{{senderName}}",
      delayValue: 0,
      delayUnit: "DAYS",
    },
  ]);

  const patch = (i: number, part: Partial<StepDraft>) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...part } : s)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({
          name: str(fd.get("name")),
          goal: str(fd.get("goal")) ?? null,
          dailyCap: Number(fd.get("dailyCap") ?? 20),
          sendWindow: {
            daysOfWeek: [1, 2, 3, 4, 5],
            startHour: Number(fd.get("startHour") ?? 9),
            endHour: Number(fd.get("endHour") ?? 17),
            timezone: "UTC",
          },
          knowledgeContext: str(fd.get("knowledgeContext")) ?? null,
          steps: steps.map((s, order) => ({
            order,
            kind: s.kind,
            subject: s.subject || null,
            bodyTemplate: s.bodyTemplate || null,
            delayValue: s.delayValue,
            delayUnit: s.delayUnit,
            condition: {},
          })),
        });
      }}
      className="grid gap-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cp-name">Campaign name</Label>
          <Input id="cp-name" name="name" required minLength={2} maxLength={120} placeholder="Q3 Logistics Outbound" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-goal">Goal (drives reports)</Label>
          <Input id="cp-goal" name="goal" maxLength={400} placeholder="Book 12 discovery calls" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp-cap">Daily draft cap</Label>
          <Input id="cp-cap" name="dailyCap" type="number" min={1} max={200} defaultValue={20} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-start">Send from (UTC hour)</Label>
            <Input id="cp-start" name="startHour" type="number" min={0} max={23} defaultValue={9} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-end">Send until</Label>
            <Input id="cp-end" name="endHour" type="number" min={0} max={23} defaultValue={17} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-kc">Playbook query (optional — knowledge hits are attached to each draft)</Label>
        <Input id="cp-kc" name="knowledgeContext" maxLength={1000} placeholder="logistics outbound playbook" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Sequence steps</Label>
          <Button type="button" variant="outline" size="sm"
            onClick={() => setSteps([...steps, { kind: "WAIT", subject: "", bodyTemplate: "", delayValue: 2, delayUnit: "DAYS" }])}>
            <Plus className="h-3.5 w-3.5" /> Add step
          </Button>
        </div>
        {steps.map((s, i) => (
          <div key={i} className="rounded-xl border border-border p-4 grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
                <select className={selectClass} value={s.kind} onChange={(e) => patch(i, { kind: e.target.value as StepDraft["kind"] })}>
                  <option value="DRAFT_EMAIL">Draft email (review)</option>
                  <option value="LINKEDIN_CONNECT">LinkedIn message (review)</option>
                  <option value="TASK">Create task</option>
                  <option value="WAIT">Wait</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">then wait</span>
                <Input type="number" min={0} max={365} className="w-20" value={s.delayValue}
                  onChange={(e) => patch(i, { delayValue: Number(e.target.value) })} />
                <select className={selectClass + " w-24"} value={s.delayUnit} onChange={(e) => patch(i, { delayUnit: e.target.value as "HOURS" | "DAYS" })}>
                  <option value="HOURS">hours</option>
                  <option value="DAYS">days</option>
                </select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove step"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {s.kind !== "WAIT" && (
              <Input value={s.subject} onChange={(e) => patch(i, { subject: e.target.value })}
                placeholder={s.kind === "TASK" ? "Task subject — {{…}} allowed" : "Subject — {{companyName}} etc."} maxLength={200} />
            )}
            {(s.kind === "DRAFT_EMAIL" || s.kind === "LINKEDIN_CONNECT") && (
              <Textarea value={s.bodyTemplate} onChange={(e) => patch(i, { bodyTemplate: e.target.value })}
                placeholder="Hi {{contactFirstName}}, … — placeholders: contactFirstName, contactName, contactTitle, contactEmail, companyName, companyDomain, companyIndustry, companySummary, senderName, senderTitle, workspaceName"
                className={textareaClass} />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <PendingButton pending={pending}>Create campaign (starts as DRAFT)</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Draft composer (manual) ───────────────────────────────────────────────

export function DraftComposeForm({
  companyId,
  contactId,
  defaultChannel = "EMAIL",
}: {
  companyId?: string | null;
  contactId?: string | null;
  defaultChannel?: "EMAIL" | "LINKEDIN";
}) {
  const router = useRouter();
  const action = React.useCallback(
    async (input: Record<string, unknown>) => (await import("@/lib/actions/sales")).createDraftAction(input),
    []
  );
  const { state, pending, run } = useSalesAction(action, (s) => {
    if (s.id) router.push(`/dashboard/sales/drafts/${s.id}`);
  });
  const [channel, setChannel] = React.useState<"EMAIL" | "LINKEDIN">(defaultChannel);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void run({
          channel,
          subject: str(fd.get("subject")) ?? null,
          body: (fd.get("body") ?? "").toString(),
          contactId: contactId ?? null,
          companyId: companyId ?? null,
        });
      }}
      className="grid gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="dc-channel">Channel</Label>
          <select id="dc-channel" className={selectClass} value={channel} onChange={(e) => setChannel(e.target.value as "EMAIL" | "LINKEDIN")}>
            <option value="EMAIL">Email</option>
            <option value="LINKEDIN">LinkedIn</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="dc-subject">Subject</Label>
          <Input id="dc-subject" name="subject" maxLength={300} placeholder="Acme Freight × MoniClaw" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-body">Body</Label>
        <Textarea id="dc-body" name="body" required minLength={10} maxLength={20000} rows={8}
          placeholder="Hi Ada, …" />
        <p className="text-[0.7rem] text-muted-foreground">
          Saves as DRAFT — submit for review when ready. Nothing sends without a manager&apos;s approval.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <PendingButton pending={pending} size="sm">Save draft</PendingButton>
        <Notice state={state} />
      </div>
    </form>
  );
}

// ── Campaign steps editor (detail page; replaces the sequence) ────────────

export function CampaignStepsEditor({
  campaignId,
  initial,
  disabled,
}: {
  campaignId: string;
  initial: StepDraft[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const action = React.useCallback(
    async (id: string, steps: unknown) => (await import("@/lib/actions/sales")).replaceCampaignStepsAction(id, steps),
    []
  );
  const { state, pending, run } = useSalesAction(action, () => router.refresh());
  const [steps, setSteps] = React.useState<StepDraft[]>(initial);
  const patch = (i: number, part: Partial<StepDraft>) =>
    setSteps(steps.map((s, j) => (j === i ? { ...s, ...part } : s)));

  if (disabled) return null;

  return (
    <div className="grid gap-3">
      {steps.map((s, i) => (
        <div key={i} className="rounded-xl border border-border p-4 grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Step {i + 1}</span>
              <select className={selectClass} value={s.kind} onChange={(e) => patch(i, { kind: e.target.value as StepDraft["kind"] })}>
                <option value="DRAFT_EMAIL">Draft email (review)</option>
                <option value="LINKEDIN_CONNECT">LinkedIn message (review)</option>
                <option value="TASK">Create task</option>
                <option value="WAIT">Wait</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">then wait</span>
              <Input type="number" min={0} max={365} className="w-20" value={s.delayValue}
                onChange={(e) => patch(i, { delayValue: Number(e.target.value) })} />
              <select className={selectClass + " w-24"} value={s.delayUnit} onChange={(e) => patch(i, { delayUnit: e.target.value as "HOURS" | "DAYS" })}>
                <option value="HOURS">hours</option>
                <option value="DAYS">days</option>
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove step"
                onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {s.kind !== "WAIT" && (
            <Input value={s.subject} onChange={(e) => patch(i, { subject: e.target.value })} placeholder="Subject — {{companyName}} etc." maxLength={200} />
          )}
          {(s.kind === "DRAFT_EMAIL" || s.kind === "LINKEDIN_CONNECT") && (
            <Textarea value={s.bodyTemplate} onChange={(e) => patch(i, { bodyTemplate: e.target.value })} className={textareaClass} />
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm"
          onClick={() => setSteps([...steps, { kind: "WAIT", subject: "", bodyTemplate: "", delayValue: 2, delayUnit: "DAYS" }])}>
          <Plus className="h-3.5 w-3.5" /> Add step
        </Button>
        <PendingButton pending={pending} size="sm" type="button"
          onClick={() => void run(campaignId, steps.map((s, order) => ({
            order, kind: s.kind, subject: s.subject || null, bodyTemplate: s.bodyTemplate || null,
            delayValue: s.delayValue, delayUnit: s.delayUnit, condition: {},
          })))}>
          Save sequence
        </PendingButton>
        <Notice state={state} />
      </div>
      <p className="text-[0.7rem] text-muted-foreground">Paused/draft campaigns only — the full sequence is replaced atomically.</p>
    </div>
  );
}

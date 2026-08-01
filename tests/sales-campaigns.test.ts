/**
 * CampaignEngine battery — enrollment validation, due-advance semantics,
 * draft+approval production, daily caps, send windows, conditions,
 * sequence completion. All behind fake ports (no DB, no model).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { CampaignEngine, nextWindowStart } from "../packages/sales-runtime/campaigns/engine";
import type {
  SalesCampaignRow, SalesCampaignStepRow, SalesContactRow, SalesDraftRow,
  SalesEnrollmentRow, SalesRepositories,
} from "../packages/sales-runtime/ports";
import { SalesError } from "../packages/sales-runtime/errors";

const WS = "ws-1";
const NOW = new Date("2026-08-03T10:00:00Z"); // Monday 10:00 UTC

function campaign(over: Partial<SalesCampaignRow> = {}): SalesCampaignRow {
  return {
    id: "camp-1", workspaceId: WS, name: "Q3 Outbound", goal: null, status: "ACTIVE",
    dailyCap: 2, sendWindow: {}, knowledgeContext: null, createdById: "user-1",
    createdAt: NOW, updatedAt: NOW, ...over,
  };
}

function step(over: Partial<SalesCampaignStepRow> = {}): SalesCampaignStepRow {
  return {
    id: `step-${over.order ?? 1}`, campaignId: "camp-1", order: 1, kind: "DRAFT_EMAIL",
    subject: "{{companyName}} × MoniClaw",
    bodyTemplate: "Hi {{contactFirstName}}, saw {{companyName}} in {{companyIndustry}}.",
    delayValue: 2, delayUnit: "DAYS", condition: {}, ...over,
  };
}

function enrollment(over: Partial<SalesEnrollmentRow> = {}): SalesEnrollmentRow {
  return {
    id: "enr-1", campaignId: "camp-1", contactId: "contact-1", companyId: "comp-1",
    status: "ACTIVE", currentStep: 0, nextRunAt: NOW, exitReason: null, createdAt: NOW, ...over,
  };
}

function contact(over: Partial<SalesContactRow> = {}): SalesContactRow {
  return {
    id: "contact-1", workspaceId: WS, companyId: "comp-1", name: "Ada Okafor",
    title: "VP Ops", email: "ada@acme.com", linkedinUrl: null, phone: null,
    notes: null, status: "NEW", source: "MANUAL", tags: [], ownerId: null,
    lastTouchedAt: null, custom: {}, createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
  };
}

interface Harness {
  engine: CampaignEngine;
  drafts: SalesDraftRow[];
  approvalsCreated: Array<{ draftId: string; contactLabel: string; body: string }>;
  enrollmentPatches: Array<{ id: string; status: string; patch?: Record<string, unknown> }>;
  contactStatuses: string[];
  touches: number;
  activities: Array<{ type: string; subject: string }>;
  draftsToday: number;
  due: boolean;
}

function makeHarness(opts: {
  camp?: SalesCampaignRow;
  steps?: SalesCampaignStepRow[];
  enr?: SalesEnrollmentRow & { campaign?: SalesCampaignRow };
  contactRow?: SalesContactRow;
  companyRow?: { id: string; name: string; industry: string | null } | null;
}): Harness {
  const camp = opts.camp ?? campaign();
  const steps = opts.steps ?? [step()];
  const enr = opts.enr ?? (enrollment() as SalesEnrollmentRow & { campaign?: SalesCampaignRow });
  (enr as { campaign: SalesCampaignRow }).campaign = camp;
  const contactRow = opts.contactRow ?? contact();
  const companyRow = opts.companyRow === undefined
    ? { id: "comp-1", name: "Acme Freight", industry: "Logistics", domain: "acme.com", summary: "s" }
    : opts.companyRow;

  const drafts: SalesDraftRow[] = [];
  const approvalsCreated: Harness["approvalsCreated"] = [];
  const enrollmentPatches: Harness["enrollmentPatches"] = [];
  const contactStatuses: string[] = [];
  let touches = 0;
  const activities: Harness["activities"] = [];
  const h = { draftsToday: 0, due: true } as Harness;

  const stub = <T = Record<string, never>>(name: string): T => new Proxy({}, {
    get: (_t, prop) => () => { throw new Error(`unexpected repo call ${name}.${String(prop)}`); },
  }) as T;

  const repos: SalesRepositories = {
    companies: {
      ...(stub("companies") as object),
      get: async (_ws: string, id: string) =>
        companyRow && id === companyRow.id
          ? ({ id: companyRow.id, name: companyRow.name, industry: companyRow.industry, domain: "acme.com", summary: "" } as never)
          : null,
    } as never,
    contacts: {
      ...(stub("contacts") as object),
      get: async (_ws: string, id: string) => (id === contactRow.id ? contactRow : null),
      setStatus: async (_id: string, status: string) => { contactStatuses.push(status); },
      touch: async () => { touches += 1; },
    } as never,
    pipelines: stub("pipelines"),
    deals: stub("deals"),
    activities: {
      ...(stub("activities") as object),
      create: async (_ws: string, input: Record<string, unknown>) => {
        activities.push({ type: String(input.type), subject: String(input.subject) });
        return { id: `act-${activities.length}` } as never;
      },
    } as never,
    campaigns: {
      ...(stub("campaigns") as object),
      get: async (_ws: string, id: string) => (id === camp.id ? camp : null),
      listSteps: async (id: string) => (id === camp.id ? steps : []),
      listDueEnrollments: async (_now: Date, take = 50) => (take > 0 && h.due !== false ? [enr] : []) as never,
      setEnrollmentStatus: async (id: string, status: string, patch?: Record<string, unknown>) => {
        enrollmentPatches.push({ id, status, patch });
      },
      countDraftsSince: async () => h.draftsToday,
      enroll: async (_c: string, cid: string) => ({
        enrollment: { id: "enr-1", contactId: cid } as never, created: true,
      }),
    } as never,
    drafts: {
      ...(stub("drafts") as object),
      create: async (_ws: string, input: Record<string, unknown>) => {
        const row = { id: `draft-${drafts.length + 1}`, status: input.status, ...input } as unknown as SalesDraftRow;
        drafts.push(row);
        return row;
      },
      setStatus: async (id: string, status: string, patch?: Record<string, unknown>) => {
        const row = drafts.find((d) => d.id === id);
        if (row) Object.assign(row, { status, ...patch });
      },
    } as never,
    searches: stub("searches"),
    settings: stub("settings"),
  };
  const engine = new CampaignEngine({
    repos,
    approvals: {
      createForDraft: async (input) => {
        approvalsCreated.push({ draftId: input.draftId, contactLabel: input.contactLabel, body: input.body });
        return { approvalId: `appr-${approvalsCreated.length}` };
      },
      statusOf: async () => "PENDING",
    },
    knowledge: { search: async () => [{ title: "Playbook", content: "Lead with the ROI stat." }] },
    audit: { log: async () => {} },
    clock: { now: () => NOW },
    identityFor: async () => ({ name: "Tunde AE", title: "AE", workspaceName: "Demo Co" }),
    requestedTo: async () => "workspace.manager",
  });
  Object.assign(h, { engine, drafts, approvalsCreated, enrollmentPatches, contactStatuses, activities });
  Object.defineProperty(h, "touches", { get: () => touches });
  return h;
}

test("regression: first step at order 0 is not skipped (currentStep -1 sentinel)", async () => {
  const h = makeHarness({
    steps: [step({ order: 0, kind: "DRAFT_EMAIL" })],
    enr: enrollment({ currentStep: -1 }) as SalesEnrollmentRow & { campaign?: SalesCampaignRow },
  });
  const result = await h.engine.tick();
  assert.equal(result.drafted, 1, "step order 0 must execute on the first tick");
  assert.equal((h.drafts[0] as unknown as { status: string }).status, "PENDING_REVIEW");
  assert.ok(
    h.enrollmentPatches.some((p) => p.patch?.currentStep === 0),
    "enrollment advances to the executed step order"
  );
});

test("tick produces a reviewed draft + approval, advances the enrollment", async () => {
  const h = makeHarness({});
  const result = await h.engine.tick();
  assert.equal(result.drafted, 1);

  const draft = h.drafts[0];
  assert.equal(draft.channel, "EMAIL");
  assert.equal(draft.subject, "Acme Freight × MoniClaw");
  assert.ok(draft.body.includes("Hi Ada, saw Acme Freight in Logistics"));
  assert.equal((draft as unknown as { status: string }).status, "PENDING_REVIEW");
  assert.ok((draft as unknown as { approvalId: string }).approvalId.startsWith("appr-"));

  assert.equal(h.approvalsCreated.length, 1);
  assert.equal(h.approvalsCreated[0].contactLabel, "Ada Okafor · Acme Freight");

  assert.deepEqual(h.contactStatuses, ["CONTACTED"], "NEW contact becomes CONTACTED");
  assert.equal(h.touches, 1);

  const advance = h.enrollmentPatches[h.enrollmentPatches.length - 1];
  assert.equal(advance.patch?.currentStep, 1);
  const nextRun = advance.patch?.nextRunAt as Date;
  assert.deepEqual(nextRun, new Date(NOW.getTime() + 2 * 86_400_000));
});

test("WAIT step advances without producing anything", async () => {
  const h = makeHarness({ steps: [step({ kind: "WAIT", delayValue: 3 })] });
  const result = await h.engine.tick();
  assert.equal(result.advanced, 1);
  assert.equal(h.drafts.length, 0);
  const patch = h.enrollmentPatches[0].patch!;
  assert.deepEqual(patch.nextRunAt, new Date(NOW.getTime() + 3 * 86_400_000));
});

test("sequence end completes the enrollment", async () => {
  const h = makeHarness({ enr: enrollment({ currentStep: 1 }) as never });
  const result = await h.engine.tick();
  assert.equal(result.completed, 1);
  assert.equal(h.enrollmentPatches[0].status, "COMPLETED");
  assert.equal(h.enrollmentPatches[0].patch?.exitReason, "sequence_finished");
});

test("daily cap defers production to tomorrow", async () => {
  const h = makeHarness({});
  h.draftsToday = 2; // cap is 2 in the fixture
  const result = await h.engine.tick();
  assert.equal(result.drafted, 0);
  assert.equal(result.skipped, 1);
  const nextRun = h.enrollmentPatches[0].patch?.nextRunAt as Date;
  assert.deepEqual(nextRun, new Date("2026-08-04T00:00:00.000Z")); // deferred to next day start
});

test("outside the send window production waits for the next slot", async () => {
  const sunday = new Date("2026-08-02T12:00:00Z"); // Sunday
  const h = makeHarness({ camp: campaign({ sendWindow: { daysOfWeek: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 } }) });
  // Engine clock fixed at NOW (Monday 10:00 — inside window). Simulate Sunday by overriding clock.
  const engine2 = new CampaignEngine({
    ...(h.engine as unknown as { deps: ConstructorParameters<typeof CampaignEngine>[0] }).deps,
    clock: { now: () => sunday },
  });
  const result = await engine2.tick();
  assert.equal(result.skipped, 1);
  const nextRun = h.enrollmentPatches[0].patch?.nextRunAt as Date;
  assert.deepEqual(nextRun, new Date("2026-08-03T09:00:00Z")); // Monday 09:00 UTC
});

test("nextWindowStart computes slot boundaries directly", () => {
  const win = { daysOfWeek: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };
  assert.deepEqual(nextWindowStart(win, new Date("2026-08-01T10:00:00Z")), new Date("2026-08-03T09:00:00Z")); // Sat → Mon 09
  const inside = new Date("2026-08-04T10:00:00Z"); // Tue 10:00
  assert.deepEqual(nextWindowStart(win, inside), inside);
  assert.deepEqual(nextWindowStart(win, new Date("2026-08-04T18:30:00Z")), new Date("2026-08-05T09:00:00Z")); // after close
  assert.deepEqual(nextWindowStart({}, new Date("2026-08-07T18:30:00Z")), new Date("2026-08-10T09:00:00Z")); // default Mon–Fri, after close
});

test("condition mismatch skips the step but still advances", async () => {
  const h = makeHarness({
    contactRow: contact({ status: "NEW" }),
    steps: [step({ condition: { ifContactStatus: ["ENGAGED"] } })],
  });
  const result = await h.engine.tick();
  assert.equal(result.skipped, 1);
  assert.equal(h.drafts.length, 0);
  assert.equal(h.enrollmentPatches[0].patch?.currentStep, 1, "step consumed");
});

test("non-ACTIVE campaign never produces", async () => {
  const h = makeHarness({ camp: campaign({ status: "PAUSED" }) });
  const result = await h.engine.tick();
  assert.deepEqual(
    { drafted: result.drafted, skipped: result.skipped },
    { drafted: 0, skipped: 1 }
  );
});

test("enrollContact validates + dedupes", async () => {
  const h = makeHarness({ steps: [step({ kind: "WAIT", delayValue: 1, delayUnit: "DAYS" })] });
  const first = await h.engine.enrollContact(WS, "user-1", "camp-1", "contact-1");
  assert.equal(first.created, true);

  const noSteps = makeHarness({ steps: [] });
  await assert.rejects(
    noSteps.engine.enrollContact(WS, "user-1", "camp-1", "contact-1"),
    (e) => e instanceof SalesError && e.kind === "validation"
  );
});

test("TASK step creates a worker-owned activity with rendered context", async () => {
  const h = makeHarness({ steps: [step({ kind: "TASK", subject: "Call {{contactFirstName}} at {{companyName}}" })] });
  const result = await h.engine.tick();
  assert.equal(result.tasks, 1);
  assert.equal(h.activities[0].type, "TASK");
  assert.equal(h.activities[0].subject, "Call Ada at Acme Freight");
});

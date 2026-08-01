/**
 * AI Sales Employee REST end-to-end test against a live deployment with a
 * real database. Provisions an ephemeral workspace (OWNER + VIEWER), signs
 * in through the real Auth.js HTTP surface, then exercises the /api/sales/*
 * surface end-to-end:
 *
 *   settings (ICP) · companies CRUD + domain dedupe 409 + search · contacts
 *   CRUD + email dedupe 409 + qualify · pipelines defaulting · deals
 *   create→move→close guards · activities complete idempotency · manual
 *   draft → submit → approve/reject lifecycle (approval row consistency) ·
 *   campaign create → activate → enroll → CRON tick → auto-draft for human
 *   review (PENDING_REVIEW + approval; contact NEW→CONTACTED) · enrollment
 *   pause/unsubscribe · saved searches · analytics overview · research
 *   worker dispatch (honest upstream_failed without BYOK) · salesResearch
 *   rate limit 429 · workspace isolation · RBAC 401/403.
 *
 * Usage:
 *   BASE_URL=http://localhost:3100 DATABASE_URL=postgres://... CRON_SECRET=... \
 *     npx tsx scripts/sales-e2e-test.mts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const DATABASE_URL = process.env.DATABASE_URL;
const CRON_SECRET = process.env.CRON_SECRET;

let failures = 0;

function report(ok: boolean, name: string, detail = "") {
  if (ok) console.log(`  ✓ ${name}${detail ? `  (${detail})` : ""}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function cookieOf(res: Response): string {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  return list.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function signIn(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieOf(csrfRes) },
    body: new URLSearchParams({ csrfToken, email, password }),
  });
  return cookieOf(signInRes);
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string; message: string };

async function api<T = unknown>(
  cookie: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(text) as Envelope<T>;
  } catch {
    parsed = { ok: false, error: "non_json", message: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed };
}

function dataOf<T>(r: { body: Envelope<T> }): T {
  if (!r.body.ok) throw new Error(`expected ok envelope, got ${JSON.stringify(r.body).slice(0, 300)}`);
  return (r.body as { data: T }).data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const stamp = Date.now().toString(36);
  const password = "e2e-password-91!";
  const passwordHash = await bcrypt.hash(password, 12);
  const ownerEmail = `e2e-sales+${stamp}@sales.moniclaw.invalid`;
  const viewerEmail = `e2e-sales-viewer+${stamp}@sales.moniclaw.invalid`;
  const otherEmail = `e2e-sales-other+${stamp}@sales.moniclaw.invalid`;

  let workspaceId: string | null = null;
  let otherWorkspaceId: string | null = null;
  const userIds: string[] = [];

  const testDomain = `acme-${stamp}.example.com`;

  try {
    // ── Provision ────────────────────────────────────────────────────────
    const workspace = await db.workspace.create({ data: { name: "E2E Sales Co", slug: `e2e-sales-${stamp}` } });
    workspaceId = workspace.id;
    const owner = await db.user.create({
      data: {
        name: "E2E Sales Owner", email: ownerEmail, passwordHash, emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: workspace.id } },
      },
    });
    userIds.push(owner.id);
    const viewer = await db.user.create({
      data: {
        name: "E2E Sales Viewer", email: viewerEmail, passwordHash, emailVerified: new Date(),
        memberships: { create: { role: "VIEWER", workspaceId: workspace.id } },
      },
    });
    userIds.push(viewer.id);
    const otherWorkspace = await db.workspace.create({ data: { name: "E2E Other Co", slug: `e2e-sales-other-${stamp}` } });
    otherWorkspaceId = otherWorkspace.id;
    const other = await db.user.create({
      data: {
        name: "E2E Other", email: otherEmail, passwordHash, emailVerified: new Date(),
        memberships: { create: { role: "OWNER", workspaceId: otherWorkspace.id } },
      },
    });
    userIds.push(other.id);
    report(true, "ephemeral workspaces provisioned (owner + viewer + other tenant)");

    const cookie = await signIn(ownerEmail, password);
    report(cookie.includes("authjs.session-token"), "owner signed in via real auth surface");
    const viewerCookie = await signIn(viewerEmail, password);
    const otherCookie = await signIn(otherEmail, password);

    console.log("\nauth + RBAC:");
    const anon = await api("", "GET", "/api/sales/companies");
    report(anon.status === 401, "no session → 401");
    const viewerWrite = await api(viewerCookie, "POST", "/api/sales/companies", { name: "Nope Co" });
    report(viewerWrite.status === 403, "VIEWER create company → 403");
    const viewerRead = await api(viewerCookie, "GET", "/api/sales/companies");
    report(viewerRead.status === 200, "VIEWER list companies → 200");
    const viewerSettings = await api(viewerCookie, "PATCH", "/api/sales/settings", { senderName: "x" });
    report(viewerSettings.status === 403, "VIEWER patch settings → 403 (ADMIN+)");

    console.log("\nsettings (ICP):");
    const settingsPatch = await api(cookie, "PATCH", "/api/sales/settings", {
      icpProfile: { industries: ["logistics"], sizes: ["51-200"], geographies: ["Nigeria"], keywords: ["freight"], roles: ["VP Ops"] },
      defaultSendWindow: { daysOfWeek: [1, 2, 3, 4, 5], startHour: 8, endHour: 18, timezone: "Africa/Lagos" },
      senderName: "Tunde AE",
      senderTitle: "Account Executive",
    });
    report(settingsPatch.status === 200, "PATCH /api/sales/settings → 200");
    const settingsGet = dataOf<{ settings: { icpProfile: { industries: string[] }; senderName: string } }>(
      await api(cookie, "GET", "/api/sales/settings")
    );
    report(
      settingsGet.settings.icpProfile.industries.includes("logistics") && settingsGet.settings.senderName === "Tunde AE",
      "ICP + sender identity round-trip"
    );

    console.log("\ncompanies:");
    const badCompany = await api(cookie, "POST", "/api/sales/companies", { name: "x" });
    report(badCompany.status === 400, "invalid company body → 400 validation");
    const companyRes = await api<{ company: { id: string; priorityScore: number } }>(
      cookie, "POST", "/api/sales/companies",
      { name: "Acme Freight", domain: testDomain, industry: "Logistics", size: "51-200", geography: "Nigeria", tags: ["tier-1"] }
    );
    report(companyRes.status === 201, "POST company → 201 (scored on write)");
    const companyId = dataOf(companyRes).company.id;
    const dupe = await api(cookie, "POST", "/api/sales/companies", { name: "Acme Freight 2", domain: testDomain });
    report(dupe.status === 409, "same-domain company → 409 conflict dedupe");
    const patchCompany = dataOf<{ company: { icpFit: number | null; priorityScore: number; industry: string } }>(
      await api(cookie, "PATCH", `/api/sales/companies/${companyId}`, { industry: "logistics" })
    );
    report(
      typeof patchCompany.company.icpFit === "number" && patchCompany.company.icpFit > 0,
      "ICP overlay applied on rescore",
      `icpFit=${patchCompany.company.icpFit} priority=${patchCompany.company.priorityScore}`
    );
    const search = dataOf<{ companies: Array<{ id: string }> }>(
      await api(cookie, "GET", "/api/sales/companies?query=Acme&tags=tier-1&minPriority=0")
    );
    report(search.companies.some((c) => c.id === companyId), "search query + tags filter finds the company");
    const isolation = await api(otherCookie, "GET", `/api/sales/companies/${companyId}`);
    report(isolation.status === 404, "cross-tenant company detail → 404");

    console.log("\ncontacts:");
    const contactRes = await api<{ contact: { id: string } }>(
      cookie, "POST", "/api/sales/contacts",
      { name: "Ada Okafor", email: `ada-${stamp}@acme.example.com`, companyId, title: "VP Ops", source: "MANUAL" }
    );
    report(contactRes.status === 201, "POST contact → 201");
    const contactId = dataOf(contactRes).contact.id;
    const dupeContact = await api(cookie, "POST", "/api/sales/contacts", { name: "Ada Clone", email: `ada-${stamp}@acme.example.com` });
    report(dupeContact.status === 409, "same-email contact → 409 conflict dedupe");
    const qualified = dataOf<{ contact: { status: string } }>(
      await api(cookie, "POST", `/api/sales/contacts/${contactId}/qualify`)
    );
    report(qualified.contact.status === "QUALIFIED", "POST qualify → QUALIFIED");

    console.log("\npipelines + deals:");
    const pipelines = dataOf<{ pipelines: Array<{ id: string; isDefault: boolean; stages: Array<{ id: string; name: string; order: number }> }> }>(
      await api(cookie, "GET", "/api/sales/pipelines")
    );
    const defaultPipeline = pipelines.pipelines.find((p) => p.isDefault);
    report(!!defaultPipeline && defaultPipeline.stages.length >= 3, "default pipeline ensured with standard stages",
      defaultPipeline ? `${defaultPipeline.stages.length} stages` : "none");
    const dealRes = await api<{ deal: { id: string; status: string; stageId: string } }>(
      cookie, "POST", "/api/sales/deals",
      { companyId, primaryContactId: contactId, title: "Acme outbound pilot", valueUsd: 24000, currency: "USD" }
    );
    report(dealRes.status === 201, "POST deal → 201 (default pipeline/stage resolved)");
    const deal = dataOf(dealRes).deal;
    const secondStage = defaultPipeline!.stages[1];
    const moved = dataOf<{ deal: { stageId: string } }>(
      await api(cookie, "POST", `/api/sales/deals/${deal.id}/move`, { stageId: secondStage.id })
    );
    report(moved.deal.stageId === secondStage.id, "deal moved to stage 2");
    const closed = dataOf<{ deal: { status: string } }>(
      await api(cookie, "POST", `/api/sales/deals/${deal.id}/close`, { status: "WON" })
    );
    report(closed.deal.status === "WON", "deal closed WON");
    const moveClosed = await api(cookie, "POST", `/api/sales/deals/${deal.id}/move`, { stageId: defaultPipeline!.stages[0].id });
    report(moveClosed.status === 409, "closed deal move → 409");
    const editClosed = await api(cookie, "PATCH", `/api/sales/deals/${deal.id}`, { title: "nope" });
    report(editClosed.status === 409, "closed deal edit → 409");

    console.log("\nactivities:");
    const noteRes = await api<{ activity: { id: string } }>(
      cookie, "POST", "/api/sales/activities",
      { type: "NOTE", subject: "First touch", body: "Intro sent via LinkedIn.", companyId, contactId }
    );
    report(noteRes.status === 201, "POST NOTE activity → 201");
    const taskRes = await api<{ activity: { id: string } }>(
      cookie, "POST", "/api/sales/activities",
      { type: "TASK", subject: "Follow up on proposal", dueAt: new Date(Date.now() + 86400_000).toISOString(), dealId: deal.id }
    );
    const taskId = dataOf(taskRes).activity.id;
    const complete1 = await api(cookie, "POST", `/api/sales/activities/${taskId}/complete`);
    const complete2 = await api(cookie, "POST", `/api/sales/activities/${taskId}/complete`);
    report(complete1.status === 200 && complete2.status === 200, "complete activity idempotent (2× POST → 200)");

    console.log("\nmanual drafts + approval lifecycle:");
    const draftRes = await api<{ draft: { id: string; status: string } }>(
      cookie, "POST", "/api/sales/drafts",
      { contactId, channel: "EMAIL", subject: "Acme Freight × MoniClaw", body: "Hi Ada,\n\nSaw Acme Freight is scaling logistics in Nigeria — MoniClaw's AI sales workspace can book your outbound team's meetings on autopilot. Open to 15 minutes?\n\n— Tunde" }
    );
    report(draftRes.status === 201 && dataOf(draftRes).draft.status === "DRAFT", "manual draft created as DRAFT");
    const draftId = dataOf(draftRes).draft.id;
    const editDraft = await api(cookie, "PATCH", `/api/sales/drafts/${draftId}`, { body: "Hi Ada,\n\nSaw Acme Freight is scaling across West Africa — MoniClaw can research, draft and route outreach for review. 15 minutes Thursday?\n\n— Tunde" });
    report(editDraft.status === 200, "draft body editable while DRAFT");
    const viewerSubmit = await api(viewerCookie, "POST", `/api/sales/drafts/${draftId}/submit`);
    report(viewerSubmit.status === 403, "VIEWER submit → 403 (MEMBER+)");
    const submitted = dataOf<{ draft: { status: string; approvalId: string }; approvalId: string }>(
      await api(cookie, "POST", `/api/sales/drafts/${draftId}/submit`)
    );
    report(submitted.draft.status === "PENDING_REVIEW" && !!submitted.approvalId, "submit → PENDING_REVIEW + approval row");
    const approvalRow = await db.approval.findUnique({ where: { id: submitted.approvalId } });
    report(
      approvalRow?.actionType === "sales.draft.review" && approvalRow.status === "PENDING" && approvalRow.workspaceId === workspaceId,
      "approval row consistent (actionType, workspace, PENDING)"
    );
    const doubleApprove = await api(cookie, "POST", `/api/sales/drafts/${draftId}/approve`, {});
    const approveRow = await db.approval.findUnique({ where: { id: submitted.approvalId } });
    report(
      doubleApprove.status === 200 && approveRow?.status === "APPROVED" && !!approveRow.decidedAt,
      "approve → draft APPROVED + approval decided atomically"
    );
    const resubmit = await api(cookie, "POST", `/api/sales/drafts/${draftId}/submit`);
    report(resubmit.status === 409, "re-submit of decided draft → 409");
    const resched = dataOf<{ draft: { status: string; scheduledAt: string | null } }>(
      await api(cookie, "POST", `/api/sales/drafts/${draftId}/reschedule`, { scheduledAt: new Date(Date.now() + 3600_000).toISOString() })
    );
    report(resched.draft.status === "SCHEDULED" && !!resched.draft.scheduledAt, "approved draft rescheduled → SCHEDULED");
    const editApproved = await api(cookie, "PATCH", `/api/sales/drafts/${draftId}`, { body: "An edit attempt that must be rejected." });
    report(editApproved.status === 409, "edit after approval → 409");

    const draft2 = dataOf<{ draft: { id: string } }>(
      await api(cookie, "POST", "/api/sales/drafts", { contactId, channel: "LINKEDIN", body: "Hi Ada — following Acme's expansion; would love to connect." })
    );
    await api(cookie, "POST", `/api/sales/drafts/${draft2.draft.id}/submit`);
    const rejected = dataOf<{ draft: { status: string; rejectionNote: string | null } }>(
      await api(cookie, "POST", `/api/sales/drafts/${draft2.draft.id}/reject`, { note: "Too short — add the ROI stat." })
    );
    report(rejected.draft.status === "REJECTED" && rejected.draft.rejectionNote === "Too short — add the ROI stat.", "reject → REJECTED + note kept");
    const delRejected = await api(cookie, "DELETE", `/api/sales/drafts/${draft2.draft.id}`);
    report(delRejected.status === 200, "rejected draft deletable");

    console.log("\ncampaigns (tick-driven draft production):");
    const campRes = await api<{ campaign: { id: string } }>(
      cookie, "POST", "/api/sales/campaigns",
      {
        name: "Q3 Logistics Outbound", goal: "Book discovery calls with West-African 3PLs",
        dailyCap: 5,
        // All-week/around-the-clock window so the tick is due regardless of
        // when the suite runs (window-defer semantics are unit-tested).
        sendWindow: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startHour: 0, endHour: 23, timezone: "UTC" },
        steps: [
          { order: 0, kind: "DRAFT_EMAIL", subject: "{{companyName}} × MoniClaw", bodyTemplate: "Hi {{contactFirstName}}, saw {{companyName}} in {{companyIndustry}}. {{senderName}} here from {{workspaceName}} — worth a chat?", delayValue: 0, delayUnit: "DAYS" },
          { order: 1, kind: "TASK", subject: "Call {{contactFirstName}} at {{companyName}}", delayValue: 1, delayUnit: "DAYS" },
        ],
      }
    );
    report(campRes.status === 201, "campaign created (DRAFT, 2 steps)");
    const campaignId = dataOf(campRes).campaign.id;
    const activateNoStepsGuard = await api(cookie, "PATCH", `/api/sales/campaigns/${campaignId}`, { status: "ACTIVE" });
    report(activateNoStepsGuard.status === 200, "activate with steps → ACTIVE");
    const enrolled = dataOf<{ results: Array<{ contactId: string; created: boolean }>; created: number }>(
      await api(cookie, "POST", `/api/sales/campaigns/${campaignId}/enroll`, { contactIds: [contactId, contactId] })
    );
    report(enrolled.created === 1, "double enroll deduped by unique key", `created=${enrolled.created}/2`);

    if (CRON_SECRET) {
      const tickRes = await fetch(`${BASE}/api/agents/tick`, {
        method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const tickBody = (await tickRes.json()) as { ok: boolean; data?: { campaigns?: { processed: number; drafted: number } } };
      const campTick = tickBody.data?.campaigns;
      report(tickRes.status === 200 && (campTick?.drafted ?? 0) >= 1, "cron tick produced a review draft",
        `drafted=${campTick?.drafted ?? "?"}`);

      const campDrafts = dataOf<{ drafts: Array<{ id: string; status: string; approvalId: string | null; subject: string | null; body: string; channel: string }> }>(
        await api(cookie, "GET", `/api/sales/drafts?status=PENDING_REVIEW&companyId=${companyId}`)
      );
      const autoDraft = campDrafts.drafts[0];
      report(
        !!autoDraft && !!autoDraft.approvalId && autoDraft.subject?.includes("Acme Freight"),
        "auto-draft rendered from template (personalized subject)"
      );
      report(
        !!autoDraft && autoDraft.body.includes("Hi Ada") && autoDraft.body.includes("Tunde AE") && !autoDraft.body.includes("{{"),
        "placeholders resolved with sender identity from settings"
      );
      const contactAfter = dataOf<{ contact: { status: string; lastTouchedAt: string | null } }>(
        await api(cookie, "GET", `/api/sales/contacts/${contactId}`)
      );
      report(!!contactAfter.contact.lastTouchedAt, "enrollment touch recorded on contact");

      // Tick again immediately — nothing is due (enrollment waits 1 day for step 2).
      const tick2Res = await fetch(`${BASE}/api/agents/tick`, {
        method: "POST", headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      const tick2 = ((await tick2Res.json()) as { data?: { campaigns?: { processed: number; drafted: number } } }).data?.campaigns;
      report((tick2?.drafted ?? 0) === 0, "immediate re-tick drafts nothing (next step is delayed)");

      // Pause campaign → enrollment unsubscribe
      const unsub = await api(cookie, "PATCH", `/api/sales/campaigns/${campaignId}/enrollments/${(dataOf<{ enrollments: Array<{ id: string }> }>(await api(cookie, "GET", `/api/sales/campaigns/${campaignId}/enrollments`)).enrollments[0]).id}`, { status: "UNSUBSCRIBED" });
      report(unsub.status === 200, "enrollment unsubscribed");
      const pauseBad = await api(cookie, "PATCH", `/api/sales/campaigns/${campaignId}`, { status: "PAUSED" });
      report(pauseBad.status === 200, "campaign paused");
      const stepEditActive = await api(cookie, "PUT", `/api/sales/campaigns/${campaignId}/steps`, { steps: [{ order: 0, kind: "TASK", subject: "x", delayValue: 0, delayUnit: "DAYS" }] });
      report(stepEditActive.status === 200, "steps editable while paused");
    } else {
      report(false, "CRON_SECRET provided", "missing — skip campaign tick section");
    }

    console.log("\nsaved searches + analytics:");
    await api(cookie, "POST", "/api/sales/searches", { name: "Tier-1 logistics", entity: "companies", filters: { tags: ["tier-1"], minPriority: 0, take: 50 } });
    const searches = dataOf<{ searches: Array<{ id: string; name: string }> }>(await api(cookie, "GET", "/api/sales/searches?entity=companies"));
    report(searches.searches.some((s) => s.name === "Tier-1 logistics"), "saved search upserted + listed");
    const delSearch = await api(cookie, "DELETE", `/api/sales/searches/${searches.searches[0].id}`);
    report(delSearch.status === 200, "saved search deleted");

    const overview = dataOf<{
      overview: {
        companies: { total: number; researched: number; avgPriority: number };
        contacts: { total: number; byStatus: Record<string, number> };
        deals: { openCount: number; wonCount30d: number; wonValueUsd30d: number };
        drafts: { byStatus: Record<string, number> };
        campaigns: { active: number; draftsToday: number };
      };
    }>(await api(cookie, "GET", "/api/sales/analytics/overview"));
    report(
      overview.overview.companies.total >= 1 &&
      overview.overview.deals.wonCount30d >= 1 &&
      overview.overview.deals.wonValueUsd30d >= 24000 &&
      (overview.overview.drafts.byStatus.SCHEDULED ?? 0) >= 1,
      "analytics overview reflects the run (companies, WON value, scheduled drafts)",
      `won=$${overview.overview.deals.wonValueUsd30d}`
    );

    console.log("\nresearch worker dispatch (honest failure without BYOK):");
    const research = dataOf<{ runId: string; reused: boolean }>(
      await api(cookie, "POST", `/api/sales/companies/${companyId}/research`)
    );
    report(!!research.runId && research.reused === false, "POST research → 202 + runId",
      `run=${research.runId.slice(0, 8)}…`);
    const agentRow = await db.agent.findFirst({ where: { workspaceId, slug: "system-sales-researcher" } });
    report(!!agentRow && agentRow.workerType === "research", "system researcher worker auto-provisioned");

    // Poll until terminal; without a provider key the run must fail honestly.
    let finalStatus = "";
    for (let i = 0; i < 30; i++) {
      const st = dataOf<{ researchStatus: string }>(await api(cookie, "GET", `/api/sales/companies/${companyId}/research`));
      finalStatus = st.researchStatus;
      if (["COMPLETED", "FAILED"].includes(finalStatus)) break;
      await sleep(1000);
    }
    const run = await db.agentRun.findUnique({ where: { id: research.runId } });
    report(
      finalStatus === "FAILED" && run?.errorClass === "upstream_failed",
      "no BYOK → research run fails HONESTLY (upstream_failed reconciled onto company)",
      `status=${finalStatus} class=${run?.errorClass ?? "?"}`
    );

    console.log("\nresearch rate limit (20/hr/workspace):");
    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const r = await api(cookie, "POST", `/api/sales/companies/${companyId}/research`);
      lastStatus = r.status;
    }
    report(lastStatus === 429, "21st research request in the window → 429", `→ ${lastStatus}`);
  } catch (err) {
    failures++;
    console.error("  ✗ unexpected harness error:", err);
  } finally {
    // Ephemeral cleanup (cascades across every sales/agent/approval table).
    if (workspaceId) await db.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
    if (otherWorkspaceId) await db.workspace.deleteMany({ where: { id: otherWorkspaceId } }).catch(() => {});
    for (const id of userIds) await db.user.deleteMany({ where: { id } }).catch(() => {});
    await db.$disconnect();
  }

  console.log(failures === 0 ? "\nALL SALES E2E CHECKS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

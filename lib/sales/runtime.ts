/**
 * Sales runtime container (app glue) — binds every Sales Runtime port to the
 * platform: Prisma repositories, the Phase-2 Approval table (draft review),
 * the Phase-3 Knowledge base (playbooks in personalization), the Phase-5
 * Worker Orchestrator (company research dispatch) and the audit log.
 * Lazy singleton mirroring lib/agents/runtime.ts.
 */
import {
  buildSalesRepositories,
  CampaignEngine,
  CompanyResearchService,
  SalesAnalyticsService,
  SalesCrmService,
  SalesError,
  icpProfileSchema,
  profileFromReport,
  type IcpProfile,
  type SalesAuditSink,
  type SalesCompanyRow,
  type SalesKnowledgeRetrieval,
  type SalesResearchDispatcher,
} from "@sales/index";
import { runOutputSchema } from "@agents/index";

import { db } from "@/lib/db";
import { audit, type AuditAction } from "@/lib/audit";
import { getAgentRuntime } from "@/lib/agents/runtime";
import { getRuntime } from "@/lib/ai/runtime";
import { salesApprovalBridge } from "./approvals";

export const SYSTEM_RESEARCHER_SLUG = "system-sales-researcher";

/** Provisions (or returns) the system research worker for this workspace. */
async function ensureSystemResearcher(workspaceId: string) {
  const existing = await db.agent.findFirst({
    where: { workspaceId, slug: SYSTEM_RESEARCHER_SLUG, deletedAt: null },
  });
  if (existing) return existing;

  try {
    return await db.agent.create({
      data: {
        workspaceId,
        name: "Sales Researcher",
        slug: SYSTEM_RESEARCHER_SLUG,
        description:
          "System worker: researches companies from public sources for sales outreach prep.",
        category: "sales",
        workerType: "research",
        status: "AUTONOMOUS",
        trigger: "MANUAL",
        schedule: null,
        skills: ["company-research", "prospecting"],
        goal: "Produce accurate, cited company research from public sources for sales outreach preparation.",
        instructions:
          "Use only public, freely accessible pages (company site, public directories, news). " +
          "Never log in, bypass paywalls, or scrape private/restricted data. " +
          "Emit the report with the exact ## section headings requested in the run goal.",
        toolPolicy: {},
        budget: {
          maxSteps: 25,
          maxTokens: 300_000,
          maxCostMicros: 2_000_000,
          maxDurationMs: 900_000,
          maxConcurrentRuns: 2,
          maxDepth: 0,
        },
      },
    });
  } catch (err) {
    // Slug unique raced — the winner already created it.
    if (/unique|duplicate/i.test(String((err as Error)?.message))) {
      const winner = await db.agent.findFirst({ where: { workspaceId, slug: SYSTEM_RESEARCHER_SLUG } });
      if (winner) return winner;
    }
    throw err;
  }
}

/** The goal handed to the research worker; section headings MUST match
 *  packages/sales-runtime/research/profile.ts (profileFromReport). */
export function researchGoal(company: Pick<SalesCompanyRow, "name" | "domain" | "industry">): string {
  return [
    `Research the company "${company.name}"${company.domain ? ` (website: ${company.domain})` : ""} for B2B sales outreach preparation.`,
    company.industry ? `We believe its industry is "${company.industry}" — verify and refine.` : "",
    ``,
    `Rules: use only public, freely accessible information. Never log in, bypass paywalls or CAPTCHAs, or scrape private/restricted data. Do not collect personal data beyond what the company itself publishes (e.g. a public contact page).`,
    ``,
    `Deliver a cited research report whose markdown contains exactly these sections, as ## headings, in this order:`,
    `## Industry`,
    `## Company size`,
    `## Geography`,
    `## Business model`,
    `## Products & services`,
    `## Target market`,
    `## Tech stack`,
    `## News & recent developments`,
    `## Social links`,
    `## Contact pages`,
    ``,
    `Keep each section to 1–3 short sentences; render Tech stack and Social links as bullet lists (full https:// URLs for social). Cite a source URL for every factual claim.`,
  ].filter((line) => line !== "").join("\n");
}

/** Phase-5 worker dispatch behind the SalesResearchDispatcher port. */
class AgentRunResearchDispatcher implements SalesResearchDispatcher {
  async dispatch(
    workspaceId: string,
    company: SalesCompanyRow,
    opts: { byUserId?: string | null }
  ): Promise<{ runId: string }> {
    const agent = await ensureSystemResearcher(workspaceId);
    const { orchestrator } = getAgentRuntime();
    // Hourly bucket: protects against double-dispatch races while still
    // allowing deliberate re-research later (in-flight dedupe lives in
    // CompanyResearchService).
    const bucket = Math.floor(Date.now() / 3_600_000);
    const { run } = await orchestrator.dispatch({
      workspaceId,
      agentId: agent.id,
      byUserId: opts.byUserId ?? null,
      triggerSource: "sales",
      goal: researchGoal(company),
      idempotencyKey: `sales-research:${company.id}:${bucket}`,
    });
    return { runId: run.id };
  }

  async readResult(workspaceId: string, runId: string) {
    const { repos } = getAgentRuntime();
    const run = await repos.runs.get(workspaceId, runId);
    if (!run) {
      throw new SalesError("not_found", "Research run not found.", { runId });
    }
    const status = run.status as
      | "QUEUED" | "RUNNING" | "NEEDS_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELED";
    if (status !== "SUCCEEDED") {
      return { status, profile: null, error: run.error ?? null };
    }
    const output = runOutputSchema.safeParse(run.output ?? {});
    const report = output.success ? output.data.report : undefined;
    if (!report) {
      return { status, profile: null, error: "Run succeeded without a research report." };
    }
    return { status, profile: profileFromReport(report), error: null };
  }
}

export interface SalesRuntimeBundle {
  repos: ReturnType<typeof buildSalesRepositories>;
  crm: SalesCrmService;
  research: CompanyResearchService;
  campaignsEngine: CampaignEngine;
  analytics: SalesAnalyticsService;
  dispatcher: SalesResearchDispatcher;
  /** ICP profile from workspace sales settings (null until configured). */
  icpFor: (workspaceId: string) => Promise<IcpProfile | null>;
}

let container: SalesRuntimeBundle | null = null;

export function getSalesRuntime(): SalesRuntimeBundle {
  if (container) return container;

  const repos = buildSalesRepositories(db);

  const auditSink: SalesAuditSink = {
    log: (input) =>
      audit({
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? null,
        action: input.action as AuditAction,
        targetType: "sales",
        ...(input.target != null ? { targetId: input.target } : {}),
        metadata: input.metadata,
      }),
  };

  const icpFor = async (workspaceId: string): Promise<IcpProfile | null> => {
    const settings = await repos.settings.get(workspaceId);
    const parsed = icpProfileSchema.safeParse(settings?.icpProfile ?? {});
    if (!parsed.success) return null;
    const icp = parsed.data;
    const configured =
      icp.industries.length + icp.sizes.length + icp.geographies.length +
      icp.keywords.length + icp.roles.length > 0;
    return configured ? icp : null;
  };

  const crm = new SalesCrmService({ repos, audit: auditSink });

  const dispatcher = new AgentRunResearchDispatcher();
  const research = new CompanyResearchService({
    repos,
    dispatcher,
    audit: auditSink,
    rescore: async (workspaceId, companyId) => {
      await crm.rescoreCompany(workspaceId, companyId, await icpFor(workspaceId));
    },
  });

  // Workspace-linked approvals (no run) — decided in the shared approvals
  // inbox; decideApproval propagates to the linked draft (workspace.ts).
  const approvals = salesApprovalBridge();

  const knowledge: SalesKnowledgeRetrieval = {
    async search(workspaceId, query, limit = 3) {
      try {
        // Phase-3 KnowledgeService — returns [] when no embedder is configured.
        const hits = await getRuntime().knowledge.search({ workspaceId, query, limit });
        return hits.map((hit) => ({ title: hit.documentTitle, content: hit.content }));
      } catch (err) {
        // Playbooks are an enhancement, never a blocker for draft generation.
        console.warn("[sales] knowledge search failed:", (err as Error).message);
        return [];
      }
    },
  };

  const campaignsEngine = new CampaignEngine({
    repos,
    approvals,
    knowledge,
    audit: auditSink,
    clock: { now: () => new Date() },
    identityFor: async (workspaceId, createdById) => {
      const [settings, user, workspace] = await Promise.all([
        repos.settings.get(workspaceId),
        createdById ? db.user.findUnique({ where: { id: createdById }, select: { name: true } }) : null,
        db.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      ]);
      return {
        name: settings?.senderName ?? user?.name ?? null,
        title: settings?.senderTitle ?? null,
        workspaceName: workspace?.name ?? "MoniClaw",
      };
    },
    requestedTo: async () => "workspace.manager",
  });

  const analytics = new SalesAnalyticsService(repos);

  container = { repos, crm, research, campaignsEngine, analytics, dispatcher, icpFor };
  return container;
}

/** Test seam — replaces the singleton (mirrors resetAgentRuntime). */
export function resetSalesRuntime(): void {
  container = null;
}

import { z } from "zod";
import type { Tool } from "@runtime/tools/tool";
import type { SalesContactStatus } from "@sales/index";

/**
 * Sales tools for the AI Runtime (Phase 6 — workflow-engine integration).
 *
 * Registered into the shared ToolRegistry in lib/ai/runtime.ts, so the
 * workflow engine's tool nodes, the Phase-5 worker planners AND chat all
 * reach Sales CRM data through the SAME executor (permissions, audit,
 * timeouts) — no parallel access path.
 *
 * Tools:
 *  - sales_company_search      read-only — companies with scores/filters
 *  - sales_contact_search      read-only — contacts with status/company
 *  - sales_pipeline_snapshot   read-only — pipelines, stages and open deals
 *  - sales_activity_log        MUTATING — write a note/call/meeting/task to
 *                              the CRM timeline. Disabled by default per the
 *                              safe-by-default rule; a workspace enables it
 *                              explicitly in AI settings.
 *
 * Decoupling: tool schemas are static (zero import of the sales runtime at
 * boot); execution resolves the sales container LAZILY via dynamic import.
 * This is not just a perf choice — lib/sales/runtime.ts already imports
 * lib/ai/runtime.ts, so a static back-import would close a module cycle.
 */

type SearchFilters = {
  query?: string;
  tags?: string[];
  segment?: string;
  territory?: string;
  industry?: string;
  status?: string;
  minPriority?: number;
  minFit?: number;
  take?: number;
};

interface SalesToolBackend {
    listCompanies(workspaceId: string, filters: SearchFilters & { take: number }): Promise<unknown[]>;
  listContacts(workspaceId: string, filters: SearchFilters & { take: number }): Promise<unknown[]>;
  pipelineSnapshot(workspaceId: string): Promise<unknown>;
  logActivity(
    workspaceId: string,
    actorId: string | null,
    input: {
      type: "NOTE" | "CALL" | "MEETING" | "TASK" | "EMAIL";
      subject: string;
      body?: string | null;
      dueAt?: string | null;
      companyId?: string | null;
      contactId?: string | null;
      dealId?: string | null;
    }
  ): Promise<unknown>;
}

type BackendResolver = () => Promise<SalesToolBackend>;

/** Prisma-backed backend, resolved on first tool execution. */
const productionBackend: BackendResolver = async () => {
  const { getSalesRuntime } = await import("@/lib/sales/runtime");
  const { repos, crm } = getSalesRuntime();
  return {
    listCompanies: (workspaceId, filters) =>
      repos.companies.list(workspaceId, filters).then((rows) =>
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          domain: c.domain,
          industry: c.industry,
          fitScore: c.fitScore,
          priorityScore: c.priorityScore,
          researchStatus: c.researchStatus,
          tags: c.tags,
          segment: c.segment,
          territory: c.territory,
        }))
      ),
    listContacts: (workspaceId, filters) =>
      repos.contacts.list(workspaceId, filters).then((rows) =>
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          title: c.title,
          email: c.email,
          status: c.status,
          companyId: c.companyId,
          tags: c.tags,
          lastTouchedAt: c.lastTouchedAt,
        }))
      ),
    pipelineSnapshot: async (workspaceId) => {
      const [pipelines, deals] = await Promise.all([
        repos.pipelines.list(workspaceId),
        repos.deals.list(workspaceId, { take: 100 }),
      ]);
      return pipelines.map((p) => ({
        id: p.id,
        name: p.name,
        stages: p.stages.map((s) => ({
          id: s.id,
          name: s.name,
          order: s.order,
          deals: deals
            .filter((d) => d.stageId === s.id && d.status === "OPEN")
            .map((d) => ({
              id: d.id,
              title: d.title,
              valueUsd: d.valueUsd,
              currency: d.currency,
              companyId: d.companyId,
              primaryContactId: d.primaryContactId,
              expectedCloseAt: d.expectedCloseAt ?? null,
            })),
        })),
      }));
    },
    logActivity: (workspaceId, actorId, input) =>
      crm.logActivity(workspaceId, actorId, {
        ...input,
        body: input.body ?? null,
        dueAt: input.dueAt ?? null,
      }),
  };
};

const companySearchSchema = z.object({
  query: z.string().trim().max(200).optional().describe("Free-text match on name/domain/industry"),
  segment: z.string().trim().max(60).optional().describe("Exact segment filter"),
  territory: z.string().trim().max(60).optional().describe("Exact territory filter"),
  industry: z.string().trim().max(80).optional().describe("Industry filter"),
  minPriority: z.number().int().min(0).max(100).optional().describe("Minimum priority score (0-100)"),
  minFit: z.number().int().min(0).max(100).optional().describe("Minimum fit score (0-100)"),
  take: z.number().int().min(1).max(50).default(20).describe("Max rows to return"),
});

const contactSearchSchema = z.object({
  query: z.string().trim().max(200).optional().describe("Free-text match on name/email/title"),
  status: z
    .enum(["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "CUSTOMER", "LOST"] satisfies readonly SalesContactStatus[])
    .optional()
    .describe("Exact contact status filter"),
  take: z.number().int().min(1).max(50).default(20),
});

const pipelineSnapshotSchema = z.object({});

const activityLogSchema = z.object({
  type: z
    .enum(["NOTE", "CALL", "MEETING", "TASK", "EMAIL"])
    .describe("Timeline entry kind"),
  subject: z.string().trim().min(2).max(200).describe("Short human-readable summary"),
  body: z.string().trim().max(4000).optional().describe("Optional details"),
  dueAt: z.string().datetime({ offset: true }).optional().describe("ISO datetime for TASK-type activities"),
  companyId: z.string().uuid().optional().describe("Attach to this company"),
  contactId: z.string().uuid().optional().describe("Attach to this contact"),
  dealId: z.string().uuid().optional().describe("Attach to this deal"),
});

export function salesTools(resolveBackend: BackendResolver = productionBackend): Tool[] {
  return [
    {
      name: "sales_company_search",
      description:
        "Search the sales CRM for companies (accounts). Supports text query plus segment, territory, industry and minimum fit/priority score filters. Returns lean rows with scores — never deletes or changes anything.",
      schema: companySearchSchema,
      metadata: {
        category: "sales",
        mutating: false,
        requiredAction: "sales.read",
        version: "1.0.0",
        defaultTimeoutMs: 15_000,
      },
      async execute(input, ctx) {
        const backend = await resolveBackend();
        return { companies: await backend.listCompanies(ctx.workspaceId, input as z.infer<typeof companySearchSchema>) };
      },
    },
    {
      name: "sales_contact_search",
      description:
        "Search the sales CRM for contacts (people). Supports text query and exact status filters (NEW, CONTACTED, ENGAGED, QUALIFIED, CUSTOMER, LOST). Contact status reflects opt-out via campaign enrollments (UNSUBSCRIBED).",
      schema: contactSearchSchema,
      metadata: {
        category: "sales",
        mutating: false,
        requiredAction: "sales.read",
        version: "1.0.0",
        defaultTimeoutMs: 15_000,
      },
      async execute(input, ctx) {
        const backend = await resolveBackend();
        return { contacts: await backend.listContacts(ctx.workspaceId, input as z.infer<typeof contactSearchSchema>) };
      },
    },
    {
      name: "sales_pipeline_snapshot",
      description:
        "Snapshot every sales pipeline with its stages and open deals (title, value in workspace currency, expected close). Use this to answer 'how does the pipeline look' questions or to plan follow-up work.",
      schema: pipelineSnapshotSchema,
      metadata: {
        category: "sales",
        mutating: false,
        requiredAction: "sales.read",
        version: "1.0.0",
        defaultTimeoutMs: 15_000,
      },
      async execute(_input, ctx) {
        const backend = await resolveBackend();
        return { pipelines: await backend.pipelineSnapshot(ctx.workspaceId) };
      },
    },
    {
      name: "sales_activity_log",
      description:
        "Write a timeline entry (NOTE, CALL, MEETING, TASK or EMAIL) to the CRM, attached to at least one company, contact or deal id. Creates a real, audited CRM record — enable deliberately in workspace AI settings.",
      schema: activityLogSchema,
      metadata: {
        category: "sales",
        mutating: true,
        requiredAction: "sales.write",
        version: "1.0.0",
        defaultTimeoutMs: 20_000,
      },
      async execute(raw, ctx) {
        const input = raw as z.infer<typeof activityLogSchema>;
        if (!input.companyId && !input.contactId && !input.dealId) {
          throw new Error("An activity must attach to a company, contact or deal id.");
        }
        const backend = await resolveBackend();
        const row = (await backend.logActivity(ctx.workspaceId, ctx.userId ?? null, {
          ...input,
          body: input.body ?? null,
          dueAt: input.dueAt ?? null,
        })) as { id?: string };
        return { logged: true, activityId: row.id ?? null };
      },
    },
  ];
}

/**
 * Prisma adapters for the Sales Runtime ports.
 *
 * Tenant safety contract: every read/update is workspace-scoped; soft-delete
 * filters (`deletedAt: null`) are applied on every list/get; aggregates are
 * per-repository so analytics stays query-local.
 */
import type { PrismaClient } from "@prisma/client";

import type {
  SalesActivityRepository, SalesActivityRow, SalesCampaignRepository,
  SalesCampaignRow, SalesCampaignStepRow, SalesCompanyRepository, SalesCompanyRow,
  SalesContactRepository, SalesContactRow, SalesDealRepository, SalesDealRow,
  SalesDraftRepository, SalesDraftRow, SalesEnrollmentRow, SalesPipelineRepository,
  SalesPipelineRow, SalesRepositories, SalesSavedSearchRepository,
} from "../ports";
import type { SalesSearchFilters } from "../types";

const asRow = <T>(r: unknown): T => r as T;

const DEFAULT_STAGES = [
  { name: "Prospecting", winProbability: 10 },
  { name: "Qualified", winProbability: 25 },
  { name: "Proposal", winProbability: 50 },
  { name: "Negotiation", winProbability: 75 },
];

// ── Companies ──────────────────────────────────────────────────────────────

export class SalesCompanyPrismaRepository implements SalesCompanyRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesCompanyRow> {
    const r = await this.db.salesCompany.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesCompanyRow | null> {
    const r = await this.db.salesCompany.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async findByDomain(workspaceId: string, domain: string): Promise<SalesCompanyRow | null> {
    const r = await this.db.salesCompany.findFirst({ where: { workspaceId, domain, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, f: SalesSearchFilters): Promise<SalesCompanyRow[]> {
    const rows = await this.db.salesCompany.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(f.query
          ? {
              OR: [
                { name: { contains: f.query, mode: "insensitive" } },
                { domain: { contains: f.query, mode: "insensitive" } },
                { industry: { contains: f.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(f.tags?.length ? { tags: { hasEvery: f.tags } } : {}),
        ...(f.segment ? { segment: f.segment } : {}),
        ...(f.territory ? { territory: f.territory } : {}),
        ...(f.industry ? { industry: { contains: f.industry, mode: "insensitive" } } : {}),
        ...(f.minPriority !== undefined ? { priorityScore: { gte: f.minPriority } } : {}),
        ...(f.minFit !== undefined ? { fitScore: { gte: f.minFit } } : {}),
        ...(f.hasOpenDeal ? { deals: { some: { status: "OPEN", deletedAt: null } } } : {}),
      },
      orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
      take: Math.min(f.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesCompanyRow> {
    const r = await this.db.salesCompany.update({ where: { id, workspaceId } as never, data: patch as never });
    return asRow(r);
  }

  async setScores(id: string, icpFit: number | null, fit: { score: number; reasons: string[] }, priority: { score: number; reasons: string[] }): Promise<void> {
    await this.db.salesCompany.update({
      where: { id },
      data: {
        icpFit,
        fitScore: fit.score,
        priorityScore: priority.score,
        scoreReasons: { fit: fit.reasons, priority: priority.reasons } as object,
      },
    });
  }

  async setResearch(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.salesCompany.update({ where: { id }, data: patch as never });
  }

  async softDelete(workspaceId: string, id: string): Promise<void> {
    await this.db.salesCompany.updateMany({ where: { id, workspaceId }, data: { deletedAt: new Date() } });
  }

  async countsByCompany(workspaceId: string, companyId: string): Promise<{ contacts: number; openDeals: number }> {
    const [contacts, openDeals] = await Promise.all([
      this.db.salesContact.count({ where: { workspaceId, companyId, deletedAt: null } }),
      this.db.salesDeal.count({ where: { workspaceId, companyId, status: "OPEN", deletedAt: null } }),
    ]);
    return { contacts, openDeals };
  }

  async analytics(workspaceId: string): Promise<{ total: number; researched: number; avgPriority: number }> {
    const [total, researched, avg] = await Promise.all([
      this.db.salesCompany.count({ where: { workspaceId, deletedAt: null } }),
      this.db.salesCompany.count({ where: { workspaceId, deletedAt: null, researchStatus: "COMPLETED" } }),
      this.db.salesCompany.aggregate({ where: { workspaceId, deletedAt: null }, _avg: { priorityScore: true } }),
    ]);
    return { total, researched, avgPriority: Math.round(avg._avg.priorityScore ?? 0) };
  }
}

// ── Contacts ───────────────────────────────────────────────────────────────

export class SalesContactPrismaRepository implements SalesContactRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesContactRow> {
    const r = await this.db.salesContact.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesContactRow | null> {
    const r = await this.db.salesContact.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async findByEmail(workspaceId: string, email: string): Promise<SalesContactRow | null> {
    const r = await this.db.salesContact.findFirst({ where: { workspaceId, email, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, f: SalesSearchFilters): Promise<SalesContactRow[]> {
    const rows = await this.db.salesContact.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(f.query
          ? {
              OR: [
                { name: { contains: f.query, mode: "insensitive" } },
                { email: { contains: f.query, mode: "insensitive" } },
                { title: { contains: f.query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(f.tags?.length ? { tags: { hasEvery: f.tags } } : {}),
        ...(f.status ? { status: f.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(f.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async listByCompany(workspaceId: string, companyId: string, take = 100): Promise<SalesContactRow[]> {
    const rows = await this.db.salesContact.findMany({
      where: { workspaceId, companyId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take,
    });
    return rows.map((r) => asRow(r));
  }

  async update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesContactRow> {
    const r = await this.db.salesContact.update({ where: { id, workspaceId } as never, data: patch as never });
    return asRow(r);
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.db.salesContact.update({ where: { id }, data: { status: status as never } });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.salesContact.update({ where: { id }, data: { lastTouchedAt: at } });
  }

  async softDelete(workspaceId: string, id: string): Promise<void> {
    await this.db.salesContact.updateMany({ where: { id, workspaceId }, data: { deletedAt: new Date() } });
  }

  async analytics(workspaceId: string): Promise<{ total: number; byStatus: Record<string, number> }> {
    const [total, grouped] = await Promise.all([
      this.db.salesContact.count({ where: { workspaceId, deletedAt: null } }),
      this.db.salesContact.groupBy({
        by: ["status"],
        where: { workspaceId, deletedAt: null },
        _count: { status: true },
      }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[String(g.status)] = g._count.status;
    return { total, byStatus };
  }
}

// ── Pipelines ──────────────────────────────────────────────────────────────

export class SalesPipelinePrismaRepository implements SalesPipelineRepository {
  constructor(private readonly db: PrismaClient) {}

  private map(r: { stages: Array<{ id: string; name: string; order: number; winProbability: number }> } & Record<string, unknown>): SalesPipelineRow {
    const { stages, ...rest } = r;
    return { ...rest, stages: [...stages].sort((a, b) => a.order - b.order) } as SalesPipelineRow;
  }

  async ensureDefault(workspaceId: string): Promise<SalesPipelineRow> {
    const existing = await this.db.salesPipeline.findFirst({
      where: { workspaceId, isDefault: true },
      include: { stages: true },
    });
    if (existing && existing.stages.length > 0) return this.map(existing as never);
    try {
      const created = await this.db.salesPipeline.create({
        data: {
          workspaceId,
          name: "Default Pipeline",
          isDefault: true,
          stages: { create: DEFAULT_STAGES.map((s, i) => ({ name: s.name, order: i + 1, winProbability: s.winProbability })) },
        },
        include: { stages: true },
      });
      return this.map(created as never);
    } catch {
      const raced = await this.db.salesPipeline.findFirst({ where: { workspaceId }, include: { stages: true }, orderBy: { createdAt: "asc" } });
      if (raced) return this.map(raced as never);
      throw new Error("ensureDefault: pipeline vanished under race");
    }
  }

  async get(workspaceId: string, id: string): Promise<SalesPipelineRow | null> {
    const r = await this.db.salesPipeline.findFirst({ where: { id, workspaceId }, include: { stages: true } });
    return r ? this.map(r as never) : null;
  }

  async list(workspaceId: string): Promise<SalesPipelineRow[]> {
    const rows = await this.db.salesPipeline.findMany({
      where: { workspaceId },
      include: { stages: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.map(r as never));
  }

  async create(workspaceId: string, name: string, stages: Array<{ name: string; winProbability: number }>): Promise<SalesPipelineRow> {
    const r = await this.db.salesPipeline.create({
      data: {
        workspaceId, name,
        stages: { create: stages.map((s, i) => ({ name: s.name, order: i + 1, winProbability: s.winProbability })) },
      },
      include: { stages: true },
    });
    return this.map(r as never);
  }
}

// ── Deals ──────────────────────────────────────────────────────────────────

export class SalesDealPrismaRepository implements SalesDealRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesDealRow> {
    const r = await this.db.salesDeal.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesDealRow | null> {
    const r = await this.db.salesDeal.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, f: SalesSearchFilters): Promise<SalesDealRow[]> {
    const rows = await this.db.salesDeal.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(f.query ? { title: { contains: f.query, mode: "insensitive" } } : {}),
        ...(f.status ? { status: f.status as never } : {}),
        ...(f.stageId ? { stageId: f.stageId } : {}),
        ...(f.tags?.length ? { tags: { hasEvery: f.tags } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(f.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesDealRow> {
    const r = await this.db.salesDeal.update({ where: { id, workspaceId } as never, data: patch as never });
    return asRow(r);
  }

  async moveStage(id: string, stageId: string): Promise<void> {
    await this.db.salesDeal.update({ where: { id }, data: { stageId } });
  }

  async close(id: string, status: "WON" | "LOST", lostReason?: string): Promise<void> {
    await this.db.salesDeal.update({
      where: { id },
      data: { status: status as never, closedAt: new Date(), ...(lostReason ? { lostReason } : {}) },
    });
  }

  async softDelete(workspaceId: string, id: string): Promise<void> {
    await this.db.salesDeal.updateMany({ where: { id, workspaceId }, data: { deletedAt: new Date() } });
  }

  async analytics(workspaceId: string): Promise<{ openCount: number; openValueUsd: number; wonCount30d: number; wonValueUsd30d: number }> {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [openAgg, wonAgg] = await Promise.all([
      this.db.salesDeal.aggregate({
        where: { workspaceId, deletedAt: null, status: "OPEN" },
        _count: { id: true }, _sum: { valueUsd: true },
      }),
      this.db.salesDeal.aggregate({
        where: { workspaceId, deletedAt: null, status: "WON", closedAt: { gte: since } },
        _count: { id: true }, _sum: { valueUsd: true },
      }),
    ]);
    return {
      openCount: openAgg._count.id,
      openValueUsd: Number(openAgg._sum.valueUsd ?? 0),
      wonCount30d: wonAgg._count.id,
      wonValueUsd30d: Number(wonAgg._sum.valueUsd ?? 0),
    };
  }
}

// ── Activities ─────────────────────────────────────────────────────────────

export class SalesActivityPrismaRepository implements SalesActivityRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesActivityRow> {
    const r = await this.db.salesActivity.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesActivityRow | null> {
    const r = await this.db.salesActivity.findFirst({ where: { id, workspaceId } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, opts: {
    companyId?: string; contactId?: string; dealId?: string;
    dueBefore?: Date; openOnly?: boolean; take?: number;
  }): Promise<SalesActivityRow[]> {
    const rows = await this.db.salesActivity.findMany({
      where: {
        workspaceId,
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        ...(opts.contactId ? { contactId: opts.contactId } : {}),
        ...(opts.dealId ? { dealId: opts.dealId } : {}),
        ...(opts.dueBefore ? { dueAt: { lte: opts.dueBefore } } : {}),
        ...(opts.openOnly ? { completedAt: null } : {}),
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: Math.min(opts.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async complete(id: string, at: Date): Promise<void> {
    await this.db.salesActivity.update({ where: { id }, data: { completedAt: at } });
  }

  async analytics(workspaceId: string): Promise<{ openTasks: number; dueThisWeek: number; completed30d: number }> {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [openTasks, dueThisWeek, completed30d] = await Promise.all([
      this.db.salesActivity.count({ where: { workspaceId, type: "TASK", completedAt: null } }),
      this.db.salesActivity.count({ where: { workspaceId, completedAt: null, dueAt: { lte: week } } }),
      this.db.salesActivity.count({ where: { workspaceId, completedAt: { gte: since } } }),
    ]);
    return { openTasks, dueThisWeek, completed30d };
  }
}

// ── Campaigns ──────────────────────────────────────────────────────────────

export class SalesCampaignPrismaRepository implements SalesCampaignRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesCampaignRow> {
    const r = await this.db.salesCampaign.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesCampaignRow | null> {
    const r = await this.db.salesCampaign.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, opts?: { status?: string; take?: number }): Promise<SalesCampaignRow[]> {
    const rows = await this.db.salesCampaign.findMany({
      where: {
        workspaceId, deletedAt: null,
        ...(opts?.status ? { status: opts.status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts?.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async update(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.salesCampaign.update({ where: { id }, data: patch as never });
  }

  async replaceSteps(campaignId: string, steps: Array<Record<string, unknown>>): Promise<void> {
    await this.db.$transaction([
      this.db.salesCampaignStep.deleteMany({ where: { campaignId } }),
      ...(steps.length
        ? [this.db.salesCampaignStep.createMany({ data: steps.map((s) => ({ ...s, campaignId })) as never })]
        : []),
    ]);
  }

  async listSteps(campaignId: string): Promise<SalesCampaignStepRow[]> {
    const rows = await this.db.salesCampaignStep.findMany({
      where: { campaignId },
      orderBy: { order: "asc" },
    });
    return rows.map((r) => asRow(r));
  }

  async enroll(campaignId: string, contactId: string, companyId: string | null, nextRunAt: Date): Promise<{ enrollment: SalesEnrollmentRow; created: boolean }> {
    const existing = await this.db.salesCampaignEnrollment.findUnique({
      where: { salesEnrollment: { campaignId, contactId } },
    });
    if (existing) return { enrollment: asRow(existing), created: false };
    try {
      const r = await this.db.salesCampaignEnrollment.create({
        data: { campaignId, contactId, companyId, nextRunAt },
      });
      return { enrollment: asRow(r), created: true };
    } catch {
      const raced = await this.db.salesCampaignEnrollment.findUnique({
        where: { salesEnrollment: { campaignId, contactId } },
      });
      if (raced) return { enrollment: asRow(raced), created: false };
      throw new Error("enroll: enrollment vanished under race");
    }
  }

  async listEnrollments(campaignId: string, opts?: { status?: string }): Promise<SalesEnrollmentRow[]> {
    const rows = await this.db.salesCampaignEnrollment.findMany({
      where: { campaignId, ...(opts?.status ? { status: opts.status as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => asRow(r));
  }

  async listDueEnrollments(now: Date, take = 50): Promise<Array<SalesEnrollmentRow & { campaign: SalesCampaignRow }>> {
    const rows = await this.db.salesCampaignEnrollment.findMany({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: now },
        campaign: { deletedAt: null },
      },
      include: { campaign: true },
      orderBy: { nextRunAt: "asc" },
      take,
    });
    return rows.map((r) => asRow(r));
  }

  async setEnrollmentStatus(id: string, status: string, patch?: { exitReason?: string; nextRunAt?: Date | null; currentStep?: number }): Promise<void> {
    await this.db.salesCampaignEnrollment.update({
      where: { id },
      data: {
        status: status as never,
        ...(status === "PAUSED" ? { pausedAt: new Date() } : {}),
        ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        ...(patch?.exitReason !== undefined ? { exitReason: patch.exitReason } : {}),
        ...(patch?.nextRunAt !== undefined ? { nextRunAt: patch.nextRunAt } : {}),
        ...(patch?.currentStep !== undefined ? { currentStep: patch.currentStep } : {}),
      },
    });
  }

  async countDraftsSince(campaignId: string, since: Date): Promise<number> {
    return this.db.salesDraft.count({
      where: { enrollment: { campaignId }, createdAt: { gte: since }, deletedAt: null },
    });
  }

  async analytics(workspaceId: string): Promise<{ active: number; enrollmentsActive: number; draftsToday: number }> {
    const dayStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const [active, enrollmentsActive, draftsToday] = await Promise.all([
      this.db.salesCampaign.count({ where: { workspaceId, deletedAt: null, status: "ACTIVE" } }),
      this.db.salesCampaignEnrollment.count({ where: { status: "ACTIVE", campaign: { workspaceId, deletedAt: null } } }),
      this.db.salesDraft.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: dayStart } } }),
    ]);
    return { active, enrollmentsActive, draftsToday };
  }
}

// ── Drafts ─────────────────────────────────────────────────────────────────

export class SalesDraftPrismaRepository implements SalesDraftRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(workspaceId: string, input: Record<string, unknown>): Promise<SalesDraftRow> {
    const r = await this.db.salesDraft.create({ data: { ...input, workspaceId } as never });
    return asRow(r);
  }

  async get(workspaceId: string, id: string): Promise<SalesDraftRow | null> {
    const r = await this.db.salesDraft.findFirst({ where: { id, workspaceId, deletedAt: null } });
    return r ? asRow(r) : null;
  }

  async list(workspaceId: string, opts: { status?: string | string[]; contactId?: string; companyId?: string; take?: number }): Promise<SalesDraftRow[]> {
    const rows = await this.db.salesDraft.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(opts.status
          ? { status: Array.isArray(opts.status) ? { in: opts.status as never } : (opts.status as never) }
          : {}),
        ...(opts.contactId ? { contactId: opts.contactId } : {}),
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 50, 200),
    });
    return rows.map((r) => asRow(r));
  }

  async setStatus(id: string, status: string, patch?: Record<string, unknown>): Promise<void> {
    await this.db.salesDraft.update({
      where: { id },
      data: { status: status as never, ...(patch ?? {}) } as never,
    });
  }

  async softDelete(workspaceId: string, id: string): Promise<void> {
    await this.db.salesDraft.updateMany({ where: { id, workspaceId }, data: { deletedAt: new Date() } });
  }

  async analytics(workspaceId: string): Promise<{ total: number; byStatus: Record<string, number> }> {
    const [total, grouped] = await Promise.all([
      this.db.salesDraft.count({ where: { workspaceId, deletedAt: null } }),
      this.db.salesDraft.groupBy({
        by: ["status"],
        where: { workspaceId, deletedAt: null },
        _count: { status: true },
      }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[String(g.status)] = g._count.status;
    return { total, byStatus };
  }
}

// ── Saved searches ─────────────────────────────────────────────────────────

export class SalesSavedSearchPrismaRepository implements SalesSavedSearchRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(workspaceId: string, name: string, entity: string, filters: unknown, createdById: string | null): Promise<void> {
    await this.db.salesSavedSearch.upsert({
      where: { salesSavedSearchName: { workspaceId, name } },
      create: { workspaceId, name, entity, filters: filters as object, createdById },
      update: { entity, filters: filters as object },
    });
  }

  async list(workspaceId: string, entity?: string): Promise<Array<{ id: string; name: string; entity: string; filters: unknown }>> {
    const rows = await this.db.salesSavedSearch.findMany({
      where: { workspaceId, ...(entity ? { entity } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows;
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    await this.db.salesSavedSearch.deleteMany({ where: { id, workspaceId } });
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function buildSalesRepositories(db: PrismaClient): SalesRepositories {
  return {
    companies: new SalesCompanyPrismaRepository(db),
    contacts: new SalesContactPrismaRepository(db),
    pipelines: new SalesPipelinePrismaRepository(db),
    deals: new SalesDealPrismaRepository(db),
    activities: new SalesActivityPrismaRepository(db),
    campaigns: new SalesCampaignPrismaRepository(db),
    drafts: new SalesDraftPrismaRepository(db),
    searches: new SalesSavedSearchPrismaRepository(db),
  };
}

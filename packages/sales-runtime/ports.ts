/**
 * Sales Runtime ports — every external concern behind an interface.
 * Prisma adapters live in repositories/prisma.ts; platform bridges
 * (approvals, audit, knowledge, worker dispatch) live in the app glue.
 */
import type {
  CompanyProfile, SalesCampaignStatus, SalesContactStatus,
  SalesSearchFilters, ScoreResult,
} from "./types";

// ── Rows (lean wire copies; json as unknown) ──────────────────────────────

export interface SalesCompanyRow {
  id: string; workspaceId: string; name: string; domain: string | null;
  industry: string | null; size: string | null; geography: string | null;
  businessModel: string | null; productsServices: string | null; targetMarket: string | null;
  techStack: string[]; socialLinks: unknown; summary: string | null; sources: unknown;
  researchStatus: string; lastResearchedAt: Date | null; lastResearchRunId: string | null;
  icpFit: number | null; fitScore: number; priorityScore: number; scoreReasons: unknown;
  tags: string[]; segment: string | null; territory: string | null; ownerId: string | null;
  custom: unknown; createdAt: Date | string; updatedAt: Date | string; deletedAt: Date | null;
}

export interface SalesContactRow {
  id: string; workspaceId: string; companyId: string | null; name: string;
  title: string | null; email: string | null; linkedinUrl: string | null; phone: string | null;
  notes: string | null; status: SalesContactStatus; source: string; tags: string[];
  ownerId: string | null; lastTouchedAt: Date | null; custom: unknown;
  createdAt: Date | string; updatedAt: Date | string; deletedAt: Date | null;
}

export interface SalesPipelineRow {
  id: string; workspaceId: string; name: string; isDefault: boolean;
  stages: Array<{ id: string; name: string; order: number; winProbability: number }>;
}

export interface SalesDealRow {
  id: string; workspaceId: string; companyId: string; primaryContactId: string | null;
  pipelineId: string; stageId: string; title: string; valueUsd: string | number | null;
  currency: string; status: string; expectedCloseAt: Date | null;
  closedAt: Date | null; lostReason: string | null; ownerId: string | null;
  tags: string[]; custom: unknown; createdAt: Date | string; updatedAt: Date | string;
}

export interface SalesActivityRow {
  id: string; workspaceId: string; companyId: string | null; contactId: string | null;
  dealId: string | null; type: string; subject: string; body: string | null;
  dueAt: Date | null; completedAt: Date | null; reminderSentAt: Date | null;
  createdById: string | null; agentRunId: string | null; createdAt: Date | string;
}

export interface SalesCampaignRow {
  id: string; workspaceId: string; name: string; goal: string | null;
  status: SalesCampaignStatus; dailyCap: number; sendWindow: unknown;
  knowledgeContext: string | null; createdById: string | null;
  createdAt: Date | string; updatedAt: Date | string;
}

export interface SalesCampaignStepRow {
  id: string; campaignId: string; order: number; kind: string;
  subject: string | null; bodyTemplate: string | null;
  delayValue: number; delayUnit: string; condition: unknown;
}

export interface SalesEnrollmentRow {
  id: string; campaignId: string; contactId: string; companyId: string | null;
  /** Last EXECUTED step order; -1 = not started (first step may be order 0). */
  status: string; currentStep: number; nextRunAt: Date | null;
  exitReason: string | null; createdAt: Date | string;
}

export interface SalesDraftRow {
  id: string; workspaceId: string; contactId: string | null; companyId: string | null;
  campaignEnrollmentId: string | null; channel: string; subject: string | null; body: string;
  status: string; scheduledAt: Date | null; sentAt: Date | null; threadId: string | null;
  providerMessageId: string | null; deliveryStatus: string;
  approvalId: string | null; agentRunId: string | null; personalization: unknown;
  rejectionNote: string | null; createdById: string | null; createdAt: Date | string; updatedAt: Date | string;
  /** Email delivery pipeline (Phase 6 — connections). */
  emailConnectionId: string | null; sendAttempts: number; sendError: string | null;
}

// ── Repositories ──────────────────────────────────────────────────────────

export interface SalesCompanyRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesCompanyRow>;
  get(workspaceId: string, id: string): Promise<SalesCompanyRow | null>;
  findByDomain(workspaceId: string, domain: string): Promise<SalesCompanyRow | null>;
  list(workspaceId: string, filters: SalesSearchFilters): Promise<SalesCompanyRow[]>;
  update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesCompanyRow>;
  setScores(id: string, icpFit: number | null, fit: ScoreResult, priority: ScoreResult): Promise<void>;
  setResearch(id: string, patch: {
    researchStatus?: string; lastResearchedAt?: Date; lastResearchRunId?: string | null;
    summary?: string; sources?: unknown; industry?: string; size?: string; geography?: string;
    businessModel?: string; productsServices?: string; targetMarket?: string; techStack?: string[];
    socialLinks?: unknown;
  }): Promise<void>;
  softDelete(workspaceId: string, id: string): Promise<void>;
  /** Batch counter for scoring (contact + open-deal counts per company). */
  countsByCompany(workspaceId: string, companyId: string): Promise<{ contacts: number; openDeals: number }>;
  /** Aggregate for the analytics dashboard. */
  analytics(workspaceId: string): Promise<{ total: number; researched: number; avgPriority: number }>;
}

export interface SalesContactRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesContactRow>;
  get(workspaceId: string, id: string): Promise<SalesContactRow | null>;
  findByEmail(workspaceId: string, email: string): Promise<SalesContactRow | null>;
  list(workspaceId: string, filters: SalesSearchFilters): Promise<SalesContactRow[]>;
  listByCompany(workspaceId: string, companyId: string, take?: number): Promise<SalesContactRow[]>;
  update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesContactRow>;
  setStatus(id: string, status: SalesContactStatus): Promise<void>;
  touch(id: string, at: Date): Promise<void>;
  softDelete(workspaceId: string, id: string): Promise<void>;
  analytics(workspaceId: string): Promise<{ total: number; byStatus: Record<string, number> }>;
}

export interface SalesPipelineRepository {
  /** Idempotent: returns the default pipeline, creating it with the
   *  standard stages on first call. */
  ensureDefault(workspaceId: string): Promise<SalesPipelineRow>;
  get(workspaceId: string, id: string): Promise<SalesPipelineRow | null>;
  list(workspaceId: string): Promise<SalesPipelineRow[]>;
  create(workspaceId: string, name: string, stages: Array<{ name: string; winProbability: number }>): Promise<SalesPipelineRow>;
}

export interface SalesDealRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesDealRow>;
  get(workspaceId: string, id: string): Promise<SalesDealRow | null>;
  list(workspaceId: string, filters: SalesSearchFilters): Promise<SalesDealRow[]>;
  update(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<SalesDealRow>;
  moveStage(id: string, stageId: string): Promise<void>;
  close(id: string, status: "WON" | "LOST", lostReason?: string): Promise<void>;
  softDelete(workspaceId: string, id: string): Promise<void>;
  analytics(workspaceId: string): Promise<{ openCount: number; openValueUsd: number; wonCount30d: number; wonValueUsd30d: number }>;
}

export interface SalesActivityRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesActivityRow>;
  get(workspaceId: string, id: string): Promise<SalesActivityRow | null>;
  list(workspaceId: string, opts: {
    companyId?: string; contactId?: string; dealId?: string;
    dueBefore?: Date; openOnly?: boolean; take?: number;
  }): Promise<SalesActivityRow[]>;
  complete(id: string, at: Date): Promise<void>;
  analytics(workspaceId: string): Promise<{ openTasks: number; dueThisWeek: number; completed30d: number }>;
}

export interface SalesCampaignRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesCampaignRow>;
  get(workspaceId: string, id: string): Promise<SalesCampaignRow | null>;
  list(workspaceId: string, opts?: { status?: SalesCampaignStatus; take?: number }): Promise<SalesCampaignRow[]>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  replaceSteps(campaignId: string, steps: Array<Record<string, unknown>>): Promise<void>;
  listSteps(campaignId: string): Promise<SalesCampaignStepRow[]>;
  enroll(campaignId: string, contactId: string, companyId: string | null, nextRunAt: Date): Promise<{ enrollment: SalesEnrollmentRow; created: boolean }>;
  listEnrollments(campaignId: string, opts?: { status?: string }): Promise<SalesEnrollmentRow[]>;
  listDueEnrollments(now: Date, take?: number): Promise<Array<SalesEnrollmentRow & { campaign: SalesCampaignRow }>>;
  setEnrollmentStatus(id: string, status: string, patch?: { exitReason?: string; nextRunAt?: Date | null; currentStep?: number }): Promise<void>;
  countDraftsSince(campaignId: string, since: Date): Promise<number>;
  analytics(workspaceId: string): Promise<{ active: number; enrollmentsActive: number; draftsToday: number }>;
}

export interface SalesDraftRepository {
  create(workspaceId: string, input: Record<string, unknown>): Promise<SalesDraftRow>;
  get(workspaceId: string, id: string): Promise<SalesDraftRow | null>;
  list(workspaceId: string, opts: { status?: string | string[]; contactId?: string; companyId?: string; take?: number }): Promise<SalesDraftRow[]>;
  setStatus(id: string, status: string, patch?: {
    subject?: string | null; body?: string; scheduledAt?: Date | null; sentAt?: Date | null;
    rejectionNote?: string | null; approvalId?: string | null; agentRunId?: string | null;
    deliveryStatus?: string; providerMessageId?: string | null; threadId?: string | null;
  }): Promise<void>;
  softDelete(workspaceId: string, id: string): Promise<void>;
  analytics(workspaceId: string): Promise<{ total: number; byStatus: Record<string, number> }>;
}

export interface SalesSavedSearchRepository {
  upsert(workspaceId: string, name: string, entity: string, filters: unknown, createdById: string | null): Promise<void>;
  list(workspaceId: string, entity?: string): Promise<Array<{ id: string; name: string; entity: string; filters: unknown }>>;
  delete(workspaceId: string, id: string): Promise<void>;
}

export interface SalesSettingsRow {
  id: string; workspaceId: string;
  icpProfile: unknown; defaultSendWindow: unknown;
  senderName: string | null; senderTitle: string | null;
  updatedAt: Date | string;
}

export interface SalesSettingsRepository {
  get(workspaceId: string): Promise<SalesSettingsRow | null>;
  /** Race-safe upsert keyed on the unique workspaceId. */
  upsert(workspaceId: string, patch: {
    icpProfile?: unknown; defaultSendWindow?: unknown;
    senderName?: string | null; senderTitle?: string | null;
  }): Promise<SalesSettingsRow>;
}

export interface SalesRepositories {
  companies: SalesCompanyRepository;
  contacts: SalesContactRepository;
  pipelines: SalesPipelineRepository;
  deals: SalesDealRepository;
  activities: SalesActivityRepository;
  campaigns: SalesCampaignRepository;
  drafts: SalesDraftRepository;
  searches: SalesSavedSearchRepository;
  settings: SalesSettingsRepository;
}

// ── Platform bridges ──────────────────────────────────────────────────────

/** Draft review bridge into the Phase-2/3 Approval table. */
export interface SalesApprovalBridge {
  createForDraft(input: {
    workspaceId: string;
    draftId: string;
    channel: string;
    contactLabel: string;
    subject: string | null;
    body: string;
    requestedTo: string;
  }): Promise<{ approvalId: string }>;
  statusOf(approvalId: string): Promise<"PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | null>;
}

/** Knowledge retrieval seam (Phase-3 knowledge base + playbooks). */
export interface SalesKnowledgeRetrieval {
  search(workspaceId: string, query: string, limit?: number): Promise<Array<{ title: string; content: string }>>;
}

/** Worker dispatch seam (Phase-5 agent runtime) for company research. */
export interface SalesResearchDispatcher {
  /** Queue (or dedupe) a research worker run for the company; returns the run id. */
  dispatch(workspaceId: string, company: SalesCompanyRow, opts: { byUserId?: string | null }): Promise<{ runId: string }>;
  /** Read a run's status + parsed company profile when complete. */
  readResult(workspaceId: string, runId: string): Promise<{
    status: "QUEUED" | "RUNNING" | "NEEDS_APPROVAL" | "SUCCEEDED" | "FAILED" | "CANCELED";
    profile: CompanyProfile | null;
    error: string | null;
  }>;
}

export interface SalesAuditSink {
  log(entry: {
    workspaceId: string; actorId?: string | null; action: string;
    target?: string | null; metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface SalesClock {
  now(): Date;
}

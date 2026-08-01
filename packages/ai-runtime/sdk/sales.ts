/**
 * Sales sub-client for the MoniClaw TypeScript SDK — typed access to the
 * /api/sales/* surface (Phase 6 AI Sales Employee). Kept dependency-free and
 * structurally identical to the other sub-clients (thin, 1:1 with routes).
 */
import type { MoniClawClient } from "./client";

// ── DTOs (lean wire shapes; JSON fields kept as unknown) ─────────────────

export interface SalesCompanyDto {
  id: string; workspaceId: string; name: string; domain: string | null;
  industry: string | null; size: string | null; geography: string | null;
  businessModel: string | null; productsServices: string | null; targetMarket: string | null;
  techStack: string[]; socialLinks: unknown; summary: string | null; sources: unknown;
  researchStatus: string; lastResearchedAt: string | null; lastResearchRunId: string | null;
  icpFit: number | null; fitScore: number; priorityScore: number; scoreReasons: unknown;
  tags: string[]; segment: string | null; territory: string | null; ownerId: string | null;
  custom: unknown; createdAt: string; updatedAt: string;
}

export interface SalesContactDto {
  id: string; workspaceId: string; companyId: string | null; name: string;
  title: string | null; email: string | null; linkedinUrl: string | null; phone: string | null;
  notes: string | null; status: string; source: string; tags: string[];
  ownerId: string | null; lastTouchedAt: string | null; custom: unknown;
  createdAt: string; updatedAt: string;
}

export interface SalesPipelineDto {
  id: string; workspaceId: string; name: string; isDefault: boolean;
  stages: Array<{ id: string; name: string; order: number; winProbability: number }>;
}

export interface SalesDealDto {
  id: string; workspaceId: string; companyId: string; primaryContactId: string | null;
  pipelineId: string; stageId: string; title: string; valueUsd: string | number | null;
  currency: string; status: string; expectedCloseAt: string | null;
  closedAt: string | null; lostReason: string | null; ownerId: string | null;
  tags: string[]; custom: unknown; createdAt: string; updatedAt: string;
}

export interface SalesActivityDto {
  id: string; workspaceId: string; companyId: string | null; contactId: string | null;
  dealId: string | null; type: string; subject: string; body: string | null;
  dueAt: string | null; completedAt: string | null; reminderSentAt: string | null;
  createdById: string | null; agentRunId: string | null; createdAt: string;
}

export interface SalesCampaignDto {
  id: string; workspaceId: string; name: string; goal: string | null;
  status: string; dailyCap: number; sendWindow: unknown; knowledgeContext: string | null;
  createdById: string | null; createdAt: string; updatedAt: string;
}

export interface SalesCampaignStepDto {
  id: string; campaignId: string; order: number; kind: string;
  subject: string | null; bodyTemplate: string | null;
  delayValue: number; delayUnit: string; condition: unknown;
}

export interface SalesEnrollmentDto {
  id: string; campaignId: string; contactId: string; companyId: string | null;
  status: string; currentStep: number; nextRunAt: string | null;
  exitReason: string | null; createdAt: string;
}

export interface SalesDraftDto {
  id: string; workspaceId: string; contactId: string | null; companyId: string | null;
  campaignEnrollmentId: string | null; channel: string; subject: string | null; body: string;
  status: string; scheduledAt: string | null; sentAt: string | null; threadId: string | null;
  providerMessageId: string | null; deliveryStatus: string;
  emailConnectionId: string | null; sendAttempts: number; sendError: string | null;
  approvalId: string | null; agentRunId: string | null; personalization: unknown;
  rejectionNote: string | null; createdById: string | null; createdAt: string; updatedAt: string;
}

/** Credential-free projection — the server never exposes the stored password. */
export interface EmailConnectionDto {
  id: string; workspaceId: string; provider: "SES" | "SMTP" | string; label: string;
  senderName: string | null; senderEmail: string;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string | null;
  region: string | null; status: "UNVERIFIED" | "VERIFIED" | "FAILED" | string;
  isDefault: boolean; lastVerifiedAt: string | null; lastError: string | null;
  createdAt: string; updatedAt: string;
}

export interface EmailConnectionCreateInput {
  provider: "SES" | "SMTP";
  label: string;
  senderEmail: string;
  senderName?: string;
  region?: string; // SES — the catalog comes from email.list().sesRegions
  smtpHost?: string; smtpPort?: number; smtpSecure?: boolean; // SMTP
  smtpUsername?: string; password?: string;
  isDefault?: boolean;
}

export interface SalesOverviewDto {
  companies: { total: number; researched: number; avgPriority: number };
  contacts: { total: number; byStatus: Record<string, number> };
  deals: { openCount: number; openValueUsd: number; wonCount30d: number; wonValueUsd30d: number };
  activities: { openTasks: number; dueThisWeek: number; completed30d: number };
  drafts: { total: number; byStatus: Record<string, number> };
  campaigns: { active: number; enrollmentsActive: number; draftsToday: number };
}

export interface SalesSearchFilters {
  query?: string; tags?: string[]; segment?: string; territory?: string;
  industry?: string; status?: string; stageId?: string;
  minPriority?: number; minFit?: number; hasOpenDeal?: boolean; take?: number;
}

// ── Client ────────────────────────────────────────────────────────────────

type Query = Record<string, string | number | undefined>;

export class SalesClient {
  readonly companies: SalesCompaniesClient;
  readonly contacts: SalesContactsClient;
  readonly deals: SalesDealsClient;
  readonly activities: SalesActivitiesClient;
  readonly pipelines: SalesPipelinesClient;
  readonly campaigns: SalesCampaignsClient;
  readonly drafts: SalesDraftsClient;
  readonly searches: SalesSearchesClient;
  readonly email: SalesEmailClient;

  constructor(private readonly client: MoniClawClient) {
    this.companies = new SalesCompaniesClient(client);
    this.contacts = new SalesContactsClient(client);
    this.deals = new SalesDealsClient(client);
    this.activities = new SalesActivitiesClient(client);
    this.pipelines = new SalesPipelinesClient(client);
    this.campaigns = new SalesCampaignsClient(client);
    this.drafts = new SalesDraftsClient(client);
    this.searches = new SalesSearchesClient(client);
    this.email = new SalesEmailClient(client);
  }

  analytics() {
    return this.client.request<{ overview: SalesOverviewDto }>("GET", "/api/sales/analytics/overview");
  }

  settings() {
    return this.client.request<{ settings: unknown }>("GET", "/api/sales/settings");
  }

  updateSettings(patch: {
    icpProfile?: unknown; defaultSendWindow?: unknown;
    senderName?: string | null; senderTitle?: string | null;
  }) {
    return this.client.request<{ settings: unknown }>("PATCH", "/api/sales/settings", patch);
  }
}

function filtersQuery(filters: SalesSearchFilters | undefined): Query {
  return {
    query: filters?.query,
    tags: filters?.tags?.length ? filters.tags.join(",") : undefined,
    segment: filters?.segment, territory: filters?.territory, industry: filters?.industry,
    status: filters?.status, stageId: filters?.stageId,
    minPriority: filters?.minPriority, minFit: filters?.minFit,
    hasOpenDeal: filters?.hasOpenDeal === undefined ? undefined : String(filters.hasOpenDeal), take: filters?.take,
  };
}

class SalesCompaniesClient {
  constructor(private readonly client: MoniClawClient) {}

  list(filters?: SalesSearchFilters) {
    return this.client.request<{ companies: SalesCompanyDto[] }>("GET", "/api/sales/companies", undefined, { query: filtersQuery(filters) });
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ company: SalesCompanyDto }>("POST", "/api/sales/companies", input);
  }

  get(id: string) {
    return this.client.request<{
      company: SalesCompanyDto; contacts: SalesContactDto[]; deals: SalesDealDto[];
      activities: SalesActivityDto[]; counts: { contacts: number; openDeals: number };
    }>("GET", `/api/sales/companies/${id}`);
  }

  update(id: string, patch: Record<string, unknown>) {
    return this.client.request<{ company: SalesCompanyDto }>("PATCH", `/api/sales/companies/${id}`, patch);
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/companies/${id}`);
  }

  /** Queue the public-source research worker (idempotent while in-flight). */
  requestResearch(id: string) {
    return this.client.request<{ runId: string; reused: boolean }>("POST", `/api/sales/companies/${id}/research`);
  }

  /** Read research status; reconciles a finished run on demand. */
  researchStatus(id: string) {
    return this.client.request<{
      researchStatus: string; lastResearchedAt: string | null;
      lastResearchRunId: string | null; summary: string | null; sources: unknown;
    }>("GET", `/api/sales/companies/${id}/research`);
  }
}

class SalesContactsClient {
  constructor(private readonly client: MoniClawClient) {}

  list(filters?: SalesSearchFilters) {
    return this.client.request<{ contacts: SalesContactDto[] }>("GET", "/api/sales/contacts", undefined, { query: filtersQuery(filters) });
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ contact: SalesContactDto }>("POST", "/api/sales/contacts", input);
  }

  get(id: string) {
    return this.client.request<{
      contact: SalesContactDto; activities: SalesActivityDto[];
      drafts: SalesDraftDto[]; company: SalesCompanyDto | null;
    }>("GET", `/api/sales/contacts/${id}`);
  }

  update(id: string, patch: Record<string, unknown>) {
    return this.client.request<{ contact: SalesContactDto }>("PATCH", `/api/sales/contacts/${id}`, patch);
  }

  qualify(id: string) {
    return this.client.request<{ contact: SalesContactDto }>("POST", `/api/sales/contacts/${id}/qualify`);
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/contacts/${id}`);
  }
}

class SalesDealsClient {
  constructor(private readonly client: MoniClawClient) {}

  list(filters?: SalesSearchFilters) {
    return this.client.request<{ deals: SalesDealDto[] }>("GET", "/api/sales/deals", undefined, { query: filtersQuery(filters) });
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ deal: SalesDealDto }>("POST", "/api/sales/deals", input);
  }

  get(id: string) {
    return this.client.request<{
      deal: SalesDealDto; pipeline: SalesPipelineDto | null;
      company: SalesCompanyDto | null; contact: SalesContactDto | null; activities: SalesActivityDto[];
    }>("GET", `/api/sales/deals/${id}`);
  }

  update(id: string, patch: Record<string, unknown>) {
    return this.client.request<{ deal: SalesDealDto }>("PATCH", `/api/sales/deals/${id}`, patch);
  }

  moveStage(id: string, stageId: string) {
    return this.client.request<{ deal: SalesDealDto }>("POST", `/api/sales/deals/${id}/move`, { stageId });
  }

  close(id: string, status: "WON" | "LOST", lostReason?: string) {
    return this.client.request<{ deal: SalesDealDto }>("POST", `/api/sales/deals/${id}/close`, { status, lostReason });
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/deals/${id}`);
  }
}

class SalesActivitiesClient {
  constructor(private readonly client: MoniClawClient) {}

  list(opts?: { companyId?: string; contactId?: string; dealId?: string; openOnly?: boolean; dueBefore?: string; take?: number }) {
    return this.client.request<{ activities: SalesActivityDto[] }>("GET", "/api/sales/activities", undefined, {
      query: { companyId: opts?.companyId, contactId: opts?.contactId, dealId: opts?.dealId, openOnly: opts?.openOnly === undefined ? undefined : String(opts.openOnly), dueBefore: opts?.dueBefore, take: opts?.take },
    });
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ activity: SalesActivityDto }>("POST", "/api/sales/activities", input);
  }

  complete(id: string) {
    return this.client.request<{ completed: boolean }>("POST", `/api/sales/activities/${id}/complete`);
  }
}

class SalesPipelinesClient {
  constructor(private readonly client: MoniClawClient) {}

  list() {
    return this.client.request<{ pipelines: SalesPipelineDto[] }>("GET", "/api/sales/pipelines");
  }

  create(name: string, stages: Array<{ name: string; winProbability?: number }>) {
    return this.client.request<{ pipeline: SalesPipelineDto }>("POST", "/api/sales/pipelines", { name, stages });
  }
}

class SalesCampaignsClient {
  constructor(private readonly client: MoniClawClient) {}

  list(opts?: { status?: string; take?: number }) {
    return this.client.request<{ campaigns: SalesCampaignDto[] }>("GET", "/api/sales/campaigns", undefined, {
      query: { status: opts?.status, take: opts?.take },
    });
  }

  create(input: Record<string, unknown>) {
    return this.client.request<{ campaign: SalesCampaignDto; steps: number }>("POST", "/api/sales/campaigns", input);
  }

  get(id: string) {
    return this.client.request<{
      campaign: SalesCampaignDto; steps: SalesCampaignStepDto[]; enrollments: SalesEnrollmentDto[];
    }>("GET", `/api/sales/campaigns/${id}`);
  }

  update(id: string, patch: Record<string, unknown>) {
    return this.client.request<{ campaign: SalesCampaignDto }>("PATCH", `/api/sales/campaigns/${id}`, patch);
  }

  setStatus(id: string, status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED") {
    return this.client.request<{ campaign: SalesCampaignDto }>("PATCH", `/api/sales/campaigns/${id}`, { status });
  }

  replaceSteps(id: string, steps: Array<Record<string, unknown>>) {
    return this.client.request<{ steps: SalesCampaignStepDto[] }>("PUT", `/api/sales/campaigns/${id}/steps`, { steps });
  }

  enroll(id: string, contactIds: string | string[]) {
    const ids = Array.isArray(contactIds) ? contactIds : [contactIds];
    return this.client.request<{
      results: Array<{ contactId: string; enrollmentId?: string; created?: boolean; error?: string }>;
      created: number;
    }>("POST", `/api/sales/campaigns/${id}/enroll`, ids.length === 1 ? { contactId: ids[0] } : { contactIds: ids });
  }

  enrollments(id: string, status?: string) {
    return this.client.request<{ enrollments: SalesEnrollmentDto[] }>("GET", `/api/sales/campaigns/${id}/enrollments`, undefined, {
      query: { status },
    });
  }

  setEnrollmentStatus(id: string, enrollmentId: string, status: "ACTIVE" | "PAUSED" | "UNSUBSCRIBED") {
    return this.client.request<{ enrollmentId: string; status: string }>(
      "PATCH", `/api/sales/campaigns/${id}/enrollments/${enrollmentId}`, { status }
    );
  }
}

class SalesDraftsClient {
  constructor(private readonly client: MoniClawClient) {}

  list(opts?: { status?: string | string[]; contactId?: string; companyId?: string; take?: number }) {
    const status = Array.isArray(opts?.status) ? opts!.status.join(",") : opts?.status;
    return this.client.request<{ drafts: SalesDraftDto[] }>("GET", "/api/sales/drafts", undefined, {
      query: { status, contactId: opts?.contactId, companyId: opts?.companyId, take: opts?.take },
    });
  }

  create(input: { contactId?: string; companyId?: string; channel?: string; subject?: string; body: string }) {
    return this.client.request<{ draft: SalesDraftDto }>("POST", "/api/sales/drafts", input);
  }

  get(id: string) {
    return this.client.request<{
      draft: SalesDraftDto; contact: SalesContactDto | null;
      company: SalesCompanyDto | null; approval: unknown;
    }>("GET", `/api/sales/drafts/${id}`);
  }

  update(id: string, patch: { subject?: string | null; body?: string; channel?: string }) {
    return this.client.request<{ draft: SalesDraftDto }>("PATCH", `/api/sales/drafts/${id}`, patch);
  }

  /** DRAFT/REJECTED → PENDING_REVIEW (+ manager approval row). */
  submit(id: string) {
    return this.client.request<{ draft: SalesDraftDto; approvalId: string }>("POST", `/api/sales/drafts/${id}/submit`);
  }

  /** Manager path — also available in the shared approvals inbox. */
  approve(id: string, note?: string) {
    return this.client.request<{ draft: SalesDraftDto }>("POST", `/api/sales/drafts/${id}/approve`, { note });
  }

  reject(id: string, note?: string) {
    return this.client.request<{ draft: SalesDraftDto }>("POST", `/api/sales/drafts/${id}/reject`, { note });
  }

  reschedule(id: string, scheduledAt: string) {
    return this.client.request<{ draft: SalesDraftDto }>("POST", `/api/sales/drafts/${id}/reschedule`, { scheduledAt });
  }

  /**
   * Manager's explicit "send now" on an APPROVED draft — delivers it via the
   * workspace's default (or the given) email connection. Atomically claimed
   * (double-click safe); a transient provider failure reschedules the draft
   * for the cron tick, three attempts mark it FAILED.
   */
  send(id: string, connectionId?: string) {
    return this.client.request<{
      result: { draftId: string; status: "SENT" | "SCHEDULED" | "FAILED"; attempts: number; messageId?: string | null; error?: string | null };
    }>("POST", `/api/sales/drafts/${id}/send`, connectionId ? { connectionId } : {});
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/drafts/${id}`);
  }
}

class SalesSearchesClient {
  constructor(private readonly client: MoniClawClient) {}

  list(entity?: string) {
    return this.client.request<{ searches: Array<{ id: string; name: string; entity: string; filters: unknown }> }>(
      "GET", "/api/sales/searches", undefined, { query: { entity } }
    );
  }

  save(name: string, entity: "companies" | "contacts" | "deals", filters: SalesSearchFilters) {
    return this.client.request<{ searches: Array<{ id: string; name: string; entity: string; filters: unknown }> }>(
      "POST", "/api/sales/searches", { name, entity, filters }
    );
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/searches/${id}`);
  }
}

class SalesEmailClient {
  constructor(private readonly client: MoniClawClient) {}

  /** Connections + the SES region catalog (render the same presets as the UI). */
  list() {
    return this.client.request<{
      connections: EmailConnectionDto[];
      sesRegions: Array<{ region: string; smtpHost: string }>;
    }>("GET", "/api/sales/email/connections");
  }

  create(input: EmailConnectionCreateInput) {
    return this.client.request<{ connection: EmailConnectionDto }>("POST", "/api/sales/email/connections", input);
  }

  update(id: string, patch: Partial<EmailConnectionCreateInput>) {
    return this.client.request<{ connection: EmailConnectionDto }>("PATCH", `/api/sales/email/connections/${id}`, patch);
  }

  delete(id: string) {
    return this.client.request<{ deleted: boolean }>("DELETE", `/api/sales/email/connections/${id}`);
  }

  /**
   * SMTP handshake (+ optional real test email to `testTo`). Success stamps
   * VERIFIED; failure stamps FAILED + lastError — the body carries the result
   * either way, the HTTP status reflects it (200 verified / 502 failed).
   */
  verify(id: string, testTo?: string) {
    return this.client.request<{
      result: { status: "VERIFIED" | "FAILED"; handshake: boolean; testSent?: boolean; error?: string | null };
    }>("POST", `/api/sales/email/connections/${id}/verify`, testTo ? { testTo } : {});
  }
}

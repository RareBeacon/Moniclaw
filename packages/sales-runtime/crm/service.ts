/**
 * SalesCrmService — application service over the CRM repositories.
 * Owns business rules: domain/email dedupe, score recompute, pipeline
 * defaults, deal close semantics, activity side-effects, audit trail.
 */
import { SalesError } from "../errors";
import {
  computeFitScore, computeIcpFit, computePriority, normalizeDomain,
} from "../scoring";
import type {
  ActivityInput, CompanyInput, ContactInput, DealInput, IcpProfile,
} from "../types";
import type {
  SalesActivityRow, SalesAuditSink, SalesCompanyRow, SalesContactRow, SalesDealRow, SalesRepositories,
} from "../ports";

export interface CrmDeps {
  repos: SalesRepositories;
  audit: SalesAuditSink;
}

export class SalesCrmService {
  constructor(private readonly deps: CrmDeps) {}

  // ── Companies ───────────────────────────────────────────────────────────

  async createCompany(workspaceId: string, actorId: string | null, input: CompanyInput): Promise<SalesCompanyRow> {
    const domain = normalizeDomain(input.domain);
    if (input.domain && !domain) {
      throw new SalesError("validation", "Not a valid company domain (expected something like acme.com).");
    }
    if (domain && (await this.deps.repos.companies.findByDomain(workspaceId, domain))) {
      throw new SalesError("conflict", `A company with domain ${domain} already exists.`);
    }
    const row = await this.deps.repos.companies.create(workspaceId, {
      ...input, domain,
      ...(input.custom ? { custom: input.custom as object } : {}),
    });
    await this.rescoreCompany(workspaceId, row.id, null);
    await this.deps.audit.log({
      workspaceId, actorId, action: "sales.company.create", target: row.id,
      metadata: { name: row.name, domain },
    });
    return (await this.deps.repos.companies.get(workspaceId, row.id))!;
  }

  async updateCompany(workspaceId: string, actorId: string | null, id: string, patch: Partial<CompanyInput>): Promise<SalesCompanyRow> {
    const existing = await this.requireCompany(workspaceId, id);
    if (patch.domain !== undefined) {
      const nextDomain = normalizeDomain(patch.domain);
      if (patch.domain && !nextDomain) throw new SalesError("validation", "Not a valid company domain.");
      if (nextDomain && nextDomain !== existing.domain) {
        const clash = await this.deps.repos.companies.findByDomain(workspaceId, nextDomain);
        if (clash && clash.id !== id) throw new SalesError("conflict", `A company with domain ${nextDomain} already exists.`);
      }
      (patch as Record<string, unknown>).domain = nextDomain;
    }
    await this.deps.repos.companies.update(workspaceId, id, patch as Record<string, unknown>);
    await this.rescoreCompany(workspaceId, id, null);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.company.update", target: id, metadata: { fields: Object.keys(patch) } });
    return (await this.deps.repos.companies.get(workspaceId, id))!;
  }

  /**
   * Recompute fit + (+icp when supplied) + priority, persisting the reasons.
   * Also recomputes when contacts/deals change via logActivity / deal ops.
   */
  async rescoreCompany(workspaceId: string, companyId: string, icp: IcpProfile | null): Promise<void> {
    const company = await this.requireCompany(workspaceId, companyId);
    const counts = await this.deps.repos.companies.countsByCompany(workspaceId, companyId);
    const strongest = await this.strongestContactStatus(workspaceId, companyId);

    const fit = computeFitScore({
      domain: company.domain, industry: company.industry, size: company.size,
      geography: company.geography, summary: company.summary,
      techStack: company.techStack ?? [],
      socialLinkCount: Array.isArray(company.socialLinks) ? (company.socialLinks as unknown[]).length : 0,
      researchCompleted: company.researchStatus === "COMPLETED",
      contactCount: counts.contacts, openDealCount: counts.openDeals,
    });
    const icpResult = icp
      ? computeIcpFit(
          {
            industry: company.industry, size: company.size, geography: company.geography,
            textCorpus: [company.summary, company.productsServices, company.targetMarket].filter(Boolean).join("\n"),
          },
          icp
        )
      : null;
    const priority = computePriority({
      fitScore: fit.score,
      icpFit: icpResult ? icpResult.score : company.icpFit,
      contactStatus: strongest,
      lastTouchedAt: company.updatedAt,
      openDealCount: counts.openDeals,
    });
    await this.deps.repos.companies.setScores(
      companyId,
      icpResult ? icpResult.score : company.icpFit,
      fit,
      { score: priority.score, reasons: [...(icpResult?.reasons ?? []), ...priority.reasons] }
    );
  }

  async deleteCompany(workspaceId: string, actorId: string | null, id: string): Promise<void> {
    await this.requireCompany(workspaceId, id);
    await this.deps.repos.companies.softDelete(workspaceId, id);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.company.delete", target: id });
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  async createContact(workspaceId: string, actorId: string | null, input: ContactInput): Promise<SalesContactRow> {
    const email = input.email?.toLowerCase() ?? null;
    if (email && (await this.deps.repos.contacts.findByEmail(workspaceId, email))) {
      throw new SalesError("conflict", `A contact with email ${email} already exists.`);
    }
    if (input.companyId) await this.requireCompany(workspaceId, input.companyId);
    const row = await this.deps.repos.contacts.create(workspaceId, { ...input, email });
    if (row.companyId) await this.rescoreCompany(workspaceId, row.companyId, null);
    await this.deps.audit.log({
      workspaceId, actorId, action: "sales.contact.create", target: row.id,
      metadata: { name: row.name, companyId: row.companyId },
    });
    return row;
  }

  async updateContact(workspaceId: string, actorId: string | null, id: string, patch: Partial<ContactInput> & { status?: SalesContactRow["status"] }): Promise<SalesContactRow> {
    const existing = await this.requireContact(workspaceId, id);
    if (patch.email !== undefined && patch.email !== existing.email) {
      const email = patch.email?.toLowerCase() ?? null;
      if (email) {
        const clash = await this.deps.repos.contacts.findByEmail(workspaceId, email);
        if (clash && clash.id !== id) throw new SalesError("conflict", `A contact with email ${email} already exists.`);
      }
      (patch as Record<string, unknown>).email = email;
    }
    if (patch.companyId) await this.requireCompany(workspaceId, patch.companyId);
    await this.deps.repos.contacts.update(workspaceId, id, patch as Record<string, unknown>);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.contact.update", target: id, metadata: { fields: Object.keys(patch) } });
    return (await this.deps.repos.contacts.get(workspaceId, id))!;
  }

  async qualifyContact(workspaceId: string, actorId: string | null, id: string): Promise<SalesContactRow> {
    const contact = await this.requireContact(workspaceId, id);
    if (!["NEW", "CONTACTED", "ENGAGED"].includes(contact.status)) {
      throw new SalesError("conflict", `Contact in status ${contact.status} cannot be qualified from here.`);
    }
    await this.deps.repos.contacts.setStatus(id, "QUALIFIED");
    if (contact.companyId) await this.rescoreCompany(workspaceId, contact.companyId, null);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.contact.qualify", target: id });
    return (await this.deps.repos.contacts.get(workspaceId, id))!;
  }

  async deleteContact(workspaceId: string, actorId: string | null, id: string): Promise<void> {
    const contact = await this.requireContact(workspaceId, id);
    await this.deps.repos.contacts.softDelete(workspaceId, id);
    if (contact.companyId) await this.rescoreCompany(workspaceId, contact.companyId, null);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.contact.delete", target: id });
  }

  // ── Deals ────────────────────────────────────────────────────────────────

  async createDeal(workspaceId: string, actorId: string | null, input: DealInput): Promise<SalesDealRow> {
    await this.requireCompany(workspaceId, input.companyId);
    if (input.primaryContactId) {
      const contact = await this.requireContact(workspaceId, input.primaryContactId);
      if (contact.companyId && contact.companyId !== input.companyId) {
        throw new SalesError("validation", "Primary contact belongs to a different company.");
      }
    }
    const pipeline = input.pipelineId
      ? await this.deps.repos.pipelines.get(workspaceId, input.pipelineId)
      : await this.deps.repos.pipelines.ensureDefault(workspaceId);
    if (!pipeline) throw new SalesError("not_found", "Pipeline not found.");
    const stage = input.stageId
      ? pipeline.stages.find((s) => s.id === input.stageId)
      : [...pipeline.stages].sort((a, b) => a.order - b.order)[0];
    if (!stage) throw new SalesError("validation", "Pipeline has no such stage.");

    const row = await this.deps.repos.deals.create(workspaceId, {
      ...input, pipelineId: pipeline.id, stageId: stage.id,
      ...(input.expectedCloseAt ? { expectedCloseAt: new Date(input.expectedCloseAt) } : {}),
    });
    await this.rescoreCompany(workspaceId, input.companyId, null);
    await this.deps.audit.log({
      workspaceId, actorId, action: "sales.deal.create", target: row.id,
      metadata: { title: row.title, companyId: input.companyId, stage: stage.name },
    });
    return row;
  }

  async moveDealStage(workspaceId: string, actorId: string | null, dealId: string, stageId: string): Promise<SalesDealRow> {
    const deal = await this.requireDeal(workspaceId, dealId);
    if (deal.status !== "OPEN") throw new SalesError("conflict", `Deal is ${deal.status} — closed deals cannot move stages.`);
    const pipeline = await this.deps.repos.pipelines.get(workspaceId, deal.pipelineId);
    const stage = pipeline?.stages.find((s) => s.id === stageId);
    if (!stage) throw new SalesError("not_found", "Stage not found in this deal's pipeline.");
    await this.deps.repos.deals.moveStage(dealId, stageId);
    await this.deps.audit.log({
      workspaceId, actorId, action: "sales.deal.move", target: dealId,
      metadata: { stage: stage.name },
    });
    return (await this.deps.repos.deals.get(workspaceId, dealId))!;
  }

  async closeDeal(workspaceId: string, actorId: string | null, dealId: string, status: "WON" | "LOST", lostReason?: string): Promise<SalesDealRow> {
    const deal = await this.requireDeal(workspaceId, dealId);
    if (deal.status !== "OPEN") throw new SalesError("conflict", `Deal is already ${deal.status}.`);
    if (status === "LOST" && !lostReason?.trim()) throw new SalesError("validation", "Lost deals need a reason.");
    await this.deps.repos.deals.close(dealId, status, lostReason?.trim());
    await this.rescoreCompany(workspaceId, deal.companyId, null);
    await this.deps.audit.log({
      workspaceId, actorId, action: `sales.deal.${status.toLowerCase()}`, target: dealId,
      metadata: { lostReason: lostReason ?? null },
    });
    return (await this.deps.repos.deals.get(workspaceId, dealId))!;
  }

  async deleteDeal(workspaceId: string, actorId: string | null, id: string): Promise<void> {
    const deal = await this.requireDeal(workspaceId, id);
    await this.deps.repos.deals.softDelete(workspaceId, id);
    await this.rescoreCompany(workspaceId, deal.companyId, null);
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.deal.delete", target: id });
  }

  // ── Activities ──────────────────────────────────────────────────────────

  async logActivity(workspaceId: string, actorId: string | null, input: ActivityInput): Promise<SalesActivityRow> {
    if (input.companyId) await this.requireCompany(workspaceId, input.companyId);
    if (input.contactId) await this.requireContact(workspaceId, input.contactId);
    if (input.dealId) await this.requireDeal(workspaceId, input.dealId);
    const row = await this.deps.repos.activities.create(workspaceId, {
      ...input,
      ...(input.dueAt ? { dueAt: new Date(input.dueAt) } : {}),
      createdById: actorId,
    });
    if (input.contactId) await this.deps.repos.contacts.touch(input.contactId, new Date());
    if (input.companyId) await this.rescoreCompany(workspaceId, input.companyId, null);
    return row;
  }

  async completeActivity(workspaceId: string, actorId: string | null, id: string): Promise<void> {
    const activity = await this.deps.repos.activities.get(workspaceId, id);
    if (!activity) throw new SalesError("not_found", "Activity not found.");
    if (activity.completedAt) return; // idempotent
    await this.deps.repos.activities.complete(id, new Date());
    await this.deps.audit.log({ workspaceId, actorId, action: "sales.activity.complete", target: id });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async requireCompany(workspaceId: string, id: string): Promise<SalesCompanyRow> {
    const row = await this.deps.repos.companies.get(workspaceId, id);
    if (!row) throw new SalesError("not_found", "Company not found.");
    return row;
  }

  private async requireContact(workspaceId: string, id: string): Promise<SalesContactRow> {
    const row = await this.deps.repos.contacts.get(workspaceId, id);
    if (!row) throw new SalesError("not_found", "Contact not found.");
    return row;
  }

  private async requireDeal(workspaceId: string, id: string): Promise<SalesDealRow> {
    const row = await this.deps.repos.deals.get(workspaceId, id);
    if (!row) throw new SalesError("not_found", "Deal not found.");
    return row;
  }

  /** Most-engaged contact status on the account (for account priority). */
  private async strongestContactStatus(workspaceId: string, companyId: string): Promise<string | null> {
    const companyContacts = await this.deps.repos.contacts.listByCompany(workspaceId, companyId, 100);
    const order = ["CUSTOMER", "ENGAGED", "QUALIFIED", "CONTACTED", "NEW", "LOST"];
    for (const status of order) {
      if (companyContacts.some((c) => c.status === status)) return status;
    }
    return null;
  }
}

/**
 * CompanyResearchService — bridges CRM companies to the Phase-5 research
 * worker. Request → QUEUED with a run link; completion is processed lazily
 * (detail views call refreshResearch, idempotent) so a worker finishing
 * between page loads still lands cleanly on the record.
 */
import { SalesError } from "../errors";
import type { SalesAuditSink, SalesCompanyRow, SalesRepositories, SalesResearchDispatcher } from "../ports";

export interface ResearchDeps {
  repos: SalesRepositories;
  dispatcher: SalesResearchDispatcher;
  audit: SalesAuditSink;
  /** Called whenever the profile lands so scoring stays fresh. */
  rescore: (workspaceId: string, companyId: string) => Promise<void>;
}

export class CompanyResearchService {
  constructor(private readonly deps: ResearchDeps) {}

  /** Queue research for a company (dedupes against an in-flight run). */
  async requestResearch(
    workspaceId: string,
    companyId: string,
    byUserId: string | null
  ): Promise<{ runId: string; reused: boolean }> {
    const company = await this.require(workspaceId, companyId);

    if (
      (company.researchStatus === "QUEUED" || company.researchStatus === "RUNNING") &&
      company.lastResearchRunId
    ) {
      // In-flight already — verify it really is; otherwise fall through.
      const existing = await this.deps.dispatcher.readResult(workspaceId, company.lastResearchRunId);
      if (existing.status === "QUEUED" || existing.status === "RUNNING" || existing.status === "NEEDS_APPROVAL") {
        return { runId: company.lastResearchRunId, reused: true };
      }
    }

    const { runId } = await this.deps.dispatcher.dispatch(workspaceId, company, { byUserId });
    await this.deps.repos.companies.setResearch(companyId, {
      researchStatus: "QUEUED",
      lastResearchRunId: runId,
      lastResearchedAt: new Date(),
    });
    await this.deps.audit.log({
      workspaceId, actorId: byUserId, action: "sales.research.request",
      target: companyId, metadata: { runId },
    });
    return { runId, reused: false };
  }

  /**
   * Reconcile the company with its linked run — call on every research view.
   * Idempotent; only terminal runs change the record.
   */
  async refreshResearch(
    workspaceId: string,
    companyId: string,
    actorId: string | null = null
  ): Promise<{ status: string }> {
    const company = await this.require(workspaceId, companyId);
    if (!company.lastResearchRunId) return { status: company.researchStatus };
    if (["COMPLETED", "FAILED"].includes(company.researchStatus)) {
      return { status: company.researchStatus };
    }

    const result = await this.deps.dispatcher.readResult(workspaceId, company.lastResearchRunId);
    switch (result.status) {
      case "QUEUED":
      case "NEEDS_APPROVAL":
        return { status: "QUEUED" };
      case "RUNNING": {
        if (company.researchStatus !== "RUNNING") {
          await this.deps.repos.companies.setResearch(companyId, { researchStatus: "RUNNING" });
        }
        return { status: "RUNNING" };
      }
      case "SUCCEEDED": {
        const profile = result.profile;
        await this.deps.repos.companies.setResearch(companyId, {
          researchStatus: "COMPLETED",
          lastResearchedAt: new Date(),
          ...(profile
            ? {
                summary: profile.summary,
                sources: profile.sources as unknown,
                ...(profile.industry ? { industry: profile.industry } : {}),
                ...(profile.size ? { size: profile.size } : {}),
                ...(profile.geography ? { geography: profile.geography } : {}),
                ...(profile.businessModel ? { businessModel: profile.businessModel } : {}),
                ...(profile.productsServices ? { productsServices: profile.productsServices } : {}),
                ...(profile.targetMarket ? { targetMarket: profile.targetMarket } : {}),
                ...(profile.techStack ? { techStack: profile.techStack } : {}),
                ...(profile.socialLinks ? { socialLinks: profile.socialLinks as unknown } : {}),
              }
            : {}),
        });
        await this.deps.repos.activities.create(workspaceId, {
          type: "NOTE",
          subject: `Research completed for ${company.name}`,
          body: profile?.summary?.slice(0, 500) ?? "Research run completed without a structured profile.",
          companyId,
          agentRunId: company.lastResearchRunId,
        });
        await this.deps.rescore(workspaceId, companyId);
        await this.deps.audit.log({
          workspaceId, actorId, action: "sales.research.completed",
          target: companyId, metadata: { runId: company.lastResearchRunId },
        });
        return { status: "COMPLETED" };
      }
      case "FAILED":
      case "CANCELED":
      default: {
        await this.deps.repos.companies.setResearch(companyId, { researchStatus: "FAILED" });
        await this.deps.audit.log({
          workspaceId, actorId, action: "sales.research.failed",
          target: companyId,
          metadata: { runId: company.lastResearchRunId, error: result.error?.slice(0, 240) ?? null },
        });
        return { status: "FAILED" };
      }
    }
  }

  private async require(workspaceId: string, companyId: string): Promise<SalesCompanyRow> {
    const row = await this.deps.repos.companies.get(workspaceId, companyId);
    if (!row) throw new SalesError("not_found", "Company not found.");
    return row;
  }
}

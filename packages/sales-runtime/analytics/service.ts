/**
 * SalesAnalyticsService — aggregates the per-repository rollups into the
 * dashboard overview. No SQL here; each repo owns its own aggregate query.
 */
import type { SalesRepositories } from "../ports";

export interface SalesOverview {
  companies: { total: number; researched: number; avgPriority: number };
  contacts: { total: number; byStatus: Record<string, number> };
  deals: { openCount: number; openValueUsd: number; wonCount30d: number; wonValueUsd30d: number };
  activities: { openTasks: number; dueThisWeek: number; completed30d: number };
  drafts: { total: number; byStatus: Record<string, number> };
  campaigns: { active: number; enrollmentsActive: number; draftsToday: number };
}

export class SalesAnalyticsService {
  constructor(private readonly repos: SalesRepositories) {}

  async overview(workspaceId: string): Promise<SalesOverview> {
    const [companies, contacts, deals, activities, drafts, campaigns] = await Promise.all([
      this.repos.companies.analytics(workspaceId),
      this.repos.contacts.analytics(workspaceId),
      this.repos.deals.analytics(workspaceId),
      this.repos.activities.analytics(workspaceId),
      this.repos.drafts.analytics(workspaceId),
      this.repos.campaigns.analytics(workspaceId),
    ]);
    return { companies, contacts, deals, activities, drafts, campaigns };
  }
}

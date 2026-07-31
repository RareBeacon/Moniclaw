/** Sales Runtime — Phase 6 AI Sales Employee. Public surface (barrel). */

export * from "./types";
export { SalesError, SALES_HTTP_STATUS, toSalesError, type SalesErrorKind } from "./errors";
export {
  computeFitScore, computeIcpFit, computePriority, daysSince, normalizeDomain,
  DEFAULT_ICP_WEIGHTS,
  type CompanySignals, type IcpInput, type IcpWeights, type PriorityInput,
} from "./scoring";
export {
  buildDraftContext, renderDraftTemplate, firstNameOf,
  type RenderedDraft, type PersonalizableCompany, type PersonalizableContact,
} from "./personalization";
export * from "./ports";
export { SalesCrmService, type CrmDeps } from "./crm/service";
export { CompanyResearchService, type ResearchDeps } from "./research/service";
export { CampaignEngine, nextWindowStart, type CampaignEngineDeps, type TickResult } from "./campaigns/engine";
export { SalesAnalyticsService, type SalesOverview } from "./analytics/service";
export {
  SalesCompanyPrismaRepository, SalesContactPrismaRepository,
  SalesPipelinePrismaRepository, SalesDealPrismaRepository,
  SalesActivityPrismaRepository, SalesCampaignPrismaRepository,
  SalesDraftPrismaRepository, SalesSavedSearchPrismaRepository,
  buildSalesRepositories,
} from "./repositories/prisma";

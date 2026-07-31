/**
 * MCUE — MoniClaw Computer Use Engine. Public surface.
 *
 * App glue (lib/browser) wires these services into the DI container;
 * everything here is framework-free and unit-testable.
 */

// Core contracts
export * from "./types";
export { CueError, cueError, toCueError, CUE_HTTP_STATUS, type CueErrorKind } from "./errors";
export * from "./ports";

// Selector engine
export {
  selectorSpecSchema, selectorQuerySchema, toSelectorQuery,
  type SelectorSpec, type SelectorQuery, type SelectorCandidate, type ResolvedSelector,
} from "./selectors/types";
export { scoreSelector, priorConfidence, strategyBase, uniquenessFactor } from "./selectors/score";
export { toLocator, resolveSelector, resolveStrict, describeCandidates, type SelectorResolution } from "./selectors/resolve";
export { scanInteractiveElements, rankCandidates, discoverSelectors, type ElementFingerprint } from "./selectors/discover";

// Browser engine
export type { BrowserDriver, ContextOptions, ProcessLease } from "./browser-engine/driver";
export { PlaywrightDriver } from "./browser-engine/playwright";
export { BrowserPool, type LeasedBrowser, type PoolOptions } from "./browser-engine/pool";
export { LivePageSet, type SessionPageHandle, type TabInfo } from "./browser-engine/handle";

// Actions
export {
  ACTIONS, actionById, hasAction, catalogMetadata, type ActionMetadata,
} from "./browser-engine/actions/catalog";
export type {
  ActionDefinition, ActionRunContext, ActionResult, PersistedArtifact, ResolvedUpload,
} from "./browser-engine/actions/context";

// Sessions
export { SessionManager, type CreateSessionInput, type AttachedSession } from "./sessions/manager";

// Permissions
export { PermissionService } from "./permissions/service";
export { evaluateDomain, hostMatches, matchAny, hostOf, normalizePattern, type DomainVerdict } from "./permissions/domains";

// Recovery
export {
  RecoveryService, DEFAULT_RECOVERY_POLICY, backoff, healHintFromSpec,
  type RecoveryDecision, type RecoveryHooks, type RecoveryPolicy, type RecoveryStrategy,
} from "./recovery/service";

// Execution
export { ActionPlanner, planToRows, executionStartSchema, planStepInputSchema, type PlannedExecution } from "./execution/planner";
export { ExecutionManager, type StartExecutionInput } from "./execution/manager";
export { InProcessExecutionQueue } from "./execution/queue";
export { InProcessExecutionEmitter } from "./execution/events";

// Recording / screenshots
export { ScreenshotService, RecordingService } from "./recording/service";

// Downloads + uploads
export { DownloadService, UploadService, sanitizeFilename, type UploadMaterializer } from "./downloads/service";
export { HeuristicScanner } from "./downloads/scanner";

// Profiles + cookies
export { ProfileService } from "./profiles/service";
export { CookiesService } from "./cookies/service";

// Vision
export { VisionService } from "./vision/service";
export { analyzePageLayout, type PageUnderstanding, type LayoutRegion } from "./vision/layout";
export { diffScreenshots, type DiffReport } from "./vision/diff";
export type { OcrProviderPort, OcrResult } from "./vision/ports";

// Audit
export { AuditService, CUE_AUDIT_ACTIONS, type CueAuditAction } from "./audit/service";

// Prisma adapters
export {
  buildPrismaRepositories, type PrismaRepositories, type SecretBox,
  PrismaSettingsRepository, PrismaPolicyRepository, PrismaSessionRepository,
  PrismaExecutionRepository, PrismaActionEventRepository, PrismaRecordingRepository,
  PrismaBinaryRepository, PrismaDownloadRepository, PrismaUploadRepository,
  PrismaScreenshotRepository, PrismaProfileRepository,
} from "./repositories/prisma";

// AI-runtime tool provider
export { browserToolProvider, type BrowserGateway, type ToolShape } from "./browser-tools/provider";

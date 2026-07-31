import { CueError } from "../errors";
import type { SelectorSpec } from "../selectors/types";

/**
 * Recovery — strategy decision engine for failed actions.
 *
 * Pure decision table + injected effect hooks: the ExecutionManager provides
 * the concrete healer/refresher (they need the live page), this module owns
 * WHEN and WHY a strategy applies. Strategies attempted, in rough order of
 * invasiveness:
 *
 *   retry (same args, backoff) → heal_selector (auto-discovery rewrite) →
 *   refresh_retry (reload page, then retry) → session_recovery (driver
 *   reconnect) → fail.
 *
 * Policy/validation/quota/unsupported errors are never recoverable here.
 */

export type RecoveryStrategy =
  | "retry"
  | "heal_selector"
  | "refresh_retry"
  | "dismiss_dialog_retry"
  | "session_recovery"
  | "fail";

export interface RecoveryDecision {
  strategy: RecoveryStrategy;
  /** Backoff before attempting (0 = immediate). */
  delayMs: number;
  reason: string;
  /** When strategy=heal_selector and healing found candidates. */
  healedSelector?: { primary: SelectorSpec; fallbacks: SelectorSpec[] };
  healedFrom?: SelectorSpec;
}

export interface RecoveryHooks {
  /** Auto Selector Discovery rewrite — returns ranked specs or null. */
  healSelector?(hint: string): Promise<Array<{ spec: SelectorSpec; confidence: number; reason: string }> | null>;
  /** Reload the active page. */
  refreshPage?(): Promise<void>;
  /** Reconnect driver / rebuild context for a crashed browser. */
  recoverSession?(): Promise<void>;
}

export interface RecoveryPolicy {
  /** Max total attempts per action (initial + retries). */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

export function backoff(attempt: number, policy: RecoveryPolicy): number {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

/** Extract a human description from a failed selector spec for healing. */
export function healHintFromSpec(spec: unknown): string {
  if (!spec || typeof spec !== "object") return "";
  const s = spec as Partial<SelectorSpec> & { primary?: Partial<SelectorSpec> };
  const target: Partial<SelectorSpec> = s.primary && typeof s.primary === "object" ? s.primary : s;
  switch (target.strategy) {
    case "text": return target.value ?? "";
    case "role": return target.name ?? target.role ?? "";
    case "aria": case "label": case "placeholder": case "testid": return target.value ?? "";
    case "css": {
      // Mine semantic bits from a css selector: #id, [name=x], tag
      const raw = target.value ?? "";
      const id = /#([\w-]+)/.exec(raw)?.[1];
      const name = /\[name=["']?([^"'\]]+)/.exec(raw)?.[1];
      const dataTestId = /\[data-testid=["']?([^"'\]]+)/.exec(raw)?.[1];
      return (dataTestId ?? id ?? name ?? raw.replace(/[.#[\]="'>+:()]/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120);
    }
    case "xpath": return (target.value ?? "").replace(/[^\w ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    default: return "";
  }
}

const UNRECOVERABLE = new Set([
  "policy_denied", "validation", "unsupported", "quota", "approval_required",
  "artifact_too_large", "session_not_found", "session_closed", "invalid_state", "execution_not_found",
]);

export class RecoveryService {
  constructor(private readonly policy: RecoveryPolicy = DEFAULT_RECOVERY_POLICY) {}

  /**
   * Decide the next move after action failure `error` at `attempt`
   * (1-based — attempt 1 just failed).
   */
  async decide(input: {
    error: CueError;
    attempt: number;
    actionId: string;
    args: Record<string, unknown>;
  }, hooks: RecoveryHooks = {}): Promise<RecoveryDecision> {
    const { error, attempt, args } = input;
    const policy = this.policy;
    const attemptsLeft = attempt < policy.maxAttempts;

    if (UNRECOVERABLE.has(error.kind)) {
      return { strategy: "fail", delayMs: 0, reason: `${error.kind} is not recoverable.` };
    }

    switch (error.kind) {
      case "selector_not_found": {
        if (!attemptsLeft) return { strategy: "fail", delayMs: 0, reason: "Selector unresolvable after max attempts." };
        // 1st failure: try one plain retry (DOM may still be settling).
        if (attempt === 1) {
          return { strategy: "retry", delayMs: backoff(attempt, policy), reason: "First selector failure — DOM may still be settling." };
        }
        // 2nd failure: heal via Auto Selector Discovery.
        if (hooks.healSelector) {
          const hint = healHintFromSpec(args.selector);
          const candidates = hint ? await hooks.healSelector(hint).catch(() => null) : null;
          if (candidates && candidates.length > 0) {
            const [primary, ...rest] = candidates;
            const healedSelector = {
              primary: primary.spec,
              fallbacks: rest.slice(0, 5).map((c) => c.spec),
            };
            return {
              strategy: "heal_selector",
              delayMs: 0,
              reason: `Self-healed via element discovery: ${primary.reason} (confidence ${primary.confidence}).`,
              healedSelector,
              healedFrom: healSourceSpec(args.selector),
            };
          }
        }
        // Healing found nothing — the element may appear only after a real
        // refresh (SPA hydration / changed DOM). Refresh once before failing.
        if (attemptsLeft && hooks.refreshPage) {
          await hooks.refreshPage().catch(() => {});
          return { strategy: "refresh_retry", delayMs: backoff(attempt, policy), reason: "Healing found no candidates — refreshed the page before the final attempt." };
        }
        return { strategy: "fail", delayMs: 0, reason: "Self-healing found no candidates." };
      }

      case "detached":
        return attemptsLeft
          ? { strategy: "retry", delayMs: backoff(attempt, policy), reason: "Element detached mid-action (DOM churn) — re-resolve and retry." }
          : { strategy: "fail", delayMs: 0, reason: "Element kept detaching across attempts." };

      case "timeout":
      case "navigation": {
        if (!attemptsLeft) return { strategy: "fail", delayMs: 0, reason: `${error.kind} persisted across ${policy.maxAttempts} attempts.` };
        if (attempt === 1) {
          return { strategy: "retry", delayMs: backoff(attempt, policy), reason: `${error.kind} — retrying with backoff (slow network tolerance).` };
        }
        if (attempt === 2 && hooks.refreshPage) {
          await hooks.refreshPage().catch(() => {});
          return { strategy: "refresh_retry", delayMs: backoff(attempt, policy), reason: "Refreshed the page before retrying (changed DOM / stalled load)." };
        }
        return { strategy: "retry", delayMs: backoff(attempt, policy), reason: `${error.kind} — final retry.` };
      }

      case "dialog":
        return attemptsLeft
          ? { strategy: "dismiss_dialog_retry", delayMs: backoff(attempt, policy), reason: "Unexpected dialog — handle auto-dismisses/accepts per policy, retrying." }
          : { strategy: "fail", delayMs: 0, reason: "Dialog kept blocking the action." };

      case "browser_crash": {
        if (attempt === 1 && hooks.recoverSession) {
          await hooks.recoverSession().catch(() => {});
          return { strategy: "session_recovery", delayMs: backoff(attempt, policy), reason: "Browser process crashed — session recovered, retrying once." };
        }
        return { strategy: "fail", delayMs: 0, reason: "Browser crash could not be recovered." };
      }

      default:
        return attemptsLeft
          ? { strategy: "retry", delayMs: backoff(attempt, policy), reason: `Transient ${error.kind} — retrying.` }
          : { strategy: "fail", delayMs: 0, reason: `Gave up after ${this.policy.maxAttempts} attempts.` };
    }
  }
}

function healSourceSpec(selector: unknown): SelectorSpec | undefined {
  if (!selector || typeof selector !== "object") return undefined;
  const s = selector as { primary?: SelectorSpec };
  return (s.primary ?? selector) as SelectorSpec;
}

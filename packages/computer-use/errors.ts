/**
 * MCUE error taxonomy. Every engine failure normalizes into one of these so
 * the execution layer can classify without knowing which driver ran, and the
 * API layer can map to HTTP statuses without string matching.
 */

export type CueErrorKind =
  | "browser_unavailable" // no local runtime, no worker endpoint → 503
  | "browser_crash"
  | "session_not_found"
  | "session_closed"
  | "execution_not_found"
  | "invalid_state" // e.g. cancel a finished execution → 409
  | "policy_denied" // workspace policy blocks the action/domain → 403
  | "approval_required" // parked for human confirmation → 202/AWAITING_APPROVAL
  | "selector_not_found"
  | "navigation" // navigation/network-level failure
  | "timeout"
  | "dialog" // unexpected dialog blocked the action
  | "detached" // element/frame detached mid-action (DOM churn)
  | "validation" // bad arguments → 400
  | "unsupported" // e.g. PDF on firefox, OCR without provider → 422
  | "artifact_too_large" // storage cap exceeded → 413
  | "quota" // concurrent-session cap → 429
  | "unknown";

export class CueError extends Error {
  constructor(
    readonly kind: CueErrorKind,
    message: string,
    readonly opts: { cause?: unknown; status?: number; detail?: Record<string, unknown> } = {}
  ) {
    super(message, { cause: opts.cause });
    this.name = "CueError";
  }
}

export function cueError(kind: CueErrorKind, message: string, cause?: unknown): CueError {
  return new CueError(kind, message, { cause });
}

/** Map an arbitrary thrown value (playwright errors, timeouts) to CueError. */
export function toCueError(err: unknown, context = "browser action failed"): CueError {
  if (err instanceof CueError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  const name = err instanceof Error ? err.name : "";

  if (name === "TimeoutError" || /timeout|timed out/.test(lower)) {
    return cueError("timeout", `${context}: ${message.slice(0, 300)}`, err);
  }
  if (/dialog/.test(lower)) return cueError("dialog", `${context}: ${message.slice(0, 300)}`, err);
  if (/detached|not attached to the dom/.test(lower)) {
    return cueError("detached", `${context}: ${message.slice(0, 300)}`, err);
  }
  if (/waiting for .*failed|selector|locator/.test(lower) && /resolved to 0 elements|not found|no element/.test(lower)) {
    return cueError("selector_not_found", `${context}: ${message.slice(0, 300)}`, err);
  }
  if (/err_|net::|ns_error|econn|enotfound|eai_again|socket hang/.test(lower)) {
    return cueError("navigation", `${context}: ${message.slice(0, 300)}`, err);
  }
  if (/has been closed|target closed|browser has been closed|crash/.test(lower)) {
    return cueError("browser_crash", `${context}: ${message.slice(0, 300)}`, err);
  }
  return cueError("unknown", `${context}: ${message.slice(0, 300)}`, err);
}

/** HTTP mapping used by the API envelope (lib/browser/api.ts). */
export const CUE_HTTP_STATUS: Record<CueErrorKind, number> = {
  browser_unavailable: 503,
  browser_crash: 502,
  session_not_found: 404,
  session_closed: 409,
  execution_not_found: 404,
  invalid_state: 409,
  policy_denied: 403,
  approval_required: 202,
  selector_not_found: 422,
  navigation: 502,
  timeout: 504,
  dialog: 409,
  detached: 409,
  validation: 400,
  unsupported: 422,
  artifact_too_large: 413,
  quota: 429,
  unknown: 500,
};

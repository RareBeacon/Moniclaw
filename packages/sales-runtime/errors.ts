/** Sales Runtime errors — mirrors the AgentError contract from Phase 5. */

export type SalesErrorKind =
  | "validation"
  | "not_found"
  | "permission_denied"
  | "conflict"
  | "rate_limited"
  | "upstream_failed"
  | "internal";

export const SALES_HTTP_STATUS: Record<SalesErrorKind, number> = {
  validation: 400,
  not_found: 404,
  permission_denied: 403,
  conflict: 409,
  rate_limited: 429,
  upstream_failed: 502,
  internal: 500,
};

export class SalesError extends Error {
  readonly kind: SalesErrorKind;
  readonly detail?: Record<string, unknown>;

  constructor(kind: SalesErrorKind, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "SalesError";
    this.kind = kind;
    this.detail = detail;
  }
}

/** Phase-3 model-layer error names — structural match keeps packages decoupled. */
const PROVIDER_ERROR_NAMES = new Set([
  "ProviderError", "NoProviderConfiguredError", "AllProvidersFailedError",
]);

export function toSalesError(err: unknown, fallback: SalesErrorKind = "internal"): SalesError {
  if (err instanceof SalesError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const { name } = (err ?? {}) as { name?: unknown };
  if (typeof name === "string" && PROVIDER_ERROR_NAMES.has(name)) {
    return new SalesError("upstream_failed", message);
  }
  return new SalesError(fallback, message);
}

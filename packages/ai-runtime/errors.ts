/**
 * Runtime error taxonomy.
 *
 * Every adapter normalizes provider-specific failures (HTTP codes, socket
 * errors, protocol quirks) into `ProviderError` so the router can make
 * retry/fail-over decisions without knowing which provider failed.
 */

export type ProviderErrorKind =
  | "auth" // bad/missing credentials — never retryable
  | "rate_limit" // 429 — retryable with backoff, great failover trigger
  | "timeout" // aborted by deadline — retryable
  | "network" // socket/DNS/transport — retryable
  | "overloaded" // 503-style — retryable
  | "model" // unknown/unsupported model — not retryable on this provider
  | "invalid" // malformed request (our bug) — never retryable
  | "no_provider" // nothing configured/healthy — terminal for the request
  | "unknown";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(
    kind: ProviderErrorKind,
    provider: string,
    message: string,
    opts: { status?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.kind = kind;
    this.provider = provider;
    this.status = opts.status;
    this.retryable =
      kind === "rate_limit" ||
      kind === "timeout" ||
      kind === "network" ||
      kind === "overloaded";
  }
}

/** Map an HTTP status code to an error kind. */
export function kindFromStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model";
  if (status === 429) return "rate_limit";
  if (status === 500 || status === 502 || status === 503 || status === 504)
    return "overloaded";
  if (status >= 400 && status < 500) return "invalid";
  return "unknown";
}

/** Classify an arbitrary thrown value (fetch failures, aborts, SDK errors). */
export function toProviderError(
  err: unknown,
  provider: string,
  context = "request failed"
): ProviderError {
  if (err instanceof ProviderError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new ProviderError("timeout", provider, `${context}: ${message}`, {
      cause: err,
    });
  }
  if (name === "TypeError" || name === "FetchError" || /ECONN|ENOTFOUND|EAI_AGAIN|socket|fetch/i.test(message)) {
    return new ProviderError("network", provider, `${context}: ${message}`, {
      cause: err,
    });
  }
  return new ProviderError("unknown", provider, `${context}: ${message}`, {
    cause: err,
  });
}

/** Thrown by the router after every candidate failed. */
export class AllProvidersFailedError extends Error {
  readonly attempts: Array<{ provider: string; kind: ProviderErrorKind; message: string }>;

  constructor(
    attempts: Array<{ provider: string; kind: ProviderErrorKind; message: string }>
  ) {
    super(
      `All AI providers failed (${attempts
        .map((a) => `${a.provider}:${a.kind}`)
        .join(", ")})`
    );
    this.name = "AllProvidersFailedError";
    this.attempts = attempts;
  }
}

/** No enabled/configured provider exists for this workspace. */
export class NoProviderConfiguredError extends Error {
  constructor(workspaceHint?: string) {
    super(
      `No AI provider is configured${workspaceHint ? ` for ${workspaceHint}` : ""}. ` +
        `Add one under Dashboard → AI Providers (free options: Gemini, OpenRouter, Ollama).`
    );
    this.name = "NoProviderConfiguredError";
  }
}

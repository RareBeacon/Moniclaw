import { ZodError } from "zod";
import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  ProviderError,
} from "@runtime/errors";
import { ExtractionError } from "@runtime/knowledge/extract";

/** Shared REST envelope + error mapping for /api/ai/* routes. */

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function fail(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>
): Response {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/** Consistent mapping of runtime errors → HTTP responses. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(
      400,
      "validation",
      `${first?.path.join(".") || "input"}: ${first?.message ?? "invalid"}`,
      { issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) }
    );
  }
  if (err instanceof NoProviderConfiguredError) {
    return fail(409, "no_provider", err.message);
  }
  if (err instanceof AllProvidersFailedError) {
    return fail(502, "providers_failed", err.message, {
      attempts: err.attempts.slice(0, 6),
    });
  }
  if (err instanceof ProviderError) {
    const status = err.kind === "auth" ? 502 : err.kind === "rate_limit" ? 429 : 502;
    return fail(status, `provider_${err.kind}`, err.message);
  }
  if (err instanceof ExtractionError) {
    return fail(422, "extraction", err.message);
  }
  if (err instanceof SyntaxError) {
    return fail(400, "bad_json", "Request body is not valid JSON.");
  }
  console.error("[api/ai] unhandled error:", err);
  return fail(500, "internal", "Something went wrong. The incident has been logged.");
}

/** Read a JSON body, capped at maxBytes. Throws SyntaxError on bad JSON. */
export async function readJson(request: Request, maxBytes = 256_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) {
    throw new Error(`Payload exceeds ${Math.round(maxBytes / 1024)}KB.`);
  }
  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > maxBytes) {
    throw new Error(`Payload exceeds ${Math.round(maxBytes / 1024)}KB.`);
  }
  return JSON.parse(text);
}

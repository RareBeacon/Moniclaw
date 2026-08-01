import { ZodError } from "zod";
import { CueError, CUE_HTTP_STATUS } from "@cue/index";
import type { Action } from "@/lib/permissions";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requirePrincipal, resolveApiPrincipal, type ApiPrincipal } from "@/lib/api-auth";

/** Shared REST envelope + auth/error plumbing for /api/browser/* routes. */

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function fail(status: number, error: string, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/** CueError → consistent HTTP mapping (CUE_HTTP_STATUS), everything else 500. */
export function errorResponse(err: unknown): Response {
  if (err instanceof CueError) {
    return fail(CUE_HTTP_STATUS[err.kind] ?? 500, err.kind, err.message, err.opts.detail);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(400, "validation", `${first?.path.join(".") || "input"}: ${first?.message ?? "invalid"}`, {
      issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof SyntaxError) {
    return fail(400, "bad_json", "Request body is not valid JSON.");
  }
  console.error("[api/browser] unhandled error:", err);
  return fail(500, "internal", "Something went wrong. The incident has been logged.");
}

/** Read a JSON body, capped. */
export async function readJson(request: Request, maxBytes = 256_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new PayloadTooLarge(maxBytes);
  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > maxBytes) throw new PayloadTooLarge(maxBytes);
  return JSON.parse(text);
}

class PayloadTooLarge extends Error {
  constructor(maxBytes: number) {
    super(`Payload exceeds ${Math.round(maxBytes / 1024)}KB.`);
    this.name = "PayloadTooLarge";
  }
}

export function payloadTooLargeResponse(err: unknown): Response | null {
  if (err instanceof Error && err.name === "PayloadTooLarge") return fail(413, "artifact_too_large", err.message);
  return null;
}

export interface Guarded {
  principal: ApiPrincipal;
  response?: never;
}

/**
 * Auth + capability + workspace rate limit in one call.
 * Returns { principal } or a ready Response (401/403/429).
 */
export async function guard(
  request: Request,
  action: Action,
  opts?: { rate?: keyof typeof RATE_LIMITS }
): Promise<{ principal: ApiPrincipal } | { response: Response }> {
  const principal = await resolveApiPrincipal(request);
  const denied = requirePrincipal(principal, action);
  if (denied) return { response: denied };

  if (opts?.rate) {
    const policy = RATE_LIMITS[opts.rate];
    const key = `${opts.rate}:${principal!.workspace.id}`;
    const verdict = await rateLimit(key, policy.limit, policy.windowMs);
    if (!verdict.success) {
      return {
        response: fail(429, "rate_limited", `Too many requests — retry in ${verdict.retryAfterSeconds}s.`),
      };
    }
  }
  return { principal: principal! };
}

export function isGuarded(x: { principal: ApiPrincipal } | { response: Response }): x is { response: Response } {
  return "response" in x;
}

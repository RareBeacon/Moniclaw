/** Shared REST envelope + auth/error plumbing for /api/agents/* routes. */
import { ZodError } from "zod";
import { AgentError, AGENT_HTTP_STATUS } from "@agents/index";
import type { Action } from "@/lib/permissions";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requirePrincipal, resolveApiPrincipal, type ApiPrincipal } from "@/lib/api-auth";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function fail(status: number, error: string, message: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/** AgentError → consistent HTTP mapping (AGENT_HTTP_STATUS), everything else 500. */
export function errorResponse(err: unknown): Response {
  if (err instanceof AgentError) {
    return fail(AGENT_HTTP_STATUS[err.kind] ?? 500, err.kind, err.message, err.detail);
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
  console.error("[api/agents] unhandled error:", err);
  return fail(500, "internal", "Something went wrong. The incident has been logged.");
}

/** Read a JSON body, capped. */
export async function readJson(request: Request, maxBytes = 256_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) return fail413();
  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > maxBytes) return fail413();
  return JSON.parse(text);

  function fail413(): never {
    throw new AgentError("validation", `Payload exceeds ${Math.round(maxBytes / 1024)}KB.`);
  }
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
): Promise<Guarded | { response: Response }> {
  const principal = await resolveApiPrincipal(request);
  const denied = requirePrincipal(principal, action);
  if (denied) return { response: denied };

  if (opts?.rate) {
    const policy = RATE_LIMITS[opts.rate];
    const key = `${opts.rate}:${principal!.workspace.id}`;
    const verdict = await rateLimit(key, policy.limit, policy.windowMs);
    if (!verdict.success) {
      return {
        response: fail(429, "rate_limited", "Too many requests — try again later.", {
          retryAfterSeconds: verdict.retryAfterSeconds,
        }),
      };
    }
  }
  return { principal: principal! };
}

export function isGuarded(value: Guarded | { response: Response }): value is { response: Response } {
  return "response" in value;
}

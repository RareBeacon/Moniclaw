import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { can, type Action } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import type { MembershipRole, Workspace } from "@prisma/client";

/**
 * Dual authentication for the REST API:
 *   1· Session cookie (dashboard fetch / same-origin)
 *   2· Bearer API key (SDK / integrations) — `Authorization: Bearer msk_...`
 *
 * API keys act as MEMBER-level workspace principals; scopes gate read vs
 * write. Keys are SHA-256 hashed at rest and shown exactly once at creation.
 */

export interface ApiPrincipal {
  workspace: Workspace;
  role: MembershipRole;
  userId: string | null;
  via: "session" | "api_key";
  scopes: string[];
  apiKeyId?: string;
}

const sha256 = (input: string) => createHash("sha256").update(input).digest("hex");

export function generateApiKey(): { rawKey: string; prefix: string; keyHash: string } {
  const rawKey = `msk_${randomBytes(24).toString("base64url")}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 12), // "msk_" + 8 chars
    keyHash: sha256(rawKey),
  };
}

export async function resolveApiPrincipal(request: Request): Promise<ApiPrincipal | null> {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer msk_")) {
    const rawKey = bearer.slice("Bearer ".length).trim();
    const key = await db.apiKey.findUnique({
      where: { keyHash: sha256(rawKey) },
      include: { workspace: true },
    });
    if (
      !key ||
      key.revokedAt ||
      key.workspace.deletedAt ||
      (key.expiresAt && key.expiresAt < new Date())
    ) {
      return null;
    }
    // Track last use without blocking the request.
    void db.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return {
      workspace: key.workspace,
      role: "MEMBER",
      userId: null,
      via: "api_key",
      scopes: key.scopes.length ? key.scopes : ["read"],
      apiKeyId: key.id,
    };
  }

  // Session path
  const user = await getCurrentUser();
  if (!user) return null;
  const primary = await getPrimaryWorkspace(user.id);
  if (!primary) return null;
  return {
    workspace: primary.workspace,
    role: primary.role,
    userId: user.id,
    via: "session",
    scopes: ["read", "write"],
  };
}

export function principalCan(principal: ApiPrincipal, action: Action): boolean {
  if (principal.via === "api_key") {
    // API keys never reach beyond MEMBER capabilities; sensitive surfaces
    // (members, settings, providers, keys) stay session-only.
    const keyAllowed: ReadonlySet<Action> = new Set([
      "ai.chat",
      "ai.memory.read",
      "ai.memory.write",
      "ai.workflows.run",
      "knowledge.read",
      "agents.read",
      "approvals.read",
      "usage.read",
      "analytics.read",
      "browser.read",
      "browser.execute",
    ]);
    if (!keyAllowed.has(action)) return false;
  }
  const writeActions: ReadonlySet<Action> = new Set([
    "ai.chat",
    "ai.memory.write",
    "ai.workflows.run",
    "knowledge.write",
    "browser.execute",
  ]);
  if (writeActions.has(action) && !principal.scopes.includes("write")) return false;
  if (!writeActions.has(action) && action !== "ai.chat" && !principal.scopes.includes("read")) return false;
  return can(principal.role, action);
}

/** Guard helper returning a ready 401/403 JSON response or null when ok. */
export function requirePrincipal(
  principal: ApiPrincipal | null,
  action: Action
): Response | null {
  if (!principal) {
    return Response.json(
      { error: "unauthenticated", message: "Sign in or pass a valid Bearer API key (msk_...)." },
      { status: 401 }
    );
  }
  if (!principalCan(principal, action)) {
    return Response.json(
      { error: "forbidden", message: `Missing capability for this operation: ${action}` },
      { status: 403 }
    );
  }
  return null;
}

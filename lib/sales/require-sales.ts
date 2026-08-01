/** Role-gates for write-focused sales pages, matching the platform idiom:
 *  render AccessDenied in place of the gated content (never throw). */
import { redirect } from "next/navigation";

import { can, type Action } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import type { MembershipRole, Workspace } from "@prisma/client";

export interface SalesGate {
  workspace: Workspace;
  role: MembershipRole;
  userId: string;
}

/** Returns the page context, or null when the role may not use this page. */
export async function requireSalesAction(action: Action): Promise<SalesGate | null> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const primary = await getPrimaryWorkspace(user.id);
  if (!primary) redirect("/onboarding");
  if (!can(primary.role, action)) return null;
  return { workspace: primary.workspace, role: primary.role, userId: user.id };
}

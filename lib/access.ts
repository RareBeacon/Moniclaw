import type { AccessStatus, User } from "@prisma/client";

export type AccessState = "active" | "pending" | "suspended" | "expired";

/** A past date wins even if an owner has not run a sweep yet. */
export function accessState(user: Pick<User, "accessStatus" | "accessUntil">): AccessState {
  if (user.accessUntil && user.accessUntil.getTime() <= Date.now()) return "expired";
  if (user.accessStatus === "ACTIVE") return "active";
  return user.accessStatus === "PENDING" ? "pending" : "suspended";
}

export function hasActiveAccess(user: Pick<User, "accessStatus" | "accessUntil">): boolean {
  return accessState(user) === "active";
}

export function accessMessage(state: AccessState): string {
  if (state === "pending") return "Your account is awaiting activation by the owner.";
  if (state === "expired") return "Your access has expired — contact the owner to renew.";
  return "Your access is suspended — contact the owner to renew.";
}

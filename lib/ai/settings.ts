import { cache } from "react";
import { db } from "@/lib/db";

/**
 * AI settings access — workspace settings row materialization. The Prisma
 * provider-config source lives in ./provider-config-source (react-free so
 * both the app and the prod E2E harnesses share ONE resolution path).
 */
export const getAiSettings = cache(async (workspaceId: string) => {
  const existing = await db.aiWorkspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (existing) return existing;
  // Lazy materialization — settings rows appear on first use.
  return db.aiWorkspaceSettings.create({ data: { workspaceId } });
});

export { providerConfigSource } from "./provider-config-source";

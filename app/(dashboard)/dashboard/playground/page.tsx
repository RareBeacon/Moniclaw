import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { ChatPanel } from "@/components/dashboard/ai/chat-panel";

export const metadata: Metadata = {
  title: "AI Playground",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "ai.chat")) return <AccessDenied required="Member" />;

  const { c: selectedId } = await searchParams;

  const [conversations, providerCount, settings] = await Promise.all([
    db.aiConversation.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true, messageCount: true },
    }),
    db.aiProviderConfig.count({ where: { workspaceId: workspace.id, enabled: true } }),
    db.aiWorkspaceSettings.findUnique({ where: { workspaceId: workspace.id } }),
  ]);

  const selected = selectedId
    ? await db.aiConversation.findFirst({
        where: { id: selectedId, workspaceId: workspace.id },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 100,
            select: {
              id: true, role: true, content: true, model: true, provider: true, createdAt: true,
            },
          },
        },
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight">AI Playground</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Streaming chat through the MoniClaw runtime — provider-agnostic, with
        automatic failover. Default model:{" "}
        <span className="font-medium text-foreground">{settings?.defaultModel ?? "gemini-2.5-flash"}</span>
      </p>

      <ChatPanel
        hasProviders={providerCount > 0}
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt.toISOString(),
          messageCount: c.messageCount,
        }))}
        selectedId={selected?.id ?? null}
        initialMessages={
          selected?.messages.map((m) => ({
            id: m.id,
            role: m.role.toLowerCase() as "user" | "assistant" | "system",
            content: m.content,
            model: m.model,
            provider: m.provider,
          })) ?? []
        }
      />
    </div>
  );
}

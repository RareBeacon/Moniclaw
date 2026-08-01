import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { TeamRosterForm } from "@/components/dashboard/agents/team-forms";

export const metadata: Metadata = {
  title: "New team",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewTeamPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;
  if (!can(role, "agents.create")) return <AccessDenied required="Member" />;

  const agents = await db.agent.findMany({
    where: { workspaceId: workspace.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, status: true, workerType: true, description: true },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/teams"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All teams
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Build a team</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a leader, add members with hints, set an optional budget. Runs go
        through the same evidence, kill-switch and approval rails as solo agents.
      </p>
      <div className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
        <TeamRosterForm agents={agents} />
      </div>
    </div>
  );
}

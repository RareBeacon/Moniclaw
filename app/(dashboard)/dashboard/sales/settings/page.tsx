import type { Metadata } from "next";
import Link from "next/link";

import { AccessDenied } from "@/components/dashboard/access-denied";
import { requireSalesAction } from "@/lib/sales/require-sales";
import { salesRepos } from "@/lib/sales/page-data";
import { SettingsForm } from "@/components/dashboard/sales/forms";
import { EmailConnectionsPanel } from "@/components/dashboard/sales/email-connections";
import { listConnections } from "@/lib/email/connections";

export const metadata: Metadata = { title: "Sales · Settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Safe projection for the panel — listConnections never selects credentials. */
async function listSafeConnections(workspaceId: string) {
  return listConnections(workspaceId);
}

export default async function SalesSettingsPage() {
  const gate = await requireSalesAction("sales.settings.manage");
  if (!gate) return <AccessDenied required="Admin" />;
  const stored = gate ? await salesRepos().settings.get(gate.workspace.id) : null;
  const icp = (stored?.icpProfile ?? {}) as Partial<{ industries: string[]; sizes: string[]; geographies: string[]; keywords: string[]; roles: string[] }>;
  const window0 = (stored?.defaultSendWindow ?? {}) as Partial<{ daysOfWeek: number[]; startHour: number; endHour: number; timezone: string }>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ICP drives company scoring; the default send window and sender identity drive campaign personalization.
          Company research runs through your workspace&apos;s AI keys — add one under{" "}
          <Link href="/dashboard/ai-providers" className="text-primary hover:underline">AI Providers</Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <SettingsForm
          settings={{
            icpProfile: {
              industries: icp.industries ?? [],
              sizes: icp.sizes ?? [],
              geographies: icp.geographies ?? [],
              keywords: icp.keywords ?? [],
              roles: icp.roles ?? [],
            },
            defaultSendWindow: {
              daysOfWeek: window0.daysOfWeek ?? [1, 2, 3, 4, 5],
              startHour: window0.startHour ?? 9,
              endHour: window0.endHour ?? 17,
              timezone: window0.timezone ?? "UTC",
            },
            senderName: stored?.senderName ?? null,
            senderTitle: stored?.senderTitle ?? null,
          }}
        />
      </div>

      <EmailConnectionsPanel
        canManage
        connections={gate ? await listSafeConnections(gate.workspace.id) : []}
      />

      <section className="rounded-2xl border border-border bg-card p-5 text-sm leading-6">
        <p className="font-semibold">Knowledge & playbooks</p>
        <p className="mt-1 text-muted-foreground">
          Upload sales playbooks, product docs, pricing one-pagers, case studies, FAQs and policies under{" "}
          <Link href="/dashboard/knowledge" className="text-primary hover:underline">Knowledge</Link> — campaigns
          retrieve them per draft when a playbook query is set on the campaign.
        </p>
      </section>
    </div>
  );
}

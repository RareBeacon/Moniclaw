import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import { AccessDenied } from "@/components/dashboard/access-denied";

export const metadata: Metadata = {
  title: "Audit logs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTION_GROUPS: { value: string; label: string; prefix: string }[] = [
  { value: "", label: "All actions", prefix: "" },
  { value: "agent", label: "Agents", prefix: "agent." },
  { value: "approval", label: "Approvals", prefix: "approval." },
  { value: "member", label: "Members", prefix: "member." },
  { value: "workspace", label: "Workspace", prefix: "workspace." },
  { value: "settings", label: "Settings", prefix: "settings." },
  { value: "knowledge", label: "Knowledge", prefix: "knowledge." },
  { value: "file", label: "Files", prefix: "file." },
  { value: "user", label: "User security", prefix: "user." },
];

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace, role } = primary;

  if (!can(role, "audit.read")) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <div className="mt-8">
          <AccessDenied required="Manager" />
        </div>
      </div>
    );
  }

  const group = ACTION_GROUPS.find((g) => g.value === action) ?? ACTION_GROUPS[0];

  const logs = await db.auditLog.findMany({
    where: {
      workspaceId: workspace.id,
      ...(group.prefix ? { action: { startsWith: group.prefix } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every privileged action in {workspace.name}, with actor and source
            IP. Append-only; exports via SIEM stream on Business plans.
          </p>
        </div>
        <nav aria-label="Filter by category" className="flex flex-wrap gap-1.5">
          {ACTION_GROUPS.map((g) => (
            <a
              key={g.value}
              href={g.value ? `/dashboard/audit-logs?action=${g.value}` : "/dashboard/audit-logs"}
              className={
                g.value === group.value
                  ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  : "rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {g.label}
            </a>
          ))}
        </nav>
      </div>

      {logs.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed bg-card/50 px-5 py-14 text-center text-sm text-muted-foreground">
          No entries in this category yet. The first privileged action will
          appear here instantly.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-3.5 font-medium">When</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Actor</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Action</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Target</th>
                <th scope="col" className="px-4 py-3.5 font-medium">Source IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-xs">
                    {log.actor?.name ?? log.actor?.email ?? "system"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-secondary px-2 py-1 font-mono text-[0.7rem]">
                      {log.action}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 font-mono text-[0.7rem] text-muted-foreground">
                    {log.targetType ?? "—"}
                    {log.targetId ? ` · ${log.targetId.slice(0, 8)}…` : ""}
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.7rem] text-muted-foreground">
                    {log.ip ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

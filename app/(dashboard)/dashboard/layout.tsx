import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Logo } from "@/components/shared/logo";
import { SideNav } from "@/components/dashboard/side-nav";
import { UserMenu } from "@/components/dashboard/user-menu";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/dashboard");

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });
  if (!membership) redirect("/signup");

  const pendingApprovals = await db.approval.count({
    where: { status: "PENDING", run: { workspaceId: membership.workspaceId } },
  });

  const name = session.user.name ?? "Operator";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/40 p-4 lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-4 flex-1">
          <SideNav pendingApprovals={pendingApprovals} />
        </div>
        <div className="rounded-xl border bg-accent/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Plan
          </p>
          <p className="mt-1 text-sm font-semibold capitalize">
            {membership.workspace.plan.toLowerCase()}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {membership.workspace.plan === "STARTER"
              ? "Upgrade when your first agent proves its hours."
              : "Usage and invoices in Settings → Billing."}
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <div className="lg:hidden">
              <Logo withWordmark={false} />
            </div>
            <p className="text-sm font-semibold">
              {membership.workspace.name}
              <span className="ml-2 hidden rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground sm:inline">
                {membership.role.toLowerCase()}
              </span>
            </p>
          </div>
          <UserMenu
            name={name}
            email={session.user.email ?? ""}
            initials={initials}
          />
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          {/* Mobile nav */}
          <div className="mb-8 lg:hidden">
            <SideNav pendingApprovals={pendingApprovals} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/workspace";
import { Logo } from "@/components/shared/logo";
import { SideNav } from "@/components/dashboard/side-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { CreateWorkspace } from "@/components/dashboard/create-workspace";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/dashboard");

  // Enforces soft-deletes + sessionVersion (sign-out-everywhere).
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const membership = await db.membership.findFirst({
    where: { userId: user.id, workspace: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });

  const name = user.name ?? "Operator";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // No live workspace → lightweight onboarding instead of a redirect loop.
  if (!membership) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <Logo />
          <UserMenu name={name} email={user.email ?? ""} image={user.image} initials={initials} />
        </header>
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your workspace
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            A workspace is where your agents, runs, approvals, and team live.
            You can rename everything later.
          </p>
          <CreateWorkspace />
        </main>
      </div>
    );
  }

  const pendingApprovals = await db.approval.count({
    where: { status: "PENDING", run: { workspaceId: membership.workspaceId } },
  });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-card/40 p-4 lg:flex">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <SideNav pendingApprovals={pendingApprovals} role={membership.role} />
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
              : "Usage and invoices live in Usage → Billing."}
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
              <span className="ml-2 hidden rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-medium capitalize text-muted-foreground sm:inline">
                {membership.role.toLowerCase()}
              </span>
            </p>
          </div>
          <UserMenu
            name={name}
            email={user.email ?? ""}
            image={user.image}
            initials={initials}
          />
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          {/* Mobile nav */}
          <div className="mb-8 lg:hidden">
            <SideNav pendingApprovals={pendingApprovals} role={membership.role} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

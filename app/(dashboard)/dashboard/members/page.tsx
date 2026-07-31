import type { Metadata } from "next";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  InviteMemberForm,
  MemberRowActions,
  RevokeInvitationButton,
} from "@/components/dashboard/member-controls";

export const metadata: Metadata = {
  title: "Members",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!user || !primary) return null;
  const { workspace, role } = primary;

  const [members, invitations] = await Promise.all([
    db.membership.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { name: true, email: true, image: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    db.workspaceInvitation.findMany({
      where: { workspaceId: workspace.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { inviter: { select: { name: true, email: true } } },
    }),
  ]);

  const canInvite = can(role, "members.invite");
  const roleOrder = { OWNER: 0, ADMIN: 1, MANAGER: 2, MEMBER: 3, VIEWER: 4 } as const;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Who can do what in {workspace.name}. Role changes take effect
        immediately and are recorded in the audit log.
      </p>

      {canInvite && (
        <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Invite a teammate">
          <h2 className="text-sm font-semibold">Invite a teammate</h2>
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            They&apos;ll get an email with a 7-day acceptance link. New users
            create an account in the same flow.
          </p>
          <InviteMemberForm />
        </section>
      )}

      <section className="mt-8" aria-label="Current members">
        <h2 className="text-sm font-semibold">
          People · {members.length}
        </h2>
        <ul className="mt-4 divide-y rounded-2xl border bg-card">
          {[...members]
            .sort((a, b) => roleOrder[a.role] - roleOrder[b.role])
            .map((member) => {
              const displayName = member.user.name ?? member.user.email ?? "Member";
              const isSelf = member.userId === user.id;
              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {member.user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar from our asset route
                      <img
                        src={member.user.image}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-xs font-semibold text-white"
                      >
                        {displayName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {displayName}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      {member.role.toLowerCase()}
                    </span>
                    <MemberRowActions
                      memberId={member.id}
                      memberRole={member.role}
                      isSelf={isSelf}
                      actorRole={role}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </section>

      {invitations.length > 0 && (
        <section className="mt-8" aria-label="Pending invitations">
          <h2 className="text-sm font-semibold">
            Pending invitations · {invitations.length}
          </h2>
          <ul className="mt-4 divide-y rounded-2xl border bg-card">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-sm"
              >
                <span className="font-medium">{invitation.email}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {invitation.role.toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground">
                  invited by {invitation.inviter?.name ?? invitation.inviter?.email ?? "—"} ·{" "}
                  expires {formatRelative(invitation.expiresAt)}
                </span>
                {canInvite && (
                  <span className="ml-auto">
                    <RevokeInvitationButton invitationId={invitation.id} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Role reference">
        <h2 className="text-sm font-semibold">What each role can do</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          {(["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const).map((r) => (
            <div key={r}>
              <dt className="font-medium capitalize">{r.toLowerCase()}</dt>
              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {ROLE_DESCRIPTIONS[r]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">
          Invitations sent before {formatDateTime(new Date(Date.now() - 7 * 86_400_000))} have expired
          automatically.
        </p>
      </section>
    </div>
  );
}

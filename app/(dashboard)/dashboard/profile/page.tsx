import type { Metadata } from "next";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/workspace";
import { formatDateTime } from "@/lib/format";
import {
  AvatarForm,
  ConnectedAccountsPanel,
  DeleteAccountForm,
  EmailForm,
  PasswordForm,
  ProfileNameForm,
  SignOutEverywhereButton,
} from "@/components/dashboard/profile-forms";

export const metadata: Metadata = {
  title: "Your profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [accounts, loginEvents, session] = await Promise.all([
    db.account.findMany({
      where: { userId: user.id },
      select: { provider: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.loginEvent.findMany({
      where: {
        OR: [{ userId: user.id }, { email: user.email ?? "" }],
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    auth(),
  ]);

  const name = user.name ?? "Operator";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hasPassword = !!user.passwordHash;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity, security, and sign-in history — for you, not the workspace.
        </p>
      </div>

      {/* Identity */}
      <section className="rounded-2xl border bg-card p-6 sm:p-7" aria-label="Identity">
        <h2 className="mb-5 text-sm font-semibold">Identity</h2>
        <AvatarForm image={user.image} initials={initials} />
        <div className="mt-6 border-t pt-6">
          <ProfileNameForm name={user.name ?? ""} />
        </div>
        <div className="mt-6 border-t pt-6">
          <h3 className="mb-4 text-sm font-medium">Email address</h3>
          <EmailForm email={user.email ?? ""} hasPassword={hasPassword} />
          {!user.emailVerified && user.email && (
            <p className="mt-3 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              This address isn&apos;t verified yet — check your inbox for the
              confirmation link.
            </p>
          )}
        </div>
      </section>

      {/* Security */}
      <section className="rounded-2xl border bg-card p-6 sm:p-7" aria-label="Security">
        <h2 className="mb-5 text-sm font-semibold">Security</h2>
        <div className="space-y-8">
          <div>
            <h3 className="mb-4 text-sm font-medium">Password</h3>
            <PasswordForm hasPassword={hasPassword} />
          </div>
          <div className="border-t pt-6">
            <h3 className="mb-4 text-sm font-medium">Connected accounts</h3>
            <ConnectedAccountsPanel
              accounts={accounts.map((a) => ({
                provider: a.provider,
                createdAt: a.createdAt.toISOString(),
              }))}
            />
          </div>
          <div className="border-t pt-6">
            <h3 className="mb-2 text-sm font-medium">Sessions</h3>
            <p className="mb-4 text-sm leading-6 text-muted-foreground">
              This session expires{" "}
              <strong className="text-foreground">
                {session?.expires ? formatDateTime(session.expires) : "—"}
              </strong>{" "}
              (Remember Me extends to 30 days). Revoking sessions rotates your
              token version — every device, including this one, signs out.
            </p>
            <SignOutEverywhereButton />
          </div>
        </div>
      </section>

      {/* Login history */}
      <section className="rounded-2xl border bg-card p-6 sm:p-7" aria-label="Login history">
        <h2 className="mb-1 text-sm font-semibold">Sign-in history</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Don&apos;t recognize an entry? Change your password and revoke all
          sessions immediately.
        </p>
        {loginEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
            No sign-ins recorded yet — entries appear here from your next sign-in.
          </p>
        ) : (
          <ul className="divide-y">
            {loginEvents.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
              >
                <span
                  className={
                    event.success
                      ? "h-2 w-2 rounded-full bg-emerald-500"
                      : "h-2 w-2 rounded-full bg-red-500"
                  }
                  aria-hidden
                />
                <span className="font-medium capitalize">{event.provider}</span>
                <span className="text-xs text-muted-foreground">
                  {event.success ? "signed in" : "failed attempt"}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section
        className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 sm:p-7"
        aria-label="Delete account"
      >
        <h2 className="mb-2 text-sm font-semibold text-destructive">Delete account</h2>
        <p className="mb-5 text-sm leading-6 text-muted-foreground">
          Permanent and irreversible from the UI. Review the consequences in
          the confirmation step.
        </p>
        <DeleteAccountForm hasPassword={hasPassword} />
      </section>
    </div>
  );
}

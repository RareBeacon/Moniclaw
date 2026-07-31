import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning, XCircle } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/workspace";
import { acceptInvitation } from "@/lib/actions/members";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Workspace invitation",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function Panel({
  tone,
  children,
}: {
  tone: "error" | "ok";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? XCircle : CheckCircle2;
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span
        className={
          tone === "error"
            ? "flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
            : "flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10"
        }
      >
        <Icon
          className={tone === "error" ? "h-7 w-7 text-destructive" : "h-7 w-7 text-emerald-500"}
          aria-hidden
        />
      </span>
      {children}
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  const invitation = await db.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: true, inviter: { select: { name: true, email: true } } },
  });

  const invalid =
    !invitation ||
    invitation.status !== "PENDING" ||
    invitation.workspace.deletedAt !== null;
  const expired = invitation && invitation.expiresAt < new Date();

  // Auto-mark expired invitations for ledger hygiene.
  if (invitation && expired && invitation.status === "PENDING") {
    await db.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
  }

  const inviterName = invitation?.inviter?.name ?? invitation?.inviter?.email ?? "A teammate";
  const roleLabel = invitation
    ? invitation.role.charAt(0) + invitation.role.slice(1).toLowerCase()
    : "";

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-3xl border bg-card p-10 shadow-soft">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        {invalid || expired ? (
          <Panel tone="error">
            <div>
              <h1 className="text-xl font-semibold">
                {expired ? "This invitation expired" : "This invitation isn't valid"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {expired
                  ? "Invitations live for 7 days. Ask the workspace admin to send a fresh one."
                  : "It may have been revoked or already used. Ask the workspace admin for a fresh link."}
              </p>
            </div>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Back to moniclaw.com
            </Link>
          </Panel>
        ) : !user ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
              <MailWarning className="h-7 w-7 text-accent-foreground" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">
                Join {invitation.workspace.name}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {inviterName} invited you as {roleLabel}. Sign in to accept —
                or create your account with{" "}
                <strong className="text-foreground">{invitation.email}</strong>;
                the invitation will be waiting.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2.5">
              <Link
                href={`/login?next=/invite/${token}`}
                className={buttonVariants({ size: "lg" })}
              >
                Sign in to accept
              </Link>
              <Link
                href={`/signup?next=/invite/${token}`}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Create an account
              </Link>
            </div>
          </div>
        ) : user.email !== invitation.email ? (
          <Panel tone="error">
            <div>
              <h1 className="text-xl font-semibold">Wrong account</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This invitation was sent to{" "}
                <strong className="text-foreground">{invitation.email}</strong>,
                but you&apos;re signed in as{" "}
                <strong className="text-foreground">{user.email}</strong>. Sign
                out and use the invited address.
              </p>
            </div>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Go to my dashboard
            </Link>
          </Panel>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">
                Join {invitation.workspace.name}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {inviterName} invited you as {roleLabel}. Accepting adds the
                workspace to your account instantly.
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await acceptInvitation(token);
              }}
              className="w-full"
            >
              <Button type="submit" size="lg" className="w-full">
                Accept and join workspace
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ForgotPasswordConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email, token } = await searchParams;

  if (!email || !token) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-16">
        <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border bg-card p-10 text-center shadow-soft">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-7 w-7 text-destructive" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Incomplete reset link</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              This link is missing its verification parameters. Request a fresh
              reset email and use the full link from it.
            </p>
          </div>
          <Link href="/forgot-password" className={buttonVariants()}>
            Send a new reset email
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle={`Setting a new password for ${email}.`}
    >
      <ResetPasswordForm email={email} token={token} />
    </AuthShell>
  );
}

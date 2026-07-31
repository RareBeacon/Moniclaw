import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { verifyEmail } from "@/lib/actions/auth";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Verifying your email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VerifyEmailConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email, token } = await searchParams;

  const result =
    email && token
      ? await verifyEmail(email, token)
      : { error: "This verification link is incomplete." };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border bg-card p-10 text-center shadow-soft">
        <Logo />
        {result.ok ? (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">Email verified</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">{email}</strong> is
                confirmed. Your workspace is active — time to hire your first
                agent.
              </p>
            </div>
            <Link href="/login" className={buttonVariants({ size: "lg" })}>
              Sign in to your workspace
            </Link>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-7 w-7 text-destructive" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-semibold">Link didn&apos;t check out</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {result.error}
              </p>
            </div>
            <Link
              href={`/verify-email?email=${encodeURIComponent(email ?? "")}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Request a fresh link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

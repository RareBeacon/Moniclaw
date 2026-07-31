"use client";

import * as React from "react";
import Link from "next/link";
import { Inbox, Loader2, MailOpen } from "lucide-react";

import { resendVerification } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

const COOLDOWN_SECONDS = 45;

export function VerifyEmailContent({ email }: { email: string }) {
  const [cooldown, setCooldown] = React.useState(0);
  const [resending, setResending] = React.useState(false);
  const [resendCount, setResendCount] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    await resendVerification(email);
    setResending(false);
    setResendCount((c) => c + 1);
    setCooldown(COOLDOWN_SECONDS);
  };

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
        <MailOpen className="h-8 w-8 text-accent-foreground" aria-hidden />
      </span>

      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          We sent a 6-digit code and a confirmation link to{" "}
          <strong className="text-foreground">{email}</strong>. The link expires
          in 30 minutes.
        </p>
        <p className="text-xs">
          Can&apos;t find it? Check spam and promotions, or search for
          “MoniClaw”.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-background text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
        >
          <Inbox className="h-4 w-4" aria-hidden />
          Open Gmail
        </a>
        <Button
          variant="outline"
          size="lg"
          onClick={resend}
          disabled={cooldown > 0 || resending}
        >
          {resending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Resending…
            </>
          ) : cooldown > 0 ? (
            `Resend available in ${cooldown}s`
          ) : (
            "Resend verification email"
          )}
        </Button>
        {resendCount > 0 && (
          <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
            Sent again — give it a minute or two.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Wrong address?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Start over with a different email
        </Link>
      </p>
    </div>
  );
}

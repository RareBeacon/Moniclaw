import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailContent } from "@/components/auth/verify-email-content";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Confirm your email address to activate your MoniClaw workspace.",
  robots: { index: false, follow: false },
};

// This page hosts a server-action form — keep it server-rendered so
// progressive-enhancement (no-JS) POSTs reach the runtime instead of the CDN.
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthShell
      title="Check your inbox"
      subtitle="One last step — confirm you own this address so we can keep your workspace secure."
    >
      <VerifyEmailContent email={email ?? "your email address"} />
    </AuthShell>
  );
}

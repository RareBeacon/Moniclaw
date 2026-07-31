import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Request a secure password reset link for your MoniClaw account.",
};

// This page hosts a server-action form — keep it server-rendered so
// progressive-enhancement (no-JS) POSTs reach the runtime instead of the CDN.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send a secure reset link. Your agents keep working either way."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

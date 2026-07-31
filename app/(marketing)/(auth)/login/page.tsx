import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to your MoniClaw workspace.",
};

// This page hosts a server-action form — keep it server-rendered so
// progressive-enhancement (no-JS) POSTs reach the runtime instead of the CDN.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to check on your agents — they've been busy."
    >
      <LoginForm />
    </AuthShell>
  );
}

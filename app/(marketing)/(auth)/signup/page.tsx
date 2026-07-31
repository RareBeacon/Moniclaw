import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Create a free MoniClaw workspace and deploy your first AI employee this afternoon. No credit card required.",
};

// This page hosts a server-action form — keep it server-rendered so
// progressive-enhancement (no-JS) POSTs reach the runtime instead of the CDN.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Free plan, no credit card. Your first agent can be running before your next meeting."
    >
      <SignupForm />
    </AuthShell>
  );
}

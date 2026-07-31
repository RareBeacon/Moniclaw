import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { NewAgentForm } from "@/components/dashboard/new-agent-form";

export const metadata: Metadata = {
  title: "New agent",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function NewAgentPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/agents"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All agents
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Hire a new agent
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe the job like you&apos;d brief a person. The platform handles
        the browser, the credentials, and the guardrails.
      </p>
      <div className="mt-8 rounded-2xl border bg-card p-6 sm:p-8">
        <NewAgentForm />
      </div>
    </div>
  );
}

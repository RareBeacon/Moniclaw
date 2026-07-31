import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Webhook } from "lucide-react";

import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";

export const metadata: Metadata = {
  title: "API keys",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace, role } = primary;

  if (!can(role, "apikeys.manage")) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
        <div className="mt-8">
          <AccessDenied required="Admin" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Programmatic access for your own systems — scoped, expirable,
        audit-logged.
      </p>

      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          Coming with the public API milestone
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Key issuance for {workspace.name} unlocks when the public API opens
          to workspace accounts. The security model is already settled and
          worth reviewing now:
        </p>
        <ul className="mt-4 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {[
            "Scoped keys — least privilege per integration (runs:read, agents:write, webhooks:manage…), never workspace-wide by default.",
            "Prefix-identifiable secrets (mk_live_…) for leak scanning, with one-click revoke and optional TTLs.",
            "Only hashes are stored. A key is shown exactly once — at creation.",
            "Every API call lands in the audit log with the key ID, not the secret.",
          ].map((item) => (
            <li key={item.slice(0, 24)} className="flex gap-2.5">
              <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <Webhook className="h-4 w-4 text-primary" aria-hidden />
          In the meantime: events out
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Signed webhooks (approval.requested, run.completed) are part of the
          same milestone. Endpoint shapes are documented and stable:
        </p>
        <Link
          href="/docs#api"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Read the API documentation →
        </Link>
      </section>
    </div>
  );
}

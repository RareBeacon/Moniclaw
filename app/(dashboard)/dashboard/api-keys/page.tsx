import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Webhook } from "lucide-react";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { AccessDenied } from "@/components/dashboard/access-denied";
import { CreateApiKeyForm, RevokeKeyButton } from "@/components/dashboard/ai/api-key-forms";
import { formatRelative } from "@/lib/format";

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

  const keys = await db.apiKey.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Programmatic access for your own systems — scoped, expirable,
        audit-logged. Keys authenticate to <code className="font-mono text-xs">/api/ai/*</code>{" "}
        and pair with the <code className="font-mono text-xs">@moniclaw/sdk</code> client.
      </p>

      <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Create key">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
          Create a key for {workspace.name}
        </h2>
        <div className="mt-4">
          <CreateApiKeyForm />
        </div>
      </section>

      <section className="mt-8" aria-label="Issued keys">
        <h2 className="text-sm font-semibold">Issued keys</h2>
        {keys.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed bg-card/50 px-5 py-10 text-center text-sm text-muted-foreground">
            No keys yet. Create one above — only its hash is stored, shown to
            you exactly once.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {keys.map((key) => {
              const revoked = key.revokedAt !== null;
              const expired = key.expiresAt !== null && key.expiresAt < new Date();
              return (
                <li
                  key={key.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 text-sm ${revoked || expired ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {key.name}{" "}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {key.prefix}…
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      scopes: {key.scopes.join(", ")} · created {formatRelative(key.createdAt)}
                      {key.createdBy ? ` by ${key.createdBy.name ?? key.createdBy.email}` : ""}
                      {key.lastUsedAt ? ` · last used ${formatRelative(key.lastUsedAt)}` : " · never used"}
                      {key.expiresAt ? ` · expires ${formatRelative(key.expiresAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {revoked ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                        revoked
                      </span>
                    ) : expired ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                        expired
                      </span>
                    ) : (
                      <>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                          active
                        </span>
                        <RevokeKeyButton id={key.id} />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold">Security model</h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-6 text-muted-foreground">
          {[
            "Scoped keys — read and/or write; API keys are never more powerful than a workspace Member.",
            "Prefix-identifiable secrets (msk_…) for leak scanning, with one-click revoke and optional TTLs.",
            "Only SHA-256 hashes are stored. A key is shown exactly once — at creation.",
            "Every API call lands in the audit log with the key prefix, not the secret.",
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
          Next up: events out
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Signed webhooks (approval.requested, run.completed) arrive with the
          Phase 4 agent milestone. Endpoint shapes are documented and stable:
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

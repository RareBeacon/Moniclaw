import type { Metadata } from "next";
import Link from "next/link";
import {
  FileBarChart, Inbox, Map as MapIcon, MonitorSmartphone, NotebookPen, Radar, ReceiptText, Target,
  type LucideIcon,
} from "lucide-react";

import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getCurrentUser, getPrimaryWorkspace } from "@/lib/workspace";
import { defaultAllowlist, resolveToolPolicy } from "@agents/policy";
import type { TemplateManifest } from "@/lib/templates/catalog";
import { InstallButton } from "@/components/dashboard/templates/install-button";

export const metadata: Metadata = {
  title: "Template catalog",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ICONS: Record<string, LucideIcon> = {
  Target, Radar, FileBarChart, Map: MapIcon, MonitorSmartphone, Inbox, NotebookPen, ReceiptText,
};

/** Tools the worker can actually call: explicit allowlist, else the
 *  worker-type default, minus denies — exactly what the orchestrator sees. */
function effectiveTools(workerType: string, toolPolicy: unknown): string[] {
  const policy = resolveToolPolicy(toolPolicy);
  const base = policy.allow.length ? policy.allow : defaultAllowlist(workerType);
  return base.filter((t) => !policy.deny.includes(t));
}

const CHIP_PREVIEW = 6;

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  const primary = user ? await getPrimaryWorkspace(user.id) : null;
  if (!primary) return null;
  const { workspace, role } = primary;
  const canInstall = can(role, "agents.create");

  const [templates, installed] = await Promise.all([
    db.agentTemplate.findMany({ orderBy: [{ category: "asc" }, { installs: "desc" }] }),
    db.agent.findMany({
      where: { workspaceId: workspace.id, templateSlug: { not: null }, status: { not: "ARCHIVED" } },
      select: { id: true, templateSlug: true },
    }),
  ]);
  const bySlug = new Map<string, string[]>();
  for (const row of installed) {
    const list = bySlug.get(row.templateSlug!) ?? [];
    list.push(row.id);
    bySlug.set(row.templateSlug!, list);
  }

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Template catalog</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Curated declarative worker packages. Installing mints a real worker in
          your workspace in <strong className="text-foreground">SHADOW</strong> mode
          (dry-run — it acts only when you promote it), with the permission
          manifest shown on every card up front.
        </p>
      </div>

      {templates.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
          The catalog is empty. Seed it with <code className="font-mono text-xs">npx tsx scripts/seed-templates.mts</code>.
        </p>
      ) : (
        categories.map((category) => (
          <section key={category} className="mt-10" aria-label={category}>
            <h2 className="text-sm font-semibold">{category}</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {templates
                .filter((t) => t.category === category)
                .map((t) => {
                  const Icon = (t.icon && ICONS[t.icon]) || Target;
                  const manifest = t.manifest as unknown as TemplateManifest;
                  const tools = effectiveTools(t.workerType, manifest.toolPolicy);
                  const myInstalls = bySlug.get(t.slug) ?? [];
                  return (
                    <article
                      key={t.id}
                      className="flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" aria-hidden />
                          </span>
                          <div>
                            <h3 className="text-sm font-semibold">
                              {t.name}
                              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                v{t.version}
                              </span>
                            </h3>
                            <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                              {t.publisher} · {t.installs} install{t.installs === 1 ? "" : "s"}
                              {manifest.trigger === "SCHEDULE" && manifest.schedule
                                ? ` · runs ${manifest.schedule} (cron)`
                                : " · manual runs"}
                            </p>
                          </div>
                        </div>
                        <InstallButton
                          slug={t.slug}
                          name={t.name}
                          toolNames={tools}
                          disabled={!canInstall}
                          installedCount={myInstalls.length}
                        />
                      </div>

                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.description}</p>

                      <div className="mt-4 border-t pt-3">
                        <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                          Permission manifest
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tools.slice(0, CHIP_PREVIEW).map((tool) => (
                            <span
                              key={tool}
                              className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[0.65rem] text-secondary-foreground"
                            >
                              {tool}
                            </span>
                          ))}
                          {tools.length > CHIP_PREVIEW && (
                            <span className="rounded-md bg-secondary/60 px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                              +{tools.length - CHIP_PREVIEW} more
                            </span>
                          )}
                          {tools.length === 0 && (
                            <span className="text-[0.7rem] text-muted-foreground">no tool access</span>
                          )}
                        </div>
                        <p className="mt-2 text-[0.7rem] text-muted-foreground">
                          ≤ {manifest.budget.maxSteps} steps · ≤ {Math.round(manifest.budget.maxTokens / 1000)}k tokens · ≤ ${(manifest.budget.maxCostMicros / 1_000_000).toFixed(2)} per run
                        </p>
                      </div>

                      {myInstalls.length > 0 && (
                        <p className="mt-3 text-[0.7rem] text-emerald-600 dark:text-emerald-500">
                          Installed in this workspace ({myInstalls.length}) —{" "}
                          <Link href="/dashboard/agents" className="underline underline-offset-2">
                            view your agents
                          </Link>
                        </p>
                      )}
                    </article>
                  );
                })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

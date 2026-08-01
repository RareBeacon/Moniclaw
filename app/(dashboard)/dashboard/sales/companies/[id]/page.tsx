import type { Metadata } from "next";
import Link from "next/link";

import { formatRelative } from "@/lib/format";
import { scoreReasonsOf, sourcesOf, salesPageContext, salesRepos, badgesForDraftStatus } from "@/lib/sales/page-data";
import { CompleteActivityButton, DeleteEntityButton, RefreshButton, ResearchButton } from "@/components/dashboard/sales/controls";
import { ActivityForm, CompanyForm, ContactForm, DealForm, DraftComposeForm } from "@/components/dashboard/sales/forms";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Sales · Company", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await salesPageContext();
  if (!ctx) return null;
  const { id } = await params;
  const repos = salesRepos();
  const company = await repos.companies.get(ctx.workspace.id, id);
  if (!company) notFound();

  const [contacts, deals, activities, drafts, pipelines] = await Promise.all([
    repos.contacts.listByCompany(ctx.workspace.id, id, 20),
    repos.deals.list(ctx.workspace.id, { take: 100 }),
    repos.activities.list(ctx.workspace.id, { companyId: id, take: 30 }),
    repos.drafts.list(ctx.workspace.id, { companyId: id, take: 10 }),
    repos.pipelines.list(ctx.workspace.id),
  ]);
  const companyDeals = deals.filter((d) => d.companyId === id);
  const reasons = scoreReasonsOf(company.scoreReasons);
  const sources = sourcesOf(company.sources);
  const contactsOptions = contacts.map((c) => ({ id: c.id, name: c.name, companyId: c.companyId }));
  const stageNames = new Map(pipelines.flatMap((p) => p.stages.map((s) => [s.id, s.name] as const)));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            {company.domain && (
              <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                {company.domain}
              </a>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[company.industry, company.size, company.geography].filter(Boolean).join(" · ") || "No firmographics yet — run research."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <ResearchButton companyId={company.id} status={company.researchStatus} />
          {ctx.canWrite && <DeleteEntityButton kind="company" id={company.id} redirectTo="/dashboard/sales/companies" />}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Priority", company.priorityScore],
          ["ICP fit", company.icpFit ?? "—"],
          ["Fit score", company.fitScore],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {reasons.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Why this score</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Research</h2>
          <span className="text-xs text-muted-foreground">
            {company.lastResearchedAt ? `last run ${formatRelative(company.lastResearchedAt)}` : "never run"}
          </span>
        </header>
        <div className="p-5 space-y-4">
          {company.summary ? <p className="text-sm leading-6">{company.summary}</p> : (
            <p className="text-sm text-muted-foreground">
              No research yet. The research worker only uses public, freely accessible sources —
              authenticated, paywalled, or private data is never touched.
            </p>
          )}
          {(company.businessModel || company.productsServices || company.targetMarket || company.techStack.length > 0) && (
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              {company.businessModel && <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Business model</dt><dd className="mt-0.5">{company.businessModel}</dd></div>}
              {company.productsServices && <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Products & services</dt><dd className="mt-0.5">{company.productsServices}</dd></div>}
              {company.targetMarket && <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Target market</dt><dd className="mt-0.5">{company.targetMarket}</dd></div>}
              {company.techStack.length > 0 && <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Tech stack</dt><dd className="mt-0.5">{company.techStack.join(", ")}</dd></div>}
            </dl>
          )}
          {sources.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources</p>
              <ul className="mt-1.5 space-y-1">
                {sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Contacts ({contacts.length})</h2>
            {ctx.canWrite && (
              <Link href={`/dashboard/sales/contacts/new?companyId=${company.id}`} className="text-xs text-primary hover:underline">Add contact</Link>
            )}
          </header>
          {contacts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No contacts — research finds public contact pages; add people manually.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/sales/contacts/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{[c.title, c.email].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{c.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Deals ({companyDeals.length})</h2>
            {ctx.canWrite && (
              <Link href={`/dashboard/sales/deals/new?companyId=${company.id}`} className="text-xs text-primary hover:underline">New deal</Link>
            )}
          </header>
          {companyDeals.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No deals yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {companyDeals.map((d) => (
                <li key={d.id}>
                  <Link href={`/dashboard/sales/deals`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{stageNames.get(d.stageId) ?? "—"}</p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium",
                      d.status === "WON" ? "bg-emerald-500/10 text-emerald-600" : d.status === "LOST" ? "bg-red-500/10 text-red-500" : "bg-sky-500/10 text-sky-600")}>
                      {d.status}{d.valueUsd ? ` · $${Number(d.valueUsd).toLocaleString()}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-5 py-3.5">
          <h2 className="text-sm font-semibold">Timeline</h2>
        </header>
        <div className="grid gap-0 lg:grid-cols-2">
          <ul className="divide-y divide-border/60">
            {activities.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">Nothing logged yet.</li>}
            {activities.map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 rounded-md bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">{a.type}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.completedAt ? `completed ${formatRelative(a.completedAt)}` : a.dueAt ? `due ${formatRelative(a.dueAt)}` : formatRelative(new Date(a.createdAt))}
                  </p>
                </div>
                {!a.completedAt && a.type !== "NOTE" && ctx.canWrite && <CompleteActivityButton activityId={a.id} />}
              </li>
            ))}
          </ul>
          <div className="border-t border-border/60 p-5 lg:border-l lg:border-t-0">
            {ctx.canWrite && <ActivityForm companyId={company.id} />}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {ctx.canWrite && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">New outreach draft</h2>
            <DraftComposeForm companyId={company.id} contactId={contacts[0]?.id ?? null} />
          </section>
        )}
        <section className="rounded-2xl border border-border bg-card">
          <header className="border-b border-border/60 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Drafts ({drafts.length})</h2>
          </header>
          {drafts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">No drafts for this company yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {drafts.map((d) => {
                const badge = badgesForDraftStatus(d.status);
                return (
                  <li key={d.id}>
                    <Link href={`/dashboard/sales/drafts/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.subject || "(no subject)"}</p>
                        <p className="text-xs text-muted-foreground">{formatRelative(new Date(d.createdAt))}</p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">{badge.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {ctx.canWrite && (
          <section className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold mb-4">Edit company</h2>
            <CompanyForm company={{
              id: company.id, name: company.name, domain: company.domain,
              industry: company.industry, size: company.size, geography: company.geography,
              tags: company.tags, segment: company.segment, territory: company.territory,
            }} />
          </section>
        )}
      </div>
    </div>
  );
}

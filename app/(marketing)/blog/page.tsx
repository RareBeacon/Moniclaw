import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { posts } from "@/lib/posts";
import { Section, Eyebrow } from "@/components/shared/section";
import { Reveal, RevealGroup, RevealItem } from "@/components/shared/reveal";
import { GridBackdrop, Glow } from "@/components/shared/backgrounds";
import { NewsletterForm } from "@/components/layout/newsletter-form";

export const metadata: Metadata = {
  title: "Blog — The Workload",
  description:
    "Essays, engineering deep-dives, and playbooks on the AI workforce — reliability, governance, and the economics of delegating work to agents.",
};

function AuthorLine({ post }: { post: (typeof posts)[number] }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-[0.65rem] font-semibold text-white"
      >
        {post.author.initials}
      </span>
      <div className="text-xs">
        <p className="font-semibold text-foreground">{post.author.name}</p>
        <p className="text-muted-foreground">
          {post.date} · {post.readingTime}
        </p>
      </div>
    </div>
  );
}

export default function BlogPage() {
  const [featured, ...rest] = posts;

  return (
    <>
      <section className="relative overflow-hidden py-20 sm:py-24">
        <GridBackdrop />
        <Glow className="left-1/2 top-[-12rem] h-[22rem] w-[42rem] -translate-x-1/2" />
        <div className="container relative">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">The Workload</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Notes from building the AI workforce
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Essays, engineering deep-dives, and operating playbooks — on
              reliability, governance, and the economics of delegating real work
              to agents. No hype survives our editorial review.
            </p>
          </div>
        </div>
      </section>

      <Section className="pt-10">
        {/* Featured */}
        <Reveal>
          <Link
            href={`/blog/${featured.slug}`}
            className="group grid gap-8 overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-soft lg:grid-cols-2"
          >
            <div className="flex flex-col justify-center gap-5 p-8 sm:p-10">
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                  {featured.category}
                </span>
                <span className="text-muted-foreground">Featured</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {featured.title}
              </h2>
              <p className="leading-7 text-muted-foreground">{featured.excerpt}</p>
              <div className="flex items-center justify-between gap-4">
                <AuthorLine post={featured} />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </div>
            <div
              aria-hidden
              className="relative hidden min-h-[320px] bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-800 lg:block"
            >
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                  backgroundSize: "36px 36px",
                }}
              />
              <p className="absolute bottom-8 left-8 max-w-xs text-lg font-medium leading-snug text-white/90">
                “The question is no longer which tool this team should use. It
                is which jobs this team should never do again.”
              </p>
            </div>
          </Link>
        </Reveal>

        {/* Grid */}
        <RevealGroup className="mt-8 grid gap-6 md:grid-cols-2">
          {rest.map((post) => (
            <RevealItem key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex h-full flex-col gap-5 rounded-2xl border bg-card p-8 transition-all hover:-translate-y-0.5 hover:shadow-soft"
              >
                <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  {post.category}
                </span>
                <h2 className="text-xl font-semibold tracking-tight">
                  {post.title}
                </h2>
                <p className="flex-1 text-[0.92rem] leading-7 text-muted-foreground">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between gap-4 border-t pt-5">
                  <AuthorLine post={post} />
                  <ArrowUpRight
                    className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </div>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* Newsletter band */}
        <Reveal className="mt-14">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center sm:p-10">
            <h2 className="text-xl font-semibold tracking-tight">
              One useful email a month
            </h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              New essays, scorecard releases, and the occasional postmortem.
              Subscribed teams forward it; unsubscribing takes one click.
            </p>
            <NewsletterForm />
          </div>
        </Reveal>
      </Section>
    </>
  );
}

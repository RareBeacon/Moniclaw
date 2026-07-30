import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { getPost, posts, type PostBlock } from "@/lib/posts";
import { Section } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";
import { FinalCta } from "@/components/home/final-cta";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
    },
  };
}

function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "p":
      return <p>{block.text}</p>;
    case "h2":
      return <h2>{block.text}</h2>;
    case "ul":
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item.slice(0, 48)}>{item}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote>
          {block.text}
          {block.cite ? <cite> — {block.cite}</cite> : null}
        </blockquote>
      );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = posts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <>
      <Section className="py-14 sm:py-20">
        <article className="mx-auto max-w-3xl">
          <Reveal>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All essays
            </Link>
            <div className="mt-8 flex items-center gap-3 text-xs font-medium">
              <span className="rounded-full bg-accent px-2.5 py-1 text-accent-foreground">
                {post.category}
              </span>
              <span className="text-muted-foreground">
                {post.date} · {post.readingTime}
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
              {post.title}
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              {post.excerpt}
            </p>
            <div className="mt-8 flex items-center gap-3 border-y py-5">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-xs font-semibold text-white"
              >
                {post.author.initials}
              </span>
              <div>
                <p className="text-sm font-semibold">{post.author.name}</p>
                <p className="text-xs text-muted-foreground">{post.author.role}</p>
              </div>
            </div>
          </Reveal>

          <div className="article-body">
            {post.body.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>

          <div className="mt-14 rounded-2xl border bg-card p-7">
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-sm font-semibold text-white"
              >
                {post.author.initials}
              </span>
              <div>
                <p className="font-semibold">{post.author.name}</p>
                <p className="text-sm text-primary">{post.author.role}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Writing from the MoniClaw team in San Francisco. We publish
                  when we have something measured to say — subscribe below for
                  the monthly edition.
                </p>
              </div>
            </div>
          </div>
        </article>
      </Section>

      {/* Related */}
      <Section className="pt-0">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xl font-semibold tracking-tight">Keep reading</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/blog/${other.slug}`}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-soft"
              >
                <span className="w-fit rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
                  {other.category}
                </span>
                <h3 className="font-semibold tracking-tight">{other.title}</h3>
                <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      <FinalCta />
    </>
  );
}

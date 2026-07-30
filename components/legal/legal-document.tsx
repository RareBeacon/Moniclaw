import { FileText } from "lucide-react";

import type { LegalDoc } from "@/lib/legal";
import { Section } from "@/components/shared/section";
import { Reveal } from "@/components/shared/reveal";

export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <>
      <section className="border-b bg-secondary/20 py-16 sm:py-20">
        <div className="container">
          <Reveal className="flex max-w-3xl flex-col gap-4">
            <span className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4 text-primary" aria-hidden />
              Legal — effective document
            </span>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              {doc.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated: {doc.lastUpdated} · MoniClaw, Inc.
            </p>
            <div className="article-body mt-2">
              {doc.intro.map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <Section className="py-14">
        <div className="grid gap-12 lg:grid-cols-[260px_1fr]">
          {/* Table of contents */}
          <nav aria-label="Table of contents" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                On this page
              </p>
              <ul className="mt-4 space-y-2.5 border-l">
                {doc.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px block border-l-2 border-transparent pl-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* Body */}
          <div className="article-body max-w-3xl">
            {doc.sections.map((section) => (
              <div key={section.id}>
                <h2 id={section.id} className="!mt-0">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)}>{paragraph}</p>
                ))}
                {section.list && (
                  <ul>
                    {section.list.map((item) => (
                      <li key={item.slice(0, 48)}>{item}</li>
                    ))}
                  </ul>
                )}
                <div className="mb-12" />
              </div>
            ))}
            <h2 id="contact">Contact</h2>
            <p>{doc.contactNote}</p>
          </div>
        </div>
      </Section>
    </>
  );
}

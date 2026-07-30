import Link from "next/link";
import { Github, Linkedin, Twitter } from "lucide-react";

import { footerNav } from "@/lib/nav";
import { siteConfig } from "@/lib/site";
import { Logo } from "@/components/shared/logo";
import { NewsletterForm } from "@/components/layout/newsletter-form";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-secondary/30">
      <div className="container py-16">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-5">
            <Logo />
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              The AI workforce operating system. Hire agents that operate your
              browsers, software, and APIs — with the controls a real business
              demands.
            </p>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">The Workload, monthly</p>
              <NewsletterForm />
            </div>
          </div>

          {footerNav.map((column) => (
            <nav
              key={column.title}
              aria-label={`Footer — ${column.title}`}
              className="flex flex-col gap-3"
            >
              <p className="text-sm font-semibold">{column.title}</p>
              {column.links.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.title}
                </Link>
              ))}
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-6 border-t pt-8 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <p className="text-sm text-muted-foreground">
              © {year} MoniClaw, Inc. All rights reserved.
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                aria-hidden
                className="relative flex h-2 w-2"
              >
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </p>
          </div>

          <div className="flex items-center gap-1">
            <a
              href={siteConfig.social.github}
              target="_blank"
              rel="noreferrer"
              aria-label="MoniClaw on GitHub"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Github className="h-[1.1rem] w-[1.1rem]" aria-hidden />
            </a>
            <a
              href={siteConfig.social.x}
              target="_blank"
              rel="noreferrer"
              aria-label="MoniClaw on X"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Twitter className="h-[1.1rem] w-[1.1rem]" aria-hidden />
            </a>
            <a
              href={siteConfig.social.linkedin}
              target="_blank"
              rel="noreferrer"
              aria-label="MoniClaw on LinkedIn"
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Linkedin className="h-[1.1rem] w-[1.1rem]" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

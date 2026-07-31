import Link from "next/link";
import { Compass, Home, LifeBuoy } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Page not found",
};

// The root not-found renders outside the marketing layout, so it composes the
// same chrome explicitly.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="bg-gradient-to-br from-primary to-indigo-500 bg-clip-text font-mono text-7xl font-semibold tracking-tight text-transparent sm:text-8xl">
          404
        </p>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
          This run completed early
        </h1>
        <p className="mt-4 max-w-md leading-7 text-muted-foreground">
          The page you asked for doesn&apos;t exist — no evidence pack, no
          replay, no trace. Let&apos;s route you somewhere productive.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "group")}>
            <Home className="h-4 w-4" aria-hidden />
            Back to homepage
          </Link>
          <Link
            href="/docs"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <Compass className="h-4 w-4" aria-hidden />
            Browse the docs
          </Link>
          <Link
            href="/contact"
            className={buttonVariants({ variant: "ghost", size: "lg" })}
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Contact support
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

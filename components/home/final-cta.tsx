import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/shared/reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section className="container pb-24 pt-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-violet-600 via-indigo-600 to-violet-700 px-6 py-20 text-center text-white shadow-glow sm:px-16">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 80% 70% at 50% 30%, black 30%, transparent 75%)",
            }}
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-7">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
              Your next hire starts this afternoon
            </h2>
            <p className="text-lg leading-8 text-violet-100">
              Describe one job that eats your team&apos;s week. Watch an agent
              run it in shadow mode tonight. Go autonomous when the evidence —
              not the demo — convinces you.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "xl" }),
                  "group bg-white text-violet-700 hover:bg-violet-50"
                )}
              >
                Start hiring — free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link
                href="/contact?topic=sales"
                className={cn(
                  buttonVariants({ variant: "outline", size: "xl" }),
                  "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
                )}
              >
                Talk to sales
              </Link>
            </div>
            <p className="text-sm text-violet-200">
              Free plan forever · Cancel anytime · Your data never trains models
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

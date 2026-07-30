"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AppWindow,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  MousePointerClick,
  Play,
  ShieldCheck,
} from "lucide-react";

import { Glow, GridBackdrop } from "@/components/shared/backgrounds";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EASE = [0.21, 0.47, 0.32, 0.98] as const;

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: EASE, delay },
});

/** Stylized live view of an agent executing a workflow. */
function AgentWindow() {
  const steps = [
    { icon: MousePointerClick, label: "Opened vendor portal — net-30 queue", done: true },
    { icon: AppWindow, label: "Matched 14 invoices against PO system", done: true },
    { icon: CircleDollarSign, label: "Reconciled Stripe payouts for June", done: true },
    { icon: ShieldCheck, label: "Requesting approval: refund over $50", done: false },
  ];

  return (
    <motion.div
      {...fadeUp(0.5)}
      className="relative mx-auto mt-16 w-full max-w-4xl"
    >
      {/* Floating approval card */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.4, duration: 0.5, ease: EASE }}
        className="absolute -right-3 -top-8 z-10 hidden rounded-xl border bg-card p-3.5 shadow-soft sm:block lg:-right-10"
      >
        <div className="flex items-center gap-2.5">
          <BadgeCheck className="h-5 w-5 text-emerald-500" aria-hidden />
          <div className="text-xs">
            <p className="font-semibold">Approval granted</p>
            <p className="text-muted-foreground">Refund $42.10 · within policy</p>
          </div>
        </div>
      </motion.div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b bg-secondary/50 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" aria-hidden />
          <div className="ml-4 flex items-center gap-2 rounded-md bg-background/80 px-3 py-1 text-xs text-muted-foreground">
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-emerald-500"
              aria-hidden
            />
            Agent session — mara.ar@yourco.com
          </div>
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Running
          </span>
        </div>

        <div className="grid sm:grid-cols-[1fr_1.2fr]">
          {/* Step timeline */}
          <ol className="flex flex-col gap-1 border-b p-4 sm:border-b-0 sm:border-r">
            {steps.map((step, i) => (
              <motion.li
                key={step.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.25, duration: 0.45, ease: EASE }}
                className="flex items-start gap-3 rounded-lg px-2 py-2"
              >
                {step.done ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                    aria-hidden
                  />
                ) : (
                  <Loader2
                    className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary"
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "text-[0.8rem] leading-5",
                    step.done ? "text-muted-foreground" : "font-medium"
                  )}
                >
                  {step.label}
                </span>
              </motion.li>
            ))}
          </ol>

          {/* Simulated viewport */}
          <div className="relative min-h-[220px] p-4">
            <div className="space-y-2.5">
              <div className="h-9 w-3/4 rounded-md bg-secondary" aria-hidden />
              {[92, 100, 88].map((w, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    delay: i * 0.6,
                    ease: "easeInOut",
                  }}
                  className="flex h-12 items-center gap-3 rounded-md border bg-background px-3"
                  aria-hidden
                >
                  <span className="h-3 w-3 rounded-full bg-primary/30" />
                  <span
                    className="h-2.5 rounded-full bg-secondary"
                    style={{ width: `${w}%` }}
                  />
                </motion.div>
              ))}
            </div>
            {/* Cursor */}
            <motion.div
              initial={{ x: 20, y: 30 }}
              animate={{ x: [20, 110, 60, 150, 20], y: [30, 72, 118, 160, 30] }}
              transition={{ repeat: Infinity, duration: 9, ease: "easeInOut" }}
              className="pointer-events-none absolute left-10 top-8 z-10"
              aria-hidden
            >
              <MousePointerClick className="h-4 w-4 text-primary drop-shadow" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* Under-window stat strip */}
      <motion.div
        {...fadeUp(1.1)}
        className="mt-8 grid grid-cols-1 gap-4 text-center sm:grid-cols-3"
      >
        {[
          { value: "1.2M+", label: "workflows completed by agents" },
          { value: "26 hrs", label: "median weekly workload offloaded" },
          { value: "99.98%", label: "platform uptime, trailing 90 days" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border bg-card/60 px-4 py-4">
            <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-20 sm:pt-28">
      <GridBackdrop />
      <Glow className="left-1/2 top-[-10rem] h-[28rem] w-[52rem] -translate-x-1/2" />

      <div className="container relative">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <motion.div {...fadeUp(0)}>
            <Link
              href="/blog/the-end-of-swivel-chair-work"
              className="group inline-flex items-center gap-2 rounded-full border bg-card/70 py-1.5 pl-2 pr-3 text-sm shadow-sm backdrop-blur transition-colors hover:bg-secondary/70"
            >
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                New
              </span>
              <span className="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                MoniClaw 1.0 is generally available
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </motion.div>

          <motion.h1
            {...fadeUp(0.1)}
            className="mt-8 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl lg:text-[4.35rem]"
          >
            AI employees that do the work,{" "}
            <span className="bg-gradient-to-r from-primary via-indigo-500 to-primary bg-clip-text text-transparent dark:via-indigo-400">
              not just the talking
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.2)}
            className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9"
          >
            MoniClaw is the operating system for your AI workforce. Describe the
            job, connect your tools, set the guardrails — and autonomous agents
            execute it across your browsers, software, and APIs while every
            action stays observable, approvable, and yours.
          </motion.p>

          <motion.div
            {...fadeUp(0.3)}
            className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
          >
            <Link
              href="/signup"
              className={cn(buttonVariants({ size: "xl" }), "group w-full sm:w-auto")}
            >
              Start hiring — free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href="#demo"
              className={cn(
                buttonVariants({ variant: "outline", size: "xl" }),
                "w-full sm:w-auto"
              )}
            >
              <Play className="h-4 w-4" aria-hidden />
              See an agent work
            </Link>
          </motion.div>

          <motion.p {...fadeUp(0.4)} className="mt-5 text-sm text-muted-foreground">
            Free plan · No credit card · First agent live this afternoon
          </motion.p>
        </div>

        <AgentWindow />
      </div>
    </section>
  );
}

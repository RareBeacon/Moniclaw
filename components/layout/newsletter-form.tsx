"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Footer newsletter capture. Submission is wired to the marketing pipeline in
 * a later milestone; for now it validates and confirms locally.
 */
export function NewsletterForm() {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<"idle" | "error" | "done">("idle");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState("error");
      return;
    }
    setState("done");
  };

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
        You&apos;re on the list. Expect one useful email a month.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xs" noValidate>
      <label htmlFor="newsletter-email" className="sr-only">
        Work email
      </label>
      <div className="flex gap-2">
        <Input
          id="newsletter-email"
          type="email"
          autoComplete="email"
          placeholder="Work email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setState("idle");
          }}
          aria-invalid={state === "error"}
          className="h-9"
        />
        <Button type="submit" size="sm" className="h-9 shrink-0 px-3" aria-label="Subscribe">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Enter a valid email address.
        </p>
      )}
    </form>
  );
}

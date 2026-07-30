"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter the email you registered with.");
      return;
    }
    setError(null);
    setStatus("sending");
    // Reset-token issuance ships with Auth.js next milestone.
    await new Promise((r) => setTimeout(r, 900));
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-secondary/40 p-6 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden />
        <p className="text-sm font-medium">Reset link sent</p>
        <p className="text-xs leading-5 text-muted-foreground">
          If an account exists for{" "}
          <strong className="text-foreground">{email}</strong>, a secure reset
          link is on its way. It expires in 30 minutes — check spam if it
          takes longer than two.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Didn&apos;t arrive? Send again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Work email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? "forgot-email-error" : undefined}
        />
        {error && (
          <p id="forgot-email-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={status === "sending"}>
        {status === "sending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Sending reset link…
          </>
        ) : (
          "Send reset link"
        )}
      </Button>
      <p className="pt-2 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

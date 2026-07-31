"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { useFormState } from "react-dom";

import { requestPasswordReset, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.preventDefault();
      setError("Enter the email you registered with.");
      return;
    }
    setError(null);
    setPending(true);
  };

  React.useEffect(() => {
    if (state.error) {
      setError(state.error);
      setPending(false);
    }
  }, [state]);

  if (state.ok) {
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
        <Link
          href="/login"
          className="mt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Work email</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive">{error}</p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
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

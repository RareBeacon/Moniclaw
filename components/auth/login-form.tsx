"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useFormState } from "react-dom";

import { authenticate, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction] = useFormState(authenticate, initialState);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [next, setNext] = React.useState("/dashboard");
  const [pending, setPending] = React.useState(false);

  // Read the optional ?next redirect target after mount (keeps the page static).
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("next");
    if (param && param.startsWith("/")) setNext(param);
  }, []);

  const [clientErrors, setClientErrors] = React.useState<{
    email?: string;
    password?: string;
  }>({});

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const errs: typeof clientErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email address.";
    if (password.length < 1) errs.password = "Enter your password.";
    setClientErrors(errs);
    if (Object.keys(errs).length) {
      e.preventDefault();
      return;
    }
    setPending(true);
  };

  // Server returned an error → clear the pending spinner.
  React.useEffect(() => {
    if (state.error) setPending(false);
  }, [state]);

  return (
    <div>
      <OAuthButtons mode="login" />
      <OrDivider />
      <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
        <input type="hidden" name="next" value={next} />

        {state.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {state.error}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="login-email">Work email</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!clientErrors.email}
          />
          {clientErrors.email && (
            <p role="alert" className="text-xs text-destructive">{clientErrors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!clientErrors.password}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {clientErrors.password && (
            <p role="alert" className="text-xs text-destructive">{clientErrors.password}</p>
          )}
        </div>

        {/* Remember-me is honored when session persistence lands; the
            preference is captured now so the policy ships complete. */}
        <input type="hidden" name="remember" value={String(remember)} />
        <div className="flex items-center gap-2.5">
          <Checkbox id="remember-me" checked={remember} onCheckedChange={setRemember} />
          <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal text-muted-foreground">
            Remember me for 30 days
          </Label>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to MoniClaw?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

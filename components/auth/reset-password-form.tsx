"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useFormState } from "react-dom";

import { resetPassword, type AuthFormState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthFormState = {};

export function ResetPasswordForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [state, formAction] = useFormState(resetPassword, initialState);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [clientError, setClientError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (password.length < 8) {
      e.preventDefault();
      setClientError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      e.preventDefault();
      setClientError("Passwords don't match.");
      return;
    }
    setClientError(null);
    setPending(true);
  };

  React.useEffect(() => {
    if (state.error) setPending(false);
  }, [state]);

  const serverError = state.error;

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />

      {(serverError || clientError) && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          {serverError ?? clientError}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="reset-password">New password</Label>
        <div className="relative">
          <Input
            id="reset-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="8+ characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat it"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Updating password…
          </>
        ) : (
          "Set new password"
        )}
      </Button>
    </form>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OAuthButtons, OrDivider } from "@/components/auth/oauth-buttons";
import { cn } from "@/lib/utils";

function passwordStrength(pw: string): { score: number; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const capped = Math.min(score, 4);
  const labels = ["Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score: capped, label: pw ? labels[capped] : "" };
}

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "terms", string>
>;

export function SignupForm() {
  const router = useRouter();
  const [values, setValues] = React.useState({ name: "", email: "", password: "" });
  const [terms, setTerms] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const strength = passwordStrength(values.password);

  const set = (field: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: FieldErrors = {};
    if (values.name.trim().length < 2) next.name = "Your full name, please.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
      next.email = "Enter a valid work email.";
    if (values.password.length < 8)
      next.password = "Use at least 8 characters.";
    if (!terms) next.terms = "Required — MoniClaw is a business service.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    // Account creation + verification email ship with Auth.js next milestone.
    await new Promise((r) => setTimeout(r, 900));
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
  };

  return (
    <div>
      <OAuthButtons mode="signup" />
      <OrDivider />
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-name">Full name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={values.name}
            onChange={set("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p role="alert" className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-email">Work email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={values.email}
            onChange={set("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p role="alert" className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="8+ characters"
              value={values.password}
              onChange={set("password")}
              aria-invalid={!!errors.password}
              aria-describedby="signup-password-hint"
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
          {values.password.length > 0 && (
            <div id="signup-password-hint" className="flex items-center gap-2.5 pt-1">
              <div className="flex flex-1 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i < strength.score
                        ? strength.score <= 1
                          ? "bg-red-500"
                          : strength.score === 2
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        : "bg-border"
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{strength.label}</span>
            </div>
          )}
          {errors.password && (
            <p role="alert" className="text-xs text-destructive">{errors.password}</p>
          )}
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="accept-terms"
              checked={terms}
              onCheckedChange={(checked) => {
                setTerms(checked);
                setErrors((errs) => ({ ...errs, terms: undefined }));
              }}
              className="mt-0.5"
              aria-invalid={!!errors.terms}
            />
            <Label
              htmlFor="accept-terms"
              className="cursor-pointer text-[0.83rem] font-normal leading-5 text-muted-foreground"
            >
              I agree to the{" "}
              <Link href="/legal/terms" className="font-medium text-primary underline-offset-4 hover:underline">
                Terms of Service
              </Link>{" "}
              and acknowledge the{" "}
              <Link href="/legal/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              .
            </Label>
          </div>
          {errors.terms && (
            <p role="alert" className="text-xs text-destructive">{errors.terms}</p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Creating your workspace…
            </>
          ) : (
            "Create account — free"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

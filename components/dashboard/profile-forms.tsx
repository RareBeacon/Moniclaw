"use client";

import * as React from "react";
import { Check, Github, Loader2, Upload, X } from "lucide-react";
import { useFormState } from "react-dom";

import {
  changePassword,
  deleteAccount,
  removeAvatar,
  signOutEverywhere,
  unlinkAccount,
  updateAvatar,
  updateEmail,
  updateProfile,
  type UserActionState,
} from "@/lib/actions/user";
import { authenticateOAuth } from "@/lib/actions/auth";
import { AVATAR_MAX_BYTES } from "@/lib/validations/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: UserActionState = {};

function StateBanner({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
      {error}
    </p>
  );
}

function useResetPending(state: UserActionState, [pending, setPending]: [boolean, React.Dispatch<React.SetStateAction<boolean>>], opts?: { onOk?: () => void }) {
  React.useEffect(() => {
    if (state.error) setPending(false);
    if (state.ok) {
      setPending(false);
      opts?.onOk?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

// ── Profile (name) ───────────────────────────────────────────────────

export function ProfileNameForm({ name }: { name: string }) {
  const [state, formAction] = useFormState(updateProfile, initialState);
  const [pending, setPending] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  useResetPending(state, [pending, setPending], {
    onOk: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-4">
      <StateBanner error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="profile-name">Full name</Label>
        <Input id="profile-name" name="name" defaultValue={name} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : saved ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : null}
        {saved ? "Saved" : "Save name"}
      </Button>
    </form>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────

export function AvatarForm({ image, initials }: { image: string | null; initials: string }) {
  const [state, setState] = React.useState<UserActionState>({});
  const [pending, setPending] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const file = data.get("avatar");
    if (!(file instanceof File) || file.size === 0) {
      setState({ error: "Choose an image first." });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setState({ error: "Avatars must be under 512 KB." });
      return;
    }
    setPending(true);
    const result = await updateAvatar(initialState, data);
    setPending(false);
    setState(result);
    if (result.ok) setFileName(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar from our asset route
        <img src={image} alt="Your avatar" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-lg font-semibold text-white"
        >
          {initials}
        </span>
      )}
      <div className="min-w-[240px] flex-1 space-y-2">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-[180px] flex-1">
            <label
              htmlFor="avatar-file"
              className="flex h-10 cursor-pointer items-center gap-2 truncate rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-secondary/60"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{fileName ?? "PNG, JPEG, or WebP — up to 512 KB"}</span>
            </label>
            <input
              id="avatar-file"
              ref={fileRef}
              name="avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Upload
          </Button>
          {image && (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                setPending(true);
                await removeAvatar();
                setPending(false);
              }}
              disabled={pending}
            >
              <X className="h-4 w-4" aria-hidden />
              Remove
            </Button>
          )}
        </form>
        {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
        {state.ok && <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400">Avatar updated.</p>}
      </div>
    </div>
  );
}

// ── Email ────────────────────────────────────────────────────────────

export function EmailForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, formAction] = useFormState(updateEmail, initialState);
  const [pending, setPending] = React.useState(false);
  useResetPending(state, [pending, setPending]);

  if (!hasPassword) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        You sign in with an identity provider, so your email is managed there.
        Current address: <strong className="text-foreground">{email}</strong>
      </p>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-4">
      <StateBanner error={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" name="email" type="email" defaultValue={email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email-password">Confirm password</Label>
          <Input id="profile-email-password" name="password" type="password" autoComplete="current-password" />
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Changing email signs you out everywhere and sends a verification link
        to the new address.
      </p>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Update email
      </Button>
    </form>
  );
}

// ── Password ─────────────────────────────────────────────────────────

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction] = useFormState(changePassword, initialState);
  const [pending, setPending] = React.useState(false);
  useResetPending(state, [pending, setPending]);

  if (!hasPassword) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Your account uses OAuth sign-in, so there&apos;s no MoniClaw password
        to change. You can add one later by using the password-reset flow.
      </p>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-4">
      <StateBanner error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" name="newPassword" type="password" autoComplete="new-password" placeholder="8+ characters" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input id="pw-confirm" name="confirmPassword" type="password" autoComplete="new-password" />
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Changing your password signs out every session on every device.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Change password
      </Button>
    </form>
  );
}

// ── Connected accounts ───────────────────────────────────────────────

export function ConnectedAccountsPanel({
  accounts,
}: {
  accounts: { provider: string; createdAt: string }[];
}) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const known = ["google", "github"] as const;
  const connected = new Set(accounts.map((a) => a.provider));

  return (
    <div className="space-y-3">
      {known.map((provider) => {
        const isConnected = connected.has(provider);
        const label = provider === "google" ? "Google" : "GitHub";
        return (
          <div
            key={provider}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {provider === "github" ? (
                <Github className="h-4 w-4" aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                  <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.57-5.15 3.57-8.8Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.84l3.98-3.18Z" />
                  <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.76 12 4.76Z" />
                </svg>
              )}
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p
                  className={cn(
                    "text-xs",
                    isConnected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  )}
                >
                  {isConnected ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
            {isConnected ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={async () => {
                  setPending(provider);
                  setMessage(null);
                  const result = await unlinkAccount(provider);
                  setPending(null);
                  if (result.error) setMessage(result.error);
                }}
              >
                {pending === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Unlink
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={pending !== null}
                onClick={() => {
                  setPending(provider);
                  void authenticateOAuth(provider).catch(() => setPending(null));
                }}
              >
                {pending === provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                Connect
              </Button>
            )}
          </div>
        );
      })}
      {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
      <p className="text-xs leading-5 text-muted-foreground">
        Linking uses the same email address — sign in with either method and
        you land in the same account.
      </p>
    </div>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────

export function SignOutEverywhereButton() {
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  if (!confirm) {
    return (
      <Button variant="outline" onClick={() => setConfirm(true)}>
        Sign out everywhere
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="destructive"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await signOutEverywhere();
        }}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Confirm — revoke all sessions
      </Button>
      <Button variant="ghost" onClick={() => setConfirm(false)}>
        Keep me signed in
      </Button>
    </div>
  );
}

// ── Delete account ───────────────────────────────────────────────────

export function DeleteAccountForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction] = useFormState(deleteAccount, initialState);
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  useResetPending(state, [pending, setPending]);

  if (!open) {
    return (
      <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        Delete account…
      </Button>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setPending(true)} className="space-y-4">
      <StateBanner error={state.error} />
      {hasPassword && (
        <div className="space-y-2">
          <Label htmlFor="delete-password">Confirm with your password</Label>
          <Input id="delete-password" name="password" type="password" autoComplete="current-password" />
        </div>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Your identity is anonymized and workspaces you solely own are
        archived. Sole-owner workspaces with teammates must be transferred or
        deleted first. Audit records remain for compliance, per the Privacy
        Policy.
      </p>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Permanently delete my account
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

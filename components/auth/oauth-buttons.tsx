"use client";

import * as React from "react";
import { Github, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.57-5.15 3.57-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.84l3.98-3.18Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.76 12 4.76Z"
      />
    </svg>
  );
}

/**
 * SSO entry points. Provider handshakes are wired to Auth.js in the backend
 * milestone; clicking previews the full flow with an explicit in-product note.
 */
export function OAuthButtons({ mode }: { mode: "login" | "signup" }) {
  const [pending, setPending] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const start = (provider: string) => {
    setPending(provider);
    setNote(null);
    window.setTimeout(() => {
      setPending(null);
      setNote(
        `${
          provider === "google" ? "Google" : "GitHub"
        } SSO activates with workspace authentication (rolling out now). Use your work email to ${
          mode === "login" ? "sign in" : "reserve your account"
        } meanwhile.`
      );
    }, 900);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => start("google")}
        >
          {pending === "google" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <GoogleIcon />
          )}
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          onClick={() => start("github")}
        >
          {pending === "github" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Github className="h-4 w-4" aria-hidden />
          )}
          GitHub
        </Button>
      </div>
      {note && (
        <p role="status" className="rounded-lg bg-secondary px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        or continue with email
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

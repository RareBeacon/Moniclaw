"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CheckCheck, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_MS = 20_000;

function relTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Operational alert bell — polls the notifications API so rate-limit (and
 * future operational) alerts surface within seconds without a websocket.
 */
export function NotificationBell() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as {
        ok: boolean;
        data?: { notifications: Item[]; unreadCount: number };
      };
      if (payload.ok && payload.data) {
        setItems(payload.data.notifications);
        setUnread(payload.data.unreadCount);
      }
    } catch {
      /* offline blip — next poll recovers */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="h-[1.1rem] w-[1.1rem]" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold text-white transition-transform"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right rounded-xl border bg-popover p-1.5 shadow-lg transition-all animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between px-2.5 py-2">
            <p className="text-xs font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 rounded text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-2.5 pb-3 pt-1 text-xs leading-5 text-muted-foreground">
              All clear — rate-limited keys and other operational alerts will show up here the moment they happen.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href ?? "#"}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary/70",
                      !n.readAt && "bg-secondary/40"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        n.kind === "ai.provider.rate_limited"
                          ? "bg-amber-500/15 text-amber-500"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{n.title}</span>
                        <span className="shrink-0 text-[0.65rem] text-muted-foreground">{relTime(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] leading-4 text-muted-foreground [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                        {n.body}
                      </span>
                    </span>
                    {!n.readAt && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

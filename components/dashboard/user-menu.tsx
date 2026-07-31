"use client";

import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/workspace";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export function UserMenu({
  name,
  email,
  initials,
}: {
  name: string;
  email: string;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2.5 sm:flex">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-[0.65rem] font-semibold text-white"
        >
          {initials}
        </span>
        <div className="hidden text-xs leading-4 lg:block">
          <p className="max-w-[140px] truncate font-medium">{name}</p>
          <p className="max-w-[140px] truncate text-muted-foreground">{email}</p>
        </div>
      </div>
      <ThemeToggle />
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-[1.1rem] w-[1.1rem]" aria-hidden />
        </button>
      </form>
    </div>
  );
}

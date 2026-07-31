"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/actions/workspace";
import { ThemeToggle } from "@/components/shared/theme-toggle";

export function UserMenu({
  name,
  email,
  image,
  initials,
}: {
  name: string;
  email: string;
  image: string | null;
  initials: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/dashboard/profile"
        aria-label="Your profile"
        className="hidden items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-secondary sm:flex"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-provided avatar served from our asset route
          <img
            src={image}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-indigo-600/80 text-[0.65rem] font-semibold text-white"
          >
            {initials}
          </span>
        )}
        <div className="hidden text-left text-xs leading-4 lg:block">
          <p className="max-w-[140px] truncate font-medium">{name}</p>
          <p className="max-w-[140px] truncate text-muted-foreground">{email}</p>
        </div>
      </Link>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/runs", label: "Runs", icon: History },
  { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck, badge: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export function SideNav({ pendingApprovals = 0 }: { pendingApprovals?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {"badge" in item && pendingApprovals > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-600 dark:text-amber-400">
                {pendingApprovals}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

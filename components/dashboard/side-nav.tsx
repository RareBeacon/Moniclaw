"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Building2,
  CalendarCheck,
  CalendarDays,
  Camera,
  Contact,
  CreditCard,
  Download,
  FileSearch,
  FileText,
  FolderKanban,
  Gauge,
  Globe,
  Handshake,
  History,
  Inbox,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LineChart,
  MailCheck,
  Megaphone,
  MessagesSquare,
  MonitorPlay,
  Plug,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Target,
  Upload,
  Users,
  UsersRound,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MembershipRole } from "@prisma/client";

import { can, type Action } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Action;
  badge?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "Operate",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, permission: "agents.read" },
      { href: "/dashboard/agents", label: "Agents", icon: Bot, permission: "agents.read" },
      { href: "/dashboard/teams", label: "Teams", icon: UsersRound, permission: "agents.read" },
      { href: "/dashboard/templates", label: "Templates", icon: Store, permission: "agents.read" },
      { href: "/dashboard/runs", label: "Runs", icon: History, permission: "agents.read" },
      { href: "/dashboard/approvals", label: "Approvals", icon: ShieldCheck, permission: "approvals.read", badge: true },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/dashboard/sales", label: "Overview", icon: Target, permission: "sales.read" },
      { href: "/dashboard/sales/companies", label: "Companies", icon: Building2, permission: "sales.read" },
      { href: "/dashboard/sales/contacts", label: "Contacts", icon: Contact, permission: "sales.read" },
      { href: "/dashboard/sales/research", label: "Research", icon: FileSearch, permission: "sales.read" },
      { href: "/dashboard/sales/campaigns", label: "Campaigns", icon: Megaphone, permission: "sales.read" },
      { href: "/dashboard/sales/drafts", label: "Drafts", icon: MailCheck, permission: "sales.read" },
      { href: "/dashboard/sales/approvals", label: "Approvals", icon: Inbox, permission: "sales.read" },
      { href: "/dashboard/sales/deals", label: "Deals", icon: Handshake, permission: "sales.read" },
      { href: "/dashboard/sales/pipelines", label: "Pipelines", icon: KanbanSquare, permission: "sales.read" },
      { href: "/dashboard/sales/tasks", label: "Tasks", icon: CalendarCheck, permission: "sales.read" },
      { href: "/dashboard/sales/meetings", label: "Meetings", icon: CalendarDays, permission: "sales.read" },
      { href: "/dashboard/sales/analytics", label: "Analytics", icon: BarChart3, permission: "sales.read" },
      { href: "/dashboard/sales/settings", label: "Settings", icon: Settings2, permission: "sales.read" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard/playground", label: "Playground", icon: MessagesSquare, permission: "ai.chat" },
      { href: "/dashboard/memory", label: "Memory", icon: Brain, permission: "ai.memory.read" },
      { href: "/dashboard/prompts", label: "Prompts", icon: FileText, permission: "ai.prompts.manage" },
      { href: "/dashboard/workflows", label: "Workflows", icon: Workflow, permission: "ai.workflows.manage" },
      { href: "/dashboard/ai-providers", label: "AI Providers", icon: Plug, permission: "ai.providers.manage" },
    ],
  },
  {
    title: "Content",
    items: [
      { href: "/dashboard/knowledge", label: "Knowledge", icon: BookOpen, permission: "knowledge.read" },
      { href: "/dashboard/files", label: "Files", icon: FolderKanban, permission: "files.read" },
    ],
  },
  {
    title: "Computer Use",
    items: [
      { href: "/dashboard/browser", label: "Sessions", icon: Globe, permission: "browser.read" },
      { href: "/dashboard/browser/live", label: "Live Execution", icon: Zap, permission: "browser.read" },
      { href: "/dashboard/browser/recordings", label: "Recordings", icon: MonitorPlay, permission: "browser.read" },
      { href: "/dashboard/browser/history", label: "History", icon: History, permission: "browser.read" },
      { href: "/dashboard/browser/downloads", label: "Downloads", icon: Download, permission: "browser.read" },
      { href: "/dashboard/browser/uploads", label: "Uploads", icon: Upload, permission: "browser.read" },
      { href: "/dashboard/browser/screenshots", label: "Screenshots", icon: Camera, permission: "browser.read" },
      { href: "/dashboard/browser/permissions", label: "Policy", icon: ShieldCheck, permission: "browser.read" },
      { href: "/dashboard/browser/settings", label: "Engine Settings", icon: SlidersHorizontal, permission: "browser.read" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/dashboard/usage", label: "Usage", icon: Gauge, permission: "usage.read" },
      { href: "/dashboard/analytics", label: "Analytics", icon: LineChart, permission: "analytics.read" },
      { href: "/dashboard/audit-logs", label: "Audit logs", icon: ScrollText, permission: "audit.read" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: "/dashboard/members", label: "Members", icon: Users, permission: "members.read" },
      { href: "/dashboard/billing", label: "Billing", icon: CreditCard, permission: "billing.manage" },
      { href: "/dashboard/api-keys", label: "API keys", icon: KeyRound, permission: "apikeys.manage" },
      { href: "/dashboard/settings", label: "Settings", icon: Settings, permission: "members.read" },
    ],
  },
];

export function SideNav({
  pendingApprovals = 0,
  role,
}: {
  pendingApprovals?: number;
  role: MembershipRole;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Workspace" className="flex flex-col gap-6">
      {sections.map((section) => {
        const visible = section.items.filter((item) => can(role, item.permission));
        if (visible.length === 0) return null;
        return (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {visible.map((item) => {
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
                    {item.badge && pendingApprovals > 0 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-600 dark:text-amber-400">
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

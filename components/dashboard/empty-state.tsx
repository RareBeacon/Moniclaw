import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed bg-card/50 px-8 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {cta && href && (
        <Link href={href} className={cn(buttonVariants({ size: "sm" }), "mt-1")}>
          {cta}
        </Link>
      )}
    </div>
  );
}

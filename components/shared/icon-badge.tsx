import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Consistent rounded tile used to present feature/category icons. */
export function IconBadge({
  icon: Icon,
  className,
  size = "default",
}: {
  icon: LucideIcon;
  className?: string;
  size?: "sm" | "default" | "lg";
}) {
  const sizes = {
    sm: "h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4",
    default: "h-10 w-10 rounded-lg [&_svg]:h-5 [&_svg]:w-5",
    lg: "h-12 w-12 rounded-xl [&_svg]:h-6 [&_svg]:w-6",
  } as const;

  return (
    <div
      className={cn(
        "flex items-center justify-center border border-primary/15 bg-accent text-accent-foreground",
        sizes[size],
        className
      )}
    >
      <Icon aria-hidden />
    </div>
  );
}

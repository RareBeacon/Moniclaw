import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("h-7 w-7", className)}
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill="url(#moniclaw-mark-gradient)"
      />
      {/* A stylized claw: three reaching strokes converging on a core node */}
      <path
        d="M9 22.5C12.2 22.5 14.6 20.6 15.4 17.4"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M10.5 15.5C13.3 15.8 15.1 15 16 12.4"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M14 9.5C16 10.9 16.9 12.2 16.9 14.6"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="17.8" cy="18.4" r="2.6" fill="white" />
      <circle cx="23" cy="11" r="1.7" fill="white" opacity="0.9" />
      <path
        d="M19.8 16.6C21 14.9 21.9 13.2 22.6 12.4"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <defs>
        <linearGradient
          id="moniclaw-mark-gradient"
          x1="0"
          y1="0"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7C5CFF" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({
  href = "/",
  className,
  withWordmark = true,
}: {
  href?: string;
  className?: string;
  withWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="MoniClaw home"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <LogoMark />
      {withWordmark && (
        <span className="text-[1.05rem]">
          Moni<span className="text-primary">Claw</span>
        </span>
      )}
    </Link>
  );
}

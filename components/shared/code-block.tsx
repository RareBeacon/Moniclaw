import { cn } from "@/lib/utils";

/** Terminal/docs style code window with traffic-light chrome. */
export function CodeBlock({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-zinc-950 text-zinc-100 shadow-sm dark:bg-zinc-900/60",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden />
        {title ? (
          <span className="ml-3 font-mono text-xs text-zinc-400">{title}</span>
        ) : null}
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[0.82rem] leading-7">
        <code>{children}</code>
      </pre>
    </div>
  );
}

// Minimal token helpers for hand-tinted snippets (no runtime highlighter dep).
export const T = {
  comment: ({ children }: { children: React.ReactNode }) => (
    <span className="text-zinc-500">{children}</span>
  ),
  keyword: ({ children }: { children: React.ReactNode }) => (
    <span className="text-violet-400">{children}</span>
  ),
  string: ({ children }: { children: React.ReactNode }) => (
    <span className="text-emerald-400">{children}</span>
  ),
  fn: ({ children }: { children: React.ReactNode }) => (
    <span className="text-sky-400">{children}</span>
  ),
  plain: ({ children }: { children: React.ReactNode }) => (
    <span className="text-zinc-200">{children}</span>
  ),
};

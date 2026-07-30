import { LogoMark } from "@/components/shared/logo";
import { cn } from "@/lib/utils";

export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="container flex items-center py-10 sm:py-16">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card shadow-soft lg:min-h-[640px] lg:grid-cols-[1fr_1.1fr]">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-800 p-10 text-white lg:flex">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "40px 40px",
              maskImage:
                "radial-gradient(ellipse 90% 80% at 30% 20%, black 20%, transparent 75%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 80% at 30% 20%, black 20%, transparent 75%)",
            }}
          />
          <div className="relative flex items-center gap-2.5 font-semibold">
            <LogoMark className="h-8 w-8" />
            MoniClaw
          </div>
          <div className="relative space-y-6">
            <blockquote className="text-xl font-medium leading-snug">
              “We closed our books two days faster and stopped hiring for roles
              that were really just browser tabs.”
            </blockquote>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xs font-semibold"
              >
                RO
              </span>
              <div className="text-sm">
                <p className="font-semibold">Renata Okafor</p>
                <p className="text-violet-200">VP of Finance, Corebridge Logistics</p>
              </div>
            </div>
          </div>
          <p className="relative text-xs leading-5 text-violet-200">
            SOC 2 controls · SSO/SAML · Your data never trains models
          </p>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center p-7 sm:p-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className={cn("mt-2 text-sm leading-6 text-muted-foreground")}>
              {subtitle}
            </p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

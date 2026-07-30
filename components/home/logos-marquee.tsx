import { logos } from "@/lib/social-proof";
import { Reveal } from "@/components/shared/reveal";

const wordmarkStyles = [
  "font-bold tracking-[0.22em] text-sm",
  "font-serif italic text-xl",
  "font-semibold text-lg tracking-tight",
  "font-bold tracking-[0.3em] text-xs",
  "font-medium text-lg tracking-wide",
  "font-serif font-semibold text-xl tracking-tight",
];

export function LogosMarquee() {
  const doubled = [...logos, ...logos];
  return (
    <section aria-label="Trusted by" className="border-y bg-secondary/20 py-10">
      <div className="container">
        <Reveal>
          <p className="text-center text-sm font-medium text-muted-foreground">
            Running operations for teams at
          </p>
        </Reveal>
        <div className="mask-fade-edges-x mt-7 overflow-hidden">
          <div className="flex w-max animate-marquee items-center gap-16 pr-16 hover:[animation-play-state:paused] motion-reduce:animate-none">
            {doubled.map((logo, i) => (
              <span
                key={`${logo.name}-${i}`}
                aria-hidden={i >= logos.length}
                className={`whitespace-nowrap text-muted-foreground/70 transition-colors hover:text-foreground ${wordmarkStyles[i % wordmarkStyles.length]}`}
              >
                {logo.wordmark}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

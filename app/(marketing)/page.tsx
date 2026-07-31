import { Hero } from "@/components/home/hero";
import { LogosMarquee } from "@/components/home/logos-marquee";
import { Problem } from "@/components/home/problem";
import { Solution } from "@/components/home/solution";
import { HowItWorks } from "@/components/home/how-it-works";
import { Demo } from "@/components/home/demo";
import { Categories } from "@/components/home/categories";
import { FeaturesGrid } from "@/components/home/features-grid";
import { Security } from "@/components/home/security";
import { Testimonials } from "@/components/home/testimonials";
import { PricingPreview } from "@/components/home/pricing-preview";
import { Faq } from "@/components/home/faq";
import { FinalCta } from "@/components/home/final-cta";

export default function HomePage() {
  return (
    <>
      <Hero />
      <LogosMarquee />
      <Problem />
      <Solution />
      <HowItWorks />
      <Demo />
      <Categories />
      <FeaturesGrid />
      <Security />
      <Testimonials />
      <PricingPreview />
      <Faq />
      <FinalCta />
    </>
  );
}

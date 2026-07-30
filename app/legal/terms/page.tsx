import type { Metadata } from "next";

import { termsOfService } from "@/lib/legal";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you and MoniClaw covering the AI workforce platform — accounts, agents, acceptable use, billing, data, and liability.",
};

export default function TermsPage() {
  return <LegalDocument doc={termsOfService} />;
}

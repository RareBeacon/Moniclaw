import type { Metadata } from "next";

import { privacyPolicy } from "@/lib/legal";
import { LegalDocument } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How MoniClaw collects, uses, and protects your data — including our commitment to never train AI models on your data.",
};

export default function PrivacyPage() {
  return <LegalDocument doc={privacyPolicy} />;
}

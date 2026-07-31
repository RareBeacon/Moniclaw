/**
 * Personalization — template context + rendering for drafts.
 *
 * Rendering REUSES the Phase-3 prompt renderer (`renderPrompt`): unknown
 * placeholders are left intact (with warnings) instead of silently
 * blanking — a rep always sees an unresolved {{slot}} before approving.
 */
import { renderPrompt } from "@runtime/prompts/renderer";

import type { DraftContext } from "./types";

export interface PersonalizableCompany {
  name: string;
  domain: string | null;
  industry: string | null;
  summary: string | null;
}

export interface PersonalizableContact {
  name: string;
  title: string | null;
  email: string | null;
}

export function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first ?? "";
}

export function buildDraftContext(
  company: PersonalizableCompany | null,
  contact: PersonalizableContact | null,
  sender: { name: string | null; title?: string | null },
  workspaceName: string
): DraftContext {
  return {
    contactFirstName: firstNameOf(contact?.name),
    contactName: contact?.name ?? "",
    contactTitle: contact?.title ?? "",
    contactEmail: contact?.email ?? "",
    companyName: company?.name ?? "",
    companyDomain: company?.domain ?? "",
    companyIndustry: company?.industry ?? "",
    companySummary: company?.summary ?? "",
    senderName: sender.name ?? "",
    senderTitle: sender.title ?? "",
    workspaceName,
  };
}

export interface RenderedDraft {
  subject: string | null;
  body: string;
  /** Unresolved placeholders + unused values — surfaced in the review UI. */
  warnings: string[];
}

export function renderDraftTemplate(
  template: { subject?: string | null; bodyTemplate: string },
  ctx: DraftContext
): RenderedDraft {
  const values = ctx as unknown as Record<string, string>;
  const body = renderPrompt(template.bodyTemplate, [], values);
  const subject = template.subject ? renderPrompt(template.subject, [], values) : null;
  const warnings = [...body.warnings, ...(subject?.warnings ?? [])];
  return { subject: subject ? subject.rendered : null, body: body.rendered, warnings };
}

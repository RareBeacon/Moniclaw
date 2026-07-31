/**
 * CampaignEngine — advances campaign enrollments one tick at a time.
 *
 * Every outbound artifact is a DRAFT that parks on the Approval table
 * (PENDING_REVIEW) — nothing is ever "sent" by the engine; sending is a
 * provider integration that consumes APPROVED drafts. Daily caps and send
 * windows are enforced at production time.
 */
import { SalesError } from "../errors";
import { buildDraftContext, renderDraftTemplate } from "../personalization";
import type {
  SalesApprovalBridge, SalesAuditSink, SalesCampaignStepRow, SalesClock,
  SalesEnrollmentRow, SalesKnowledgeRetrieval, SalesRepositories,
} from "../ports";

export interface CampaignEngineDeps {
  repos: SalesRepositories;
  approvals: SalesApprovalBridge;
  knowledge: SalesKnowledgeRetrieval;
  audit: SalesAuditSink;
  clock: SalesClock;
  /** Identity for personalization: sender profile + workspace display name. */
  identityFor: (workspaceId: string, createdById: string | null) => Promise<{ name: string | null; title: string | null; workspaceName: string }>;
  requestedTo: (workspaceId: string) => Promise<string>; // approval routing — managers
  /** Batch ceiling per tick call — the tick route remains snappy. */
  batchSize?: number;
}

export interface TickResult {
  processed: number;
  drafted: number;
  tasks: number;
  advanced: number;
  completed: number;
  skipped: number;
}

function delayMs(step: Pick<SalesCampaignStepRow, "delayValue" | "delayUnit">): number {
  const base = step.delayUnit === "HOURS" ? 3_600_000 : 86_400_000;
  return step.delayValue * base;
}

/** Next send-window start (defaults Mon–Fri 09:00 UTC when unconfigured). */
export function nextWindowStart(window: unknown, from: Date): Date {
  const w = (window ?? {}) as { daysOfWeek?: number[]; startHour?: number; endHour?: number };
  const days = w.daysOfWeek?.length ? w.daysOfWeek : [1, 2, 3, 4, 5];
  const startHour = w.startHour ?? 9;
  const endHour = w.endHour ?? 17;

  for (let addDays = 0; addDays <= 7; addDays++) {
    const day = new Date(from.getTime() + addDays * 86_400_000);
    const dow = day.getUTCDay();
    if (!days.includes(dow)) continue;
    const open = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), startHour));
    const close = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), endHour));
    if (from < open) return open;
    if (from >= open && from < close && addDays === 0) return from; // inside window now
  }
  // fallback safety — one week plus open hour
  return new Date(from.getTime() + 7 * 86_400_000);
}

export class CampaignEngine {
  constructor(private readonly deps: CampaignEngineDeps) {}

  /** Open an enrollment conversation: intro draft is produced on the first tick. */
  async enrollContact(
    workspaceId: string,
    actorId: string | null,
    campaignId: string,
    contactId: string
  ): Promise<{ enrollmentId: string; created: boolean }> {
    const campaign = await this.deps.repos.campaigns.get(workspaceId, campaignId);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    if (!["DRAFT", "ACTIVE", "PAUSED"].includes(campaign.status)) {
      throw new SalesError("conflict", `Campaign is ${campaign.status} — it cannot take enrollments.`);
    }
    const contact = await this.deps.repos.contacts.get(workspaceId, contactId);
    if (!contact) throw new SalesError("not_found", "Contact not found.");
    if (contact.status === "LOST") {
      throw new SalesError("conflict", "A LOST contact cannot be enrolled.");
    }
    const steps = await this.deps.repos.campaigns.listSteps(campaignId);
    if (steps.length === 0) throw new SalesError("validation", "Campaign has no steps yet.");

    const first = [...steps].sort((a, b) => a.order - b.order)[0];
    const now = this.deps.clock.now();
    const { enrollment, created } = await this.deps.repos.campaigns.enroll(
      campaignId, contactId, contact.companyId,
      first.kind === "WAIT" ? new Date(now.getTime() + delayMs(first)) : now
    );
    if (created) {
      await this.deps.audit.log({
        workspaceId, actorId, action: "sales.campaign.enroll", target: campaignId,
        metadata: { contactId },
      });
    }
    return { enrollmentId: enrollment.id, created };
  }

  async setEnrollmentStatus(
    workspaceId: string,
    actorId: string | null,
    campaignId: string,
    enrollmentId: string,
    status: "ACTIVE" | "PAUSED" | "UNSUBSCRIBED"
  ): Promise<void> {
    const campaign = await this.deps.repos.campaigns.get(workspaceId, campaignId);
    if (!campaign) throw new SalesError("not_found", "Campaign not found.");
    const patch = status === "ACTIVE" ? { nextRunAt: this.deps.clock.now() } : {};
    await this.deps.repos.campaigns.setEnrollmentStatus(enrollmentId, status, {
      ...(status === "UNSUBSCRIBED" ? { exitReason: "unsubscribed_by_rep" } : {}),
      ...patch,
    });
    await this.deps.audit.log({
      workspaceId, actorId, action: `sales.campaign.enrollment.${status.toLowerCase()}`,
      target: enrollmentId, metadata: { campaignId },
    });
  }

  /**
   * Advance due enrollments. Called from the platform tick (same cadence as
   * the agent runtime) — safe to run every minute.
   */
  async tick(): Promise<TickResult> {
    const now = this.deps.clock.now();
    const due = await this.deps.repos.campaigns.listDueEnrollments(now, this.deps.batchSize ?? 50);
    const result: TickResult = { processed: 0, drafted: 0, tasks: 0, advanced: 0, completed: 0, skipped: 0 };

    for (const enrollment of due) {
      result.processed += 1;
      const campaign = enrollment.campaign;
      try {
        if (campaign.status !== "ACTIVE") { result.skipped += 1; continue; }

        const steps = await this.deps.repos.campaigns.listSteps(campaign.id);
        const ordered = [...steps].sort((a, b) => a.order - b.order);
        const step = ordered.find((s) => s.order > enrollment.currentStep);
        if (!step) {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "COMPLETED", { exitReason: "sequence_finished" });
          result.completed += 1;
          continue;
        }

        // Send-window guard — production waits for the next permitted slot.
        const windowStart = nextWindowStart(campaign.sendWindow, now);
        if (windowStart.getTime() > now.getTime()) {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", { nextRunAt: windowStart });
          result.skipped += 1;
          continue;
        }

        // Daily cap guard.
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const produced = await this.deps.repos.campaigns.countDraftsSince(campaign.id, dayStart);
        if (["DRAFT_EMAIL", "LINKEDIN_CONNECT"].includes(step.kind) && produced >= campaign.dailyCap) {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
            nextRunAt: new Date(dayStart.getTime() + 86_400_000),
          });
          result.skipped += 1;
          continue;
        }

        const advancedTo: Date = new Date(now.getTime() + delayMs(step));
        const condition = (step.condition ?? {}) as { ifContactStatus?: string[] };

        if (step.kind === "WAIT") {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
            currentStep: step.order, nextRunAt: advancedTo,
          });
          result.advanced += 1;
          continue;
        }

        const contact = await this.deps.repos.contacts.get(campaign.workspaceId, enrollment.contactId);
        if (!contact) {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "COMPLETED", { exitReason: "contact_deleted" });
          result.completed += 1;
          continue;
        }
        if (condition.ifContactStatus?.length && !condition.ifContactStatus.includes(contact.status)) {
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
            currentStep: step.order, nextRunAt: advancedTo,
          });
          result.skipped += 1;
          continue;
        }

        if (step.kind === "TASK") {
          const company = contact.companyId
            ? await this.deps.repos.companies.get(campaign.workspaceId, contact.companyId)
            : null;
          const sender = await this.deps.identityFor(campaign.workspaceId, campaign.createdById);
          const ctx = buildDraftContext(company, contact, { name: sender.name, title: sender.title }, sender.workspaceName);
          const rendered = renderDraftTemplate(
            { subject: step.subject ?? "Manual task", bodyTemplate: step.bodyTemplate ?? "" }, ctx
          );
          await this.deps.repos.activities.create(campaign.workspaceId, {
            type: "TASK",
            subject: rendered.subject ?? `Campaign task · ${campaign.name}`,
            body: rendered.body,
            dueAt: now,
            contactId: contact.id,
            companyId: contact.companyId,
            createdById: campaign.createdById,
          });
          await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
            currentStep: step.order, nextRunAt: advancedTo,
          });
          result.tasks += 1;
          continue;
        }

        // DRAFT_EMAIL / LINKEDIN_CONNECT → draft + approval gate.
        const company = contact.companyId
          ? await this.deps.repos.companies.get(campaign.workspaceId, contact.companyId)
          : null;
        const sender = await this.deps.identityFor(campaign.workspaceId, campaign.createdById);
        const ctx = buildDraftContext(company, contact, { name: sender.name, title: sender.title }, sender.workspaceName);
        const rendered = renderDraftTemplate({ subject: step.subject, bodyTemplate: step.bodyTemplate ?? "" }, ctx);

        let playbook: Array<{ title: string; content: string }> = [];
        if (campaign.knowledgeContext) {
          playbook = await this.deps.knowledge.search(
            campaign.workspaceId,
            `${campaign.knowledgeContext} ${company?.name ?? ""}`.trim(),
            3
          );
        }

        const draft = await this.deps.repos.drafts.create(campaign.workspaceId, {
          contactId: contact.id,
          companyId: contact.companyId,
          campaignEnrollmentId: enrollment.id,
          channel: step.kind === "DRAFT_EMAIL" ? "EMAIL" : "LINKEDIN",
          subject: rendered.subject,
          body: rendered.body,
          status: "PENDING_REVIEW",
          personalization: {
            warnings: rendered.warnings,
            playbook,
            campaign: { id: campaign.id, name: campaign.name, step: step.order },
          } as object,
          createdById: campaign.createdById,
        });
        const { approvalId } = await this.deps.approvals.createForDraft({
          workspaceId: campaign.workspaceId,
          draftId: draft.id,
          channel: draft.channel,
          contactLabel: [contact.name, company?.name].filter(Boolean).join(" · "),
          subject: rendered.subject,
          body: rendered.body,
          requestedTo: await this.deps.requestedTo(campaign.workspaceId),
        });
        await this.deps.repos.drafts.setStatus(draft.id, "PENDING_REVIEW", { approvalId });

        if (contact.status === "NEW") await this.deps.repos.contacts.setStatus(contact.id, "CONTACTED");
        await this.deps.repos.contacts.touch(contact.id, now);
        await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
          currentStep: step.order, nextRunAt: advancedTo,
        });
        result.drafted += 1;
      } catch (err) {
        console.warn(`[sales] enrollment ${enrollment.id}:`, (err as Error).message);
        await this.deps.repos.campaigns.setEnrollmentStatus(enrollment.id, "ACTIVE", {
          nextRunAt: new Date(now.getTime() + 3_600_000), // retry in an hour
        });
        result.skipped += 1;
      }
    }
    return result;
  }
}

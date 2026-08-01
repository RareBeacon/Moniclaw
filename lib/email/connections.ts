import { SalesError } from "@sales/index";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { EmailConnectionCreateInput, EmailConnectionUpdateInput } from "@/lib/validations/sales";
import { formatFrom, htmlToText, sendSmtp, verifySmtp } from "./smtp";

/**
 * Email connection service (Phase 6) — workspace-connected outbound email
 * identities (Amazon SES first-class, any SMTP provider supported) and the
 * human-approved draft delivery pipeline.
 *
 * Guarantees:
 *  - Passwords are AES-256-GCM encrypted at rest (lib/crypto vault) and are
 *    NEVER returned in any payload — projections below omit passwordEnc.
 *  - Nothing auto-sends: a draft must be APPROVED by a human manager and
 *    SCHEDULED (future or due) before the cron tick delivers it; "send now"
 *    is itself a manager decision on an APPROVED draft.
 *  - Sends are claimed atomically (status → SENDING) so concurrent ticks can
 *    never double-deliver; every outcome lands in the audit log.
 */

const MAX_CONNECTIONS_PER_WORKSPACE = 10;
const MAX_SEND_ATTEMPTS = 3;
const TICK_BATCH = 25;

type ConnectionRow = {
  id: string; workspaceId: string; provider: string; label: string;
  senderName: string | null; senderEmail: string;
  smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUsername: string | null;
  region: string | null; status: string; isDefault: boolean;
  lastVerifiedAt: Date | null; lastError: string | null;
  createdAt: Date; updatedAt: Date;
};

const SAFE_SELECT = {
  id: true, workspaceId: true, provider: true, label: true,
  senderName: true, senderEmail: true,
  smtpHost: true, smtpPort: true, smtpSecure: true, smtpUsername: true,
  region: true, status: true, isDefault: true,
  lastVerifiedAt: true, lastError: true, createdAt: true, updatedAt: true,
} as const;

export async function listConnections(workspaceId: string): Promise<ConnectionRow[]> {
  return db.emailConnection.findMany({
    where: { workspaceId },
    select: SAFE_SELECT,
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

export async function createConnection(
  workspaceId: string,
  actorId: string | null,
  input: EmailConnectionCreateInput
): Promise<ConnectionRow> {
  const count = await db.emailConnection.count({ where: { workspaceId } });
  if (count >= MAX_CONNECTIONS_PER_WORKSPACE) {
    throw new SalesError("validation", `A workspace can connect at most ${MAX_CONNECTIONS_PER_WORKSPACE} email identities.`);
  }
  const existing = await db.emailConnection.findUnique({
    where: { workspaceId_senderEmail: { workspaceId, senderEmail: input.senderEmail } },
  });
  if (existing) {
    throw new SalesError("conflict", `${input.senderEmail} is already connected to this workspace.`, { connectionId: existing.id });
  }

  const connection = await db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.emailConnection.updateMany({ where: { workspaceId }, data: { isDefault: false } });
    }
    return tx.emailConnection.create({
      data: {
        workspaceId,
        provider: input.provider,
        label: input.label,
        senderName: input.senderName ?? null,
        senderEmail: input.senderEmail,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        smtpUsername: input.smtpUsername ?? null,
        passwordEnc: input.password ? encryptSecret(input.password) : null,
        region: input.region ?? null,
        isDefault: input.isDefault || count === 0, // first connection becomes the default
      },
      select: SAFE_SELECT,
    });
  });

  await audit({
    workspaceId, actorId,
    action: "sales.email.connection.create",
    targetType: "email_connection", targetId: connection.id,
    metadata: { provider: connection.provider, senderEmail: connection.senderEmail, host: connection.smtpHost },
  });
  return connection;
}

export async function updateConnection(
  workspaceId: string,
  actorId: string | null,
  id: string,
  patch: EmailConnectionUpdateInput
): Promise<ConnectionRow> {
  const current = await db.emailConnection.findFirst({ where: { id, workspaceId } });
  if (!current) throw new SalesError("not_found", "Email connection not found.", { connectionId: id });

  // Any change to the transport forces re-verification — never trust a
  // mutated endpoint with the old VERIFIED stamp.
  const transportChanged =
    (patch.smtpHost !== undefined && patch.smtpHost !== current.smtpHost) ||
    (patch.smtpPort !== undefined && patch.smtpPort !== current.smtpPort) ||
    (patch.smtpSecure !== undefined && patch.smtpSecure !== current.smtpSecure) ||
    (patch.smtpUsername !== undefined && (patch.smtpUsername ?? null) !== current.smtpUsername) ||
    patch.password != null;

  const connection = await db.$transaction(async (tx) => {
    if (patch.isDefault) {
      await tx.emailConnection.updateMany({ where: { workspaceId, id: { not: id } }, data: { isDefault: false } });
    }
    return tx.emailConnection.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.senderName !== undefined ? { senderName: patch.senderName ?? null } : {}),
        ...(patch.smtpHost !== undefined ? { smtpHost: patch.smtpHost } : {}),
        ...(patch.smtpPort !== undefined ? { smtpPort: patch.smtpPort } : {}),
        ...(patch.smtpSecure !== undefined ? { smtpSecure: patch.smtpSecure } : {}),
        ...(patch.smtpUsername !== undefined ? { smtpUsername: patch.smtpUsername ?? null } : {}),
        ...(patch.password != null ? { passwordEnc: encryptSecret(patch.password) } : {}),
        ...(patch.region !== undefined ? { region: patch.region ?? null } : {}),
        ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
        ...(transportChanged ? { status: "UNVERIFIED" as const, lastError: null } : {}),
      },
      select: SAFE_SELECT,
    });
  });

  await audit({
    workspaceId, actorId,
    action: "sales.email.connection.update",
    targetType: "email_connection", targetId: id,
    metadata: { transportChanged, isDefault: connection.isDefault },
  });
  return connection;
}

export async function deleteConnection(
  workspaceId: string,
  actorId: string | null,
  id: string
): Promise<void> {
  const current = await db.emailConnection.findFirst({ where: { id, workspaceId } });
  if (!current) throw new SalesError("not_found", "Email connection not found.", { connectionId: id });
  await db.emailConnection.delete({ where: { id } });
  await audit({
    workspaceId, actorId,
    action: "sales.email.connection.delete",
    targetType: "email_connection", targetId: id,
    metadata: { senderEmail: current.senderEmail, provider: current.provider },
  });
}

export interface VerifyResult {
  status: "VERIFIED" | "FAILED";
  handshake: boolean;
  testMessageId?: string | null;
  error?: string;
}

/** Handshake (+ optional real test email). Outcome stamped on the connection. */
export async function verifyConnection(
  workspaceId: string,
  actorId: string | null,
  id: string,
  opts?: { testTo?: string }
): Promise<VerifyResult> {
  const connection = await db.emailConnection.findFirst({ where: { id, workspaceId } });
  if (!connection) throw new SalesError("not_found", "Email connection not found.", { connectionId: id });

  const endpoint = decryptEndpoint(connection);
  let result: VerifyResult;
  try {
    await verifySmtp(endpoint);
    result = { status: "VERIFIED", handshake: true };

    if (opts?.testTo) {
      const subject = "MoniClaw email connection check";
      const html = `<p>This test email confirms that <strong>${escapeHtml(connection.senderEmail)}</strong> can send through <strong>${escapeHtml(connection.smtpHost)}</strong> from MoniClaw.</p><p>No action needed — drafts you approve in MoniClaw will be delivered through this connection.</p>`;
      const sent = await sendSmtp(endpoint, {
        from: formatFrom(connection.senderName, connection.senderEmail),
        to: opts.testTo,
        subject,
        html,
        text: htmlToText(html),
      });
      result.testMessageId = sent.messageId;
      if (sent.rejected.length) {
        throw new Error(`Provider rejected the recipient: ${sent.rejected.join(", ")}`);
      }
    }
  } catch (err) {
    result = { status: "FAILED", handshake: false, error: clip(err) };
  }

  await db.emailConnection.update({
    where: { id },
    data: {
      status: result.status,
      lastVerifiedAt: result.status === "VERIFIED" ? new Date() : null,
      lastError: result.error ?? null,
    },
  });
  await audit({
    workspaceId, actorId,
    action: result.status === "VERIFIED" ? "sales.email.connection.verified" : "sales.email.connection.failed",
    targetType: "email_connection", targetId: id,
    metadata: {
      testTo: opts?.testTo ?? null,
      ...(result.error ? { error: result.error } : {}),
    },
  });
  return result;
}

// ── Draft delivery pipeline ───────────────────────────────────────────────

export interface SendDraftResult {
  draftId: string;
  status: "SENT" | "SCHEDULED" | "FAILED";
  messageId?: string | null;
  attempts: number;
  error?: string;
}

/**
 * Deliver one draft through a connected identity.
 * Caller decides policy (manager approval happened upstream); this function
 * enforces the mechanics: EMAIL channel, recipient present, atomic claim,
 * never resend a SENT draft, max attempts, honest error recording.
 */
export async function sendDraft(
  workspaceId: string,
  actorId: string | null,
  draftId: string,
  opts?: { connectionId?: string }
): Promise<SendDraftResult> {
  const draft = await db.salesDraft.findFirst({
    where: { id: draftId, workspaceId },
    include: { contact: { select: { id: true, email: true, name: true } } },
  });
  if (!draft || draft.deletedAt) {
    throw new SalesError("not_found", "Draft not found.", { draftId });
  }
  if (draft.channel !== "EMAIL") {
    throw new SalesError("validation", `Only EMAIL drafts can be sent (this is a ${draft.channel} draft).`);
  }
  const claimable = ["APPROVED", "SCHEDULED", "FAILED"] as const;
  if (draft.status === "SENT") throw new SalesError("conflict", "This draft was already sent.");
  if (draft.status === "SENDING") throw new SalesError("conflict", "A send is already in progress for this draft.");
  if (!(claimable as readonly string[]).includes(draft.status)) {
    throw new SalesError("conflict", `A ${draft.status} draft cannot be sent — it must be approved first.`);
  }
  const recipient = draft.contact?.email ?? null;
  if (!recipient) {
    throw new SalesError("validation", "The draft's contact has no email address — cannot send.");
  }
  // Opt-out is tracked per enrollment; ANY unsubscribed enrollment on this
  // contact blocks every future email to them, campaign or manual.
  const optedOut = await db.salesCampaignEnrollment.findFirst({
    where: { contactId: draft.contact!.id, status: "UNSUBSCRIBED", campaign: { workspaceId } },
    select: { id: true },
  });
  if (optedOut) {
    throw new SalesError("conflict", "The contact opted out of outreach — this email must not be sent.");
  }

  // Atomic claim: exactly one winner among concurrent tick/manual sends.
  const claimed = await db.salesDraft.updateMany({
    where: { id: draft.id, status: { in: [...claimable] } },
    data: { status: "SENDING", sendAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    throw new SalesError("conflict", "The draft changed state — retry in a moment.");
  }
  const attempts = draft.sendAttempts + 1;
  await audit({
    workspaceId, actorId,
    action: "sales.draft.send.requested",
    targetType: "sales_draft", targetId: draft.id,
    metadata: { attempt: attempts, connectionId: opts?.connectionId ?? "default" },
  });

  try {
    const connection = await resolveConnection(workspaceId, opts?.connectionId);
    const subject = (draft.subject ?? "").trim() || "(no subject)";
    const bodyHtml = looksLikeHtml(draft.body)
      ? draft.body
      : `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#18181b">${escapeHtml(draft.body)
          .split(/\n{2,}/)
          .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
          .join("")}</div>`;
    const sent = await sendSmtp(decryptEndpoint(connection), {
      from: formatFrom(connection.senderName, connection.senderEmail),
      to: recipient,
      subject,
      html: bodyHtml,
      text: looksLikeHtml(draft.body) ? htmlToText(draft.body) : draft.body,
    });
    if (sent.rejected.length) {
      throw new Error(`Provider rejected the recipient: ${sent.rejected.join(", ")}`);
    }

    await db.$transaction([
      db.salesDraft.update({
        where: { id: draft.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: sent.messageId,
          deliveryStatus: "PENDING",
          sendError: null,
          emailConnectionId: connection.id,
        },
      }),
      // A successful live send is stronger proof than a handshake.
      db.emailConnection.update({
        where: { id: connection.id },
        data: { status: "VERIFIED", lastVerifiedAt: new Date(), lastError: null },
      }),
      // Touch the contact and advance NEW → CONTACTED (never downgrade an
      // engaged/qualified pipeline stage).
      db.salesContact.updateMany({
        where: { id: draft.contact!.id, status: "NEW" },
        data: { lastTouchedAt: new Date(), status: "CONTACTED" },
      }),
      db.salesContact.updateMany({
        where: { id: draft.contact!.id, status: { not: "NEW" } },
        data: { lastTouchedAt: new Date() },
      }),
    ]);
    await audit({
      workspaceId, actorId,
      action: "sales.draft.sent",
      targetType: "sales_draft", targetId: draft.id,
      metadata: { to: recipient, messageId: sent.messageId, connectionId: connection.id },
    });
    return { draftId: draft.id, status: "SENT", messageId: sent.messageId, attempts };
  } catch (err) {
    const message = clip(err);
    const terminal = attempts >= MAX_SEND_ATTEMPTS;
    await db.salesDraft.update({
      where: { id: draft.id },
      data: {
        status: terminal ? "FAILED" : "SCHEDULED", // retry on the next tick
        sendError: message,
        deliveryStatus: "UNKNOWN",
      },
    });
    await audit({
      workspaceId, actorId,
      action: "sales.draft.send_failed",
      targetType: "sales_draft", targetId: draft.id,
      metadata: { attempt: attempts, terminal, error: message },
    });
    return { draftId: draft.id, status: terminal ? "FAILED" : "SCHEDULED", attempts, error: message };
  }
}

/** Cron path — deliver every due SCHEDULED draft across workspaces. */
export async function sendDueDrafts(now = new Date(), take = TICK_BATCH): Promise<{
  processed: number; sent: number; failed: number; retried: number;
}> {
  const due = await db.salesDraft.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
      deletedAt: null,
      channel: "EMAIL",
    },
    select: { id: true, workspaceId: true },
    orderBy: { scheduledAt: "asc" },
    take,
  });
  let sent = 0, failed = 0, retried = 0;
  for (const d of due) {
    try {
      const result = await sendDraft(d.workspaceId, null, d.id);
      if (result.status === "SENT") sent += 1;
      else if (result.status === "FAILED") failed += 1;
      else retried += 1;
    } catch (err) {
      // Claim race lost or draft vanished — not a delivery failure.
      console.warn(`[email] tick skipped draft ${d.id}:`, (err as Error).message);
    }
  }
  return { processed: due.length, sent, failed, retried };
}

// ── internals ─────────────────────────────────────────────────────────────

async function resolveConnection(workspaceId: string, connectionId?: string) {
  const connection = connectionId
    ? await db.emailConnection.findFirst({ where: { id: connectionId, workspaceId } })
    : await db.emailConnection.findFirst({ where: { workspaceId, isDefault: true } });
  if (!connection) {
    throw new SalesError(
      "validation",
      connectionId
        ? "That email connection does not exist in this workspace."
        : "No email connection is configured — connect Amazon SES or any SMTP account in Sales → Settings first."
    );
  }
  if (connection.status === "FAILED") {
    throw new SalesError(
      "validation",
      `The "${connection.label}" connection failed verification (${connection.lastError ?? "unknown"}) — fix or re-verify it before sending.`
    );
  }
  return connection;
}

function decryptEndpoint(connection: {
  smtpHost: string; smtpPort: number; smtpSecure: boolean;
  smtpUsername: string | null; passwordEnc: string | null;
}) {
  return {
    host: connection.smtpHost,
    port: connection.smtpPort,
    secure: connection.smtpSecure,
    username: connection.smtpUsername,
    password: connection.passwordEnc ? decryptSecret(connection.passwordEnc) : null,
  };
}

function looksLikeHtml(body: string): boolean {
  return /<\s*(p|div|br|span|table|a|strong|em|h[1-6]|ul|ol|li)(\s|>|\/)/i.test(body);
}

function clip(err: unknown, max = 480): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > max ? `${message.slice(0, max)}…` : message;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

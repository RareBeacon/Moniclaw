import nodemailer from "nodemailer";

/**
 * Transactional email transport.
 *
 * Production: set RESEND_API_KEY + EMAIL_FROM (Resend HTTP API — no SMTP
 * dependencies). Development without a key: links are printed to the server
 * console so flows stay fully testable.
 */

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

const FROM = process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? "MoniClaw <no-reply@moniclaw.com>";

export async function sendEmail(message: EmailMessage): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (smtpHost && smtpUser && smtpPassword) {
    const port = Number(process.env.SMTP_PORT ?? "587");
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: smtpUser, pass: smtpPassword },
      requireTLS: !Boolean(process.env.SMTP_SECURE === "true") && port === 587,
    });
    await transport.sendMail({ from: FROM, to: message.to, subject: message.subject, html: message.html });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `\n[mail:dev] To: ${message.to}\n[mail:dev] Subject: ${message.subject}\n${stripHtml(message.html)}\n`
      );
    }
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email delivery failed (${res.status}): ${body}`);
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#18181b">
    <div style="font-weight:700;font-size:18px">Moni<span style="color:#7c5cff">Claw</span></div>
    <h1 style="font-size:20px;margin:28px 0 8px">${title}</h1>
    ${bodyHtml}
    <p style="margin-top:40px;font-size:12px;color:#71717a">
      MoniClaw, Inc. · 548 Market St, Suite 62089, San Francisco, CA 94104
    </p>
  </div>`;
}

const BUTTON =
  "display:inline-block;background:#6d4ff2;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px";

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${appUrl()}/verify-email/confirm?email=${encodeURIComponent(
    email
  )}&token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Verify your MoniClaw email",
    html: emailShell(
      "Confirm your email",
      `<p style="font-size:14px;line-height:22px;color:#3f3f46">Welcome aboard. Confirm this address to activate your workspace — the link expires in 30 minutes.</p>
       <p style="margin:24px 0"><a href="${url}" style="${BUTTON}">Verify email address</a></p>
       <p style="font-size:12px;color:#71717a;word-break:break-all">Or paste this link: ${url}</p>
       <p style="font-size:12px;color:#71717a">If you didn't create a MoniClaw account, you can ignore this email.</p>`
    ),
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${appUrl()}/forgot-password/confirm?email=${encodeURIComponent(
    email
  )}&token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Reset your MoniClaw password",
    html: emailShell(
      "Reset your password",
      `<p style="font-size:14px;line-height:22px;color:#3f3f46">We received a request to reset the password for this account. The link expires in 30 minutes.</p>
       <p style="margin:24px 0"><a href="${url}" style="${BUTTON}">Choose a new password</a></p>
       <p style="font-size:12px;color:#71717a;word-break:break-all">Or paste this link: ${url}</p>
       <p style="font-size:12px;color:#71717a">Didn't request this? Nothing changed — you can safely ignore this email.</p>`
    ),
  });
}

export async function sendWorkspaceInvitationEmail({
  email,
  token,
  workspaceName,
  inviterName,
  role,
}: {
  email: string;
  token: string;
  workspaceName: string;
  inviterName: string;
  role: string;
}) {
  const url = `${appUrl()}/invite/${token}`;
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase();
  await sendEmail({
    to: email,
    subject: `${inviterName} invited you to ${workspaceName} on MoniClaw`,
    html: emailShell(
      "You're invited",
      `<p style="font-size:14px;line-height:22px;color:#3f3f46">
         <strong>${escapeHtml(inviterName)}</strong> invited you to join
         <strong>${escapeHtml(workspaceName)}</strong> as ${roleLabel}.
         The invitation expires in 7 days.
       </p>
       <p style="margin:24px 0"><a href="${url}" style="${BUTTON}">Accept invitation</a></p>
       <p style="font-size:12px;color:#71717a;word-break:break-all">Or paste this link: ${url}</p>
       <p style="font-size:12px;color:#71717a">
         New to MoniClaw? The link walks you through creating your account with this email —
         the invitation will be waiting.
       </p>`
    ),
  });
}

/** Passwordless sign-in — transport ready for the magic-link milestone. */
export async function sendMagicLinkEmail(email: string, token: string) {
  const url = `${appUrl()}/login/magic?email=${encodeURIComponent(
    email
  )}&token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: email,
    subject: "Your MoniClaw sign-in link",
    html: emailShell(
      "Sign in to MoniClaw",
      `<p style="font-size:14px;line-height:22px;color:#3f3f46">Here's your one-time sign-in link. It expires in 30 minutes and works once.</p>
       <p style="margin:24px 0"><a href="${url}" style="${BUTTON}">Sign in</a></p>
       <p style="font-size:12px;color:#71717a;word-break:break-all">Or paste this link: ${url}</p>
       <p style="font-size:12px;color:#71717a">Didn't request this? You can ignore it — the link only works for this inbox.</p>`
    ),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

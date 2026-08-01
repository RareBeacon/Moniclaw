import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport layer for workspace-connected email identities (Phase 6).
 *
 * One provider mechanism — SMTP — covers Amazon SES (SMTP endpoint per
 * region), Gmail/Google Workspace, Outlook/365 and any business-mail relay.
 * Amazon SES is first-class via UI presets (host per region, :587 STARTTLS);
 * nothing here is SES-specific.
 *
 * Timeouts are hard: a mis-typed host must fail fast and HONESTLY (recorded
 * on the connection + draft), never hang a serverless function.
 */

export interface SmtpEndpoint {
  host: string;
  port: number;
  /** true = implicit TLS (:465); false = STARTTLS if offered (:587). */
  secure: boolean;
  username?: string | null;
  /** Decrypted password — lives only inside the send/verify call. */
  password?: string | null;
}

export interface OutboundMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
const GREETING_TIMEOUT_MS = 10_000;

export function createSmtpTransport(endpoint: SmtpEndpoint): Transporter {
  const hasAuth = Boolean(endpoint.username && endpoint.password);
  const options: import("nodemailer/lib/smtp-transport").Options = {
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.secure,
    ...(hasAuth
      ? { auth: { user: endpoint.username as string, pass: endpoint.password as string } }
      : {}),
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    // Self-signed certs on private relays are the operator's choice; public
    // providers present valid chains. Localhost sinks in tests need this.
    tls: { servername: endpoint.host, rejectUnauthorized: !isLoopback(endpoint.host) },
  };
  return nodemailer.createTransport(options);
}

function isLoopback(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".internal");
}

/** Protocol-level handshake: connect (+ STARTTLS + AUTH); sends nothing. */
export async function verifySmtp(endpoint: SmtpEndpoint): Promise<void> {
  const transport = createSmtpTransport(endpoint);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export interface SendResult {
  messageId: string | null;
  accepted: string[];
  rejected: string[];
}

/** Deliver one message. Throws with the provider's own reason on failure. */
export async function sendSmtp(
  endpoint: SmtpEndpoint,
  mail: OutboundMail
): Promise<SendResult> {
  const transport = createSmtpTransport(endpoint);
  try {
    const info = await transport.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    return {
      messageId: info.messageId ?? null,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  } finally {
    transport.close();
  }
}

/** Plain-text fallback derived from the HTML body (never sent HTML alone). */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Format the RFC-5322 From header from a connection's identity. */
export function formatFrom(senderName: string | null, senderEmail: string): string {
  if (!senderName) return senderEmail;
  // Quote names containing specials; strip CR/LF against header injection.
  const safe = senderName.replace(/[\r\n<>"]/g, "").trim();
  if (!safe) return senderEmail;
  return /[,;@()]/.test(safe) ? `"${safe.replace(/"/g, "")}" <${senderEmail}>` : `${safe} <${senderEmail}>`;
}

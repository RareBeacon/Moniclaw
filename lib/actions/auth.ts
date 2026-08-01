"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/http";
import { audit } from "@/lib/audit";
import { safeEqual } from "@/lib/crypto";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/mail";
import { slugify, uniqueSuffix } from "@/lib/slug";
import {
  credentialsSchema,
  emailSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";

export type AuthFormState = {
  error?: string;
  ok?: boolean;
};

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function issueToken(): string {
  return randomBytes(32).toString("hex");
}

async function createToken(kind: "verify" | "reset" | "magic", email: string) {
  await db.verificationToken.deleteMany({
    where: { identifier: `${kind}:${email}` },
  });
  const token = issueToken();
  await db.verificationToken.create({
    data: {
      identifier: `${kind}:${email}`,
      token,
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return token;
}

async function consumeToken(kind: "verify" | "reset" | "magic", email: string, token: string) {
  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier: `${kind}:${email}`, token } },
  });
  if (!record || record.expires < new Date()) {
    if (record) {
      await db.verificationToken.delete({
        where: { identifier_token: { identifier: `${kind}:${email}`, token } },
      });
    }
    return false;
  }
  await db.verificationToken.delete({
    where: { identifier_token: { identifier: `${kind}:${email}`, token } },
  });
  return true;
}

// ── Sign in (credentials) ────────────────────────────────────────────

export async function authenticate(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const ip = clientIp() ?? "unknown";
  const key = `login:${ip}:${parsed.data.email}`;
  const gate = rateLimit(key, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
  if (!gate.success) {
    return {
      error: `Too many sign-in attempts. Try again in ${gate.retryAfterSeconds}s.`,
    };
  }

  const next = (formData.get("next") as string) || "/dashboard";
  const remember = formData.get("remember") === "true";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      remember: String(remember),
      redirectTo: next.startsWith("/") ? next : "/dashboard",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // NEXT_REDIRECT on success must propagate
  }
}

export async function authenticateOAuth(provider: "google" | "github") {
  await signIn(provider, { redirectTo: "/dashboard" });
}

// ── Registration + email verification ────────────────────────────────

export async function register(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const ip = clientIp() ?? "unknown";
  const gate = rateLimit(`register:${ip}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs);
  if (!gate.success) {
    return { error: `Too many accounts created from this network. Try again in ${gate.retryAfterSeconds}s.` };
  }

  // Private-launch gate (Phase-6 release: "only us"). When
  // AUTH_REGISTRATION_CODE is configured, every new account must present the
  // shared access code — constant-time compared, checked before ANY work so
  // nothing about existing accounts is observable. Leave unset for open
  // registration (development default).
  const requiredCode = process.env.AUTH_REGISTRATION_CODE;
  if (requiredCode) {
    const provided = String(formData.get("accessCode") ?? "").trim();
    if (!provided || !safeEqual(provided, requiredCode)) {
      return { error: "MoniClaw is in private launch — enter the access code you were given." };
    }
  }

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists. Try signing in." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const baseSlug = slugify(name) || "workspace";
  const workspaceSlug = `${baseSlug}-${uniqueSuffix()}`;

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      memberships: {
        create: {
          role: "OWNER",
          workspace: {
            create: {
              name: `${name.split(" ")[0]}'s Workspace`,
              slug: workspaceSlug,
            },
          },
        },
      },
    },
  });

  const token = await createToken("verify", email);
  await sendVerificationEmail(email, token);

  return { ok: true };
}

export async function resendVerification(email: string): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };

  const ip = clientIp() ?? "unknown";
  const gate = rateLimit(
    `resend:${ip}:${parsed.data}`,
    RATE_LIMITS.resendVerify.limit,
    RATE_LIMITS.resendVerify.windowMs
  );
  if (!gate.success) {
    return { error: `Too many verification emails requested. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data } });
  // Don't leak account existence; behave as though we sent it.
  if (user && !user.emailVerified && !user.deletedAt) {
    const token = await createToken("verify", parsed.data);
    await sendVerificationEmail(parsed.data, token);
  }
  return { ok: true };
}

export async function verifyEmail(email: string, token: string): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success || token.length < 10) {
    return { error: "This verification link is invalid." };
  }

  const valid = await consumeToken("verify", parsed.data, token);
  if (!valid) {
    return { error: "This link is invalid or has expired. Request a new one." };
  }

  await db.user.update({
    where: { email: parsed.data },
    data: { emailVerified: new Date() },
  });
  return { ok: true };
}

// ── Password reset ───────────────────────────────────────────────────

export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter the email you registered with." };

  const ip = clientIp() ?? "unknown";
  const gate = rateLimit(
    `reset:${ip}:${parsed.data}`,
    RATE_LIMITS.reset.limit,
    RATE_LIMITS.reset.windowMs
  );
  if (!gate.success) {
    return { error: `Too many reset emails requested. Try again in ${gate.retryAfterSeconds}s.` };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (user && !user.deletedAt) {
    const token = await createToken("reset", parsed.data);
    await sendPasswordResetEmail(parsed.data, token);
  }
  // Always succeed — never reveal whether an account exists.
  return { ok: true };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    email: formData.get("email"),
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your inputs." };
  }

  const { email, token, password } = parsed.data;

  const valid = await consumeToken("reset", email, token);
  if (!valid) {
    return { error: "This reset link is invalid or has expired. Start over." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.update({
    where: { email },
    data: {
      passwordHash,
      // Compromised-password assumption: invalidate every live session.
      sessionVersion: { increment: 1 },
    },
  });

  redirect("/login?reset=1");
}

// ── Magic link (passwordless, provider-ready) ────────────────────────
// Transport + token storage are live today; the sign-in surface ships with
// the passwordless milestone. Kept server-only to avoid premature exposure.
export async function issueMagicLinkToken(email: string) {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return null;
  return createToken("magic", parsed.data);
}

export async function auditUserEvent(entry: Parameters<typeof audit>[0]) {
  await audit(entry);
}

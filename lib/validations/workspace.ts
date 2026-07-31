import { z } from "zod";

import { emailSchema, passwordSchema } from "./auth";

// ── Agent ─────────────────────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().trim().min(2, "Give the agent a name.").max(60),
  category: z.string().trim().max(40).optional(),
  description: z
    .string()
    .trim()
    .min(30, "A useful job description needs at least a couple of sentences (30+ characters).")
    .max(2000),
  trigger: z.enum(["MANUAL", "SCHEDULE", "WEBHOOK"]),
  schedule: z.string().trim().max(60).optional(),
  // Phase 5 worker fields (optional at hire-time; editable later).
  workerType: z.enum(["general", "research", "ops"]).default("general"),
  goal: z.string().trim().max(4000).optional(),
  instructions: z.string().trim().max(4000).optional(),
});

export const agentStatusSchema = z.enum([
  "SHADOW",
  "SUPERVISED",
  "AUTONOMOUS",
  "PAUSED",
]);

// ── Members & invitations ─────────────────────────────────────────────

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER"]),
});

export const memberRoleSchema = z.enum(["ADMIN", "MANAGER", "MEMBER", "VIEWER"]);

// ── Workspace settings ────────────────────────────────────────────────

export const BRAND_COLORS = [
  "violet",
  "indigo",
  "blue",
  "emerald",
  "amber",
  "rose",
] as const;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Slugs must be at least 3 characters.")
  .max(40)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Lowercase letters, numbers, and hyphens only — no leading/trailing hyphen."
  );

export const workspaceSettingsSchema = z.object({
  name: z.string().trim().min(2, "Workspace names must be 2–60 characters.").max(60),
  slug: slugSchema,
  brandColor: z.enum(BRAND_COLORS),
});

export const deleteWorkspaceSchema = z.object({
  confirmSlug: slugSchema,
});

// ── Knowledge ─────────────────────────────────────────────────────────

export const knowledgeSchema = z.object({
  title: z.string().trim().min(3, "Give the entry a title.").max(120),
  body: z
    .string()
    .trim()
    .min(20, "Knowledge entries need at least 20 characters to be useful.")
    .max(20_000),
  tags: z
    .string()
    .trim()
    .max(200)
    .transform((value) =>
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8)
    ),
});

// ── User profile ──────────────────────────────────────────────────────

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Your full name, please.").max(80),
});

export const updateEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Confirm with your password."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must differ from the current one.",
    path: ["newPassword"],
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Confirm with your password."),
});

// ── Avatar upload constraints (shared by client + server) ─────────────
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const EXPORT_MAX_BYTES = 512 * 1024;

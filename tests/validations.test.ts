import { test } from "node:test";
import assert from "node:assert/strict";

import {
  credentialsSchema,
  registerSchema,
  resetPasswordSchema,
} from "../lib/validations/auth";
import {
  createAgentSchema,
  inviteSchema,
  knowledgeSchema,
  workspaceSettingsSchema,
  changePasswordSchema,
} from "../lib/validations/workspace";
import { slugify } from "../lib/slug";

test("registerSchema normalizes email and enforces password policy", () => {
  const ok = registerSchema.safeParse({
    name: "Ada Lovelace",
    email: "  ADA@COMPANY.COM ",
    password: "correct horse battery",
  });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.email, "ada@company.com");

  assert.equal(
    registerSchema.safeParse({ name: "A", email: "a@b.co", password: "longenough" }).success,
    false
  );
  assert.equal(
    registerSchema.safeParse({ name: "Ada Lovelace", email: "a@b.co", password: "short" }).success,
    false
  );
});

test("credentialsSchema requires both fields", () => {
  assert.equal(credentialsSchema.safeParse({ email: "a@b.co", password: "" }).success, false);
  assert.equal(credentialsSchema.safeParse({ email: "a@b.co", password: "x" }).success, true);
});

test("resetPasswordSchema rejects weak passwords", () => {
  assert.equal(
    resetPasswordSchema.safeParse({ email: "a@b.co", token: "x".repeat(20), password: "1234567" })
      .success,
    false
  );
});

test("createAgentSchema enforces a meaningful job description", () => {
  assert.equal(
    createAgentSchema.safeParse({ name: "Mara", description: "too short", trigger: "MANUAL" })
      .success,
    false
  );
  assert.equal(
    createAgentSchema.safeParse({
      name: "Mara",
      description: "Reconcile weekly Stripe payouts against NetSuite and flag variance over $25.",
      trigger: "MANUAL",
    }).success,
    true
  );
});

test("knowledgeSchema parses and caps tags", () => {
  const result = knowledgeSchema.safeParse({
    title: "Refund policy",
    body: "Auto-approve refunds up to $50; escalate above.",
    tags: " Finance, Refunds, finance,  ",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.tags, ["finance", "refunds", "finance"]);
  }
});

test("workspaceSettingsSchema validates slug grammar", () => {
  for (const slug of ["acme-co", "demo1", "a1b2c3"]) {
    assert.equal(
      workspaceSettingsSchema.safeParse({ name: "Acme", slug, brandColor: "violet" }).success,
      true,
      slug
    );
  }
  // Uppercase input is coerced to lowercase by design.
  const coerced = workspaceSettingsSchema.safeParse({
    name: "Acme",
    slug: "Acme-Co",
    brandColor: "violet",
  });
  assert.equal(coerced.success, true);
  if (coerced.success) assert.equal(coerced.data.slug, "acme-co");

  for (const slug of ["-acme", "acme-", "ac me", "ab"]) {
    assert.equal(
      workspaceSettingsSchema.safeParse({ name: "Acme", slug, brandColor: "violet" }).success,
      false,
      slug
    );
  }
});

test("inviteSchema never allows inviting as OWNER", () => {
  assert.equal(inviteSchema.safeParse({ email: "a@b.co", role: "OWNER" }).success, false);
  assert.equal(inviteSchema.safeParse({ email: "a@b.co", role: "ADMIN" }).success, true);
});

test("changePasswordSchema enforces match and rotation", () => {
  assert.equal(
    changePasswordSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "old-password",
      confirmPassword: "old-password",
    }).success,
    false
  );
  assert.equal(
    changePasswordSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-password-1",
      confirmPassword: "different-1",
    }).success,
    false
  );
  assert.equal(
    changePasswordSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-password-1",
      confirmPassword: "new-password-1",
    }).success,
    true
  );
});

test("slugify produces URL-safe slugs", () => {
  assert.equal(slugify("Mara — AR reconciler"), "mara-ar-reconciler");
  assert.equal(slugify("  Demo Logistics Co. "), "demo-logistics-co");
  assert.equal(slugify("O'Hara's Workspace"), "oharas-workspace");
  assert.equal(slugify("---"), "");
});

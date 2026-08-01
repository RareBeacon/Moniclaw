import test from "node:test";
import assert from "node:assert/strict";

import {
  SMTP_PRESETS,
  emailConnectionCreateApiSchema,
} from "../lib/validations/sales";

/**
 * M2 — Gmail/business-mail presets: one SMTP code path, preset guidance on
 * top, and hard validation of endpoint combinations that can never work.
 */

const base = {
  provider: "SMTP" as const,
  label: "Founder mail",
  senderEmail: "ada@gmail.com",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUsername: "ada@gmail.com",
  password: "app-password-16",
  isDefault: false,
};

test("SMTP presets catalog: gmail/outlook/zoho with the endpoints those vendors actually serve", () => {
  const gmail = SMTP_PRESETS.find((p) => p.id === "gmail")!;
  assert.equal(gmail.host, "smtp.gmail.com");
  assert.equal(gmail.port, 465);
  assert.equal(gmail.secure, true);
  assert.match(gmail.hint, /App Password/);

  const outlook = SMTP_PRESETS.find((p) => p.id === "outlook")!;
  assert.equal(outlook.host, "smtp.office365.com");
  assert.equal(outlook.port, 587);
  assert.equal(outlook.secure, false);

  const zoho = SMTP_PRESETS.find((p) => p.id === "zoho")!;
  assert.equal(zoho.host, "smtp.zoho.com");
  assert.equal(zoho.port, 465);
});

test("gmail over :465 SSL validates", () => {
  const parsed = emailConnectionCreateApiSchema.safeParse(base);
  assert.equal(parsed.success, true, JSON.stringify(parsed.success ? {} : parsed.error.issues));
});

test("gmail over :587 STARTTLS also validates", () => {
  const parsed = emailConnectionCreateApiSchema.safeParse({ ...base, smtpPort: 587, smtpSecure: false });
  assert.equal(parsed.success, true);
});

test("gmail with an impossible port/secure combo is refused with the exact fix", () => {
  const parsed = emailConnectionCreateApiSchema.safeParse({ ...base, smtpPort: 25, smtpSecure: true });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path.includes("smtpPort"));
    assert.ok(issue);
    assert.match(issue.message, /smtp\.gmail\.com only accepts port 465 \(SSL\/TLS\) or port 587 \(STARTTLS\)/);
  }
});

test("gmail username must equal the From address (Google rule)", () => {
  const parsed = emailConnectionCreateApiSchema.safeParse({ ...base, smtpUsername: "someone-else@gmail.com" });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues.map((i) => i.message).join(" "), /Gmail's SMTP username is the Gmail address/);
  }
});

test("outlook on :465 is refused; unknown business hosts accept any port", () => {
  const badOutlook = emailConnectionCreateApiSchema.safeParse({
    ...base, smtpHost: "smtp.office365.com", smtpPort: 465, smtpSecure: true, smtpUsername: "ada@contoso.com",
  });
  assert.equal(badOutlook.success, false);

  const business = emailConnectionCreateApiSchema.safeParse({
    ...base, smtpHost: "mail.contoso.com", smtpPort: 2525, smtpSecure: false, smtpUsername: "ada@contoso.com",
  });
  assert.equal(business.success, true);
});

test("SES path unaffected by the SMTP presets checks", () => {
  const ses = emailConnectionCreateApiSchema.safeParse({
    provider: "AMAZON_SES",
    label: "SES eu-west",
    senderEmail: "ops@moniclaw.com",
    smtpHost: "email-smtp.eu-west-1.amazonaws.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUsername: "AKIAEXAMPLE",
    password: "secret",
    region: "eu-west-1",
  });
  assert.equal(ses.success, true);
});

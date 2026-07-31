/**
 * Personalization battery — draft context derivation + template rendering
 * over the Phase-3 renderer (unknown placeholders must survive intact).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDraftContext, firstNameOf, renderDraftTemplate,
} from "../packages/sales-runtime/personalization";

const company = {
  name: "Acme Freight", domain: "acme.com", industry: "Logistics",
  summary: "West-African freight API.",
};
const contact = { name: "Ada Okafor", title: "VP Operations", email: "ada@acme.com" };

test("firstNameOf splits on whitespace and degrades safely", () => {
  assert.equal(firstNameOf("Ada Okafor"), "Ada");
  assert.equal(firstNameOf("  Chi   Eze "), "Chi");
  assert.equal(firstNameOf(""), "");
  assert.equal(firstNameOf(null), "");
});

test("buildDraftContext maps every personalization slot", () => {
  const ctx = buildDraftContext(company, contact, { name: "Tunde Sales", title: "AE" }, "Demo Logistics Co");
  assert.equal(ctx.contactFirstName, "Ada");
  assert.equal(ctx.contactEmail, "ada@acme.com");
  assert.equal(ctx.companyName, "Acme Freight");
  assert.equal(ctx.companySummary, "West-African freight API.");
  assert.equal(ctx.senderName, "Tunde Sales");
  assert.equal(ctx.workspaceName, "Demo Logistics Co");
});

test("renderDraftTemplate substitutes known slots in subject + body", () => {
  const ctx = buildDraftContext(company, contact, { name: "Tunde Sales" }, "Demo");
  const rendered = renderDraftTemplate(
    {
      subject: "{{companyName}} × MoniClaw",
      bodyTemplate:
        "Hi {{contactFirstName}},\n\nSaw {{companyName}} runs {{companyIndustry}} ops. {{senderName}} here — quick idea.\n\n— {{senderName}}, {{workspaceName}}",
    },
    ctx
  );
  assert.equal(rendered.subject, "Acme Freight × MoniClaw");
  assert.ok(rendered.body.includes("Hi Ada,"));
  assert.ok(rendered.body.includes("Saw Acme Freight runs Logistics ops"));
  assert.ok(rendered.body.endsWith("— Tunde Sales, Demo"));
  assert.deepEqual(rendered.warnings.filter((w) => !w.startsWith("Supplied")), []);
});

test("unknown placeholders are preserved visibly (never silently blanked)", () => {
  const ctx = buildDraftContext(company, contact, { name: "T" }, "Demo");
  const rendered = renderDraftTemplate(
    { subject: null, bodyTemplate: "Hi {{contactFirstName}}, about {{mutualConnection}}…" },
    ctx
  );
  assert.ok(rendered.body.includes("{{mutualConnection}}"), "unresolved slot stays visible for the reviewer");
  assert.ok(rendered.warnings.some((w) => w.includes("mutualConnection")));
  assert.equal(rendered.subject, null);
});

test("null company/contact degrade to empty strings, not crashes", () => {
  const ctx = buildDraftContext(null, null, { name: null }, "Demo");
  const rendered = renderDraftTemplate({ subject: null, bodyTemplate: "Hi {{contactFirstName}} at {{companyName}}" }, ctx);
  assert.equal(rendered.body, "Hi  at ");
});

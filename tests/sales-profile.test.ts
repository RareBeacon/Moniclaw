/**
 * profileFromReport battery — Phase-5 research report → CompanyProfile mapping:
 * section parsing, social/tech extraction, citation hygiene, honest absence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { profileFromReport } from "../packages/sales-runtime/research/profile";

const REPORT = {
  summary: "Acme Freight is a Lagos-based 3PL serving West African e-commerce.",
  markdown: [
    "# Company Research: Acme Freight",
    "",
    "## Industry",
    "Logistics & supply chain",
    "",
    "## Company size",
    "51-200 employees",
    "",
    "## Geography",
    "Lagos, Nigeria (HQ); Accra, Ghana",
    "",
    "## Business model",
    "B2B subscription logistics with per-shipment fees.",
    "",
    "## Products & services",
    "Same-day delivery, fulfillment, freight forwarding.",
    "",
    "## Target market",
    "Mid-market e-commerce and retail.",
    "",
    "## Tech stack",
    "- Shopify",
    "- Salesforce",
    "- AWS",
    "",
    "## News & recent developments",
    "Raised a Series A in May 2026.",
    "",
    "## Social links",
    "- https://www.linkedin.com/company/acme-freight",
    "- https://x.com/acmefreight",
    "",
    "## Contact pages",
    "https://acme.example.com/contact",
  ].join("\n"),
  citations: [
    { url: "https://acme.example.com/about", title: "About Acme" },
    { url: "not-a-url", title: "garbage" },
    { url: "https://news.example.com/acme-raises", title: "Acme raises" },
  ],
};

test("maps all named sections into structured fields", () => {
  const p = profileFromReport(REPORT);
  assert.equal(p.summary, REPORT.summary);
  assert.equal(p.industry, "Logistics & supply chain");
  assert.equal(p.size, "51-200 employees");
  assert.equal(p.geography, "Lagos, Nigeria (HQ); Accra, Ghana");
  assert.equal(p.businessModel, "B2B subscription logistics with per-shipment fees.");
  assert.equal(p.productsServices, "Same-day delivery, fulfillment, freight forwarding.");
  assert.equal(p.targetMarket, "Mid-market e-commerce and retail.");
});

test("extracts tech stack from bullets, deduped social links by network", () => {
  const p = profileFromReport(REPORT);
  assert.deepEqual(p.techStack, ["Shopify", "Salesforce", "AWS"]);
  assert.deepEqual(p.socialLinks, [
    { type: "linkedin", url: "https://www.linkedin.com/company/acme-freight" },
    { type: "x", url: "https://x.com/acmefreight" },
  ]);
});

test("drops invalid citations, keeps the rest under the cap", () => {
  const p = profileFromReport(REPORT);
  assert.deepEqual(p.sources, [
    { url: "https://acme.example.com/about", title: "About Acme" },
    { url: "https://news.example.com/acme-raises", title: "Acme raises" },
  ]);
});

test("honest absence: missing sections stay undefined, never invented", () => {
  const p = profileFromReport({
    summary: "Sparse report.",
    markdown: "# Only a title\n\nSome prose without any sections.\n",
    citations: [],
  });
  assert.equal(p.summary, "Sparse report.");
  assert.equal(p.industry, undefined);
  assert.equal(p.size, undefined);
  assert.equal(p.techStack, undefined);
  assert.deepEqual(p.sources, []);
});

test("tolerates bold headings and comma-separated tech lines", () => {
  const p = profileFromReport({
    summary: "s",
    markdown: "**Tech Stack**\nNode, Postgres, Next.js\n\n**Industry**\nFintech\n",
    citations: [],
  });
  assert.equal(p.industry, "Fintech");
  assert.deepEqual(p.techStack, ["Node", "Postgres", "Next.js"]);
});

test("summary is capped at the schema limit", () => {
  const long = "x".repeat(5000);
  const p = profileFromReport({ summary: long, markdown: "", citations: [] });
  assert.equal(p.summary.length, 4000);
});

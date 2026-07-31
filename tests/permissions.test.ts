import { test } from "node:test";
import assert from "node:assert/strict";

import { can, canManageMember, listActions } from "../lib/permissions";

test("viewer is read-only", () => {
  assert.equal(can("VIEWER", "agents.read"), true);
  assert.equal(can("VIEWER", "usage.read"), true);
  assert.equal(can("VIEWER", "agents.create"), false);
  assert.equal(can("VIEWER", "agents.run"), false);
  assert.equal(can("VIEWER", "approvals.decide"), false);
  assert.equal(can("VIEWER", "audit.read"), false);
  assert.equal(can("VIEWER", "members.invite"), false);
});

test("member can create and run but not promote or decide", () => {
  assert.equal(can("MEMBER", "agents.create"), true);
  assert.equal(can("MEMBER", "agents.run"), true);
  assert.equal(can("MEMBER", "knowledge.write"), true);
  assert.equal(can("MEMBER", "agents.promote"), false);
  assert.equal(can("MEMBER", "approvals.decide"), false);
  assert.equal(can("MEMBER", "settings.edit"), false);
});

test("manager gains promote, decide, audit, files.delete", () => {
  assert.equal(can("MANAGER", "agents.promote"), true);
  assert.equal(can("MANAGER", "approvals.decide"), true);
  assert.equal(can("MANAGER", "audit.read"), true);
  assert.equal(can("MANAGER", "files.delete"), true);
  assert.equal(can("MANAGER", "members.invite"), false);
  assert.equal(can("MANAGER", "settings.edit"), false);
});

test("admin manages members and settings but not owner-only actions", () => {
  assert.equal(can("ADMIN", "members.invite"), true);
  assert.equal(can("ADMIN", "members.role"), true);
  assert.equal(can("ADMIN", "members.remove"), true);
  assert.equal(can("ADMIN", "settings.edit"), true);
  assert.equal(can("ADMIN", "apikeys.manage"), true);
  assert.equal(can("ADMIN", "billing.manage"), false);
  assert.equal(can("ADMIN", "workspace.delete"), false);
});

test("owner is the only role for owner-only actions", () => {
  assert.equal(can("OWNER", "workspace.delete"), true);
  assert.equal(can("OWNER", "billing.manage"), true);
});

test("canManageMember protects the owner and respects rank", () => {
  assert.equal(canManageMember("ADMIN", "OWNER"), false);
  assert.equal(canManageMember("OWNER", "OWNER"), false);
  assert.equal(canManageMember("MANAGER", "VIEWER"), false); // needs ADMIN+
  assert.equal(canManageMember("ADMIN", "MEMBER"), true);
  assert.equal(canManageMember("ADMIN", "MANAGER"), true);
  assert.equal(canManageMember("OWNER", "ADMIN"), true);
});

test("listActions returns a non-empty, role-scoped capability list", () => {
  const viewer = listActions("VIEWER");
  const owner = listActions("OWNER");
  assert.ok(viewer.length > 0);
  assert.ok(owner.length > viewer.length);
  assert.ok(!viewer.includes("agents.create"));
  assert.ok(owner.includes("agents.create"));
});

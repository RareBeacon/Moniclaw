import test from "node:test";
import assert from "node:assert/strict";
import { accessState, hasActiveAccess } from "../lib/access";

test("M8 active, pending, suspended and expired access states are honest", () => {
  assert.equal(accessState({ accessStatus: "ACTIVE", accessUntil: null } as never), "active");
  assert.equal(accessState({ accessStatus: "PENDING", accessUntil: null } as never), "pending");
  assert.equal(accessState({ accessStatus: "SUSPENDED", accessUntil: null } as never), "suspended");
  const expired = { accessStatus: "ACTIVE", accessUntil: new Date(Date.now() - 1000) } as never;
  assert.equal(accessState(expired), "expired");
  assert.equal(hasActiveAccess(expired), false);
});

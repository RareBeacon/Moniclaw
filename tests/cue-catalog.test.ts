import { test } from "node:test";
import assert from "node:assert/strict";

import { ACTIONS, actionById, catalogMetadata, hasAction } from "../packages/computer-use/browser-engine/actions/catalog";
import { CueError } from "../packages/computer-use/errors";

/** The 38 mission actions — ids are the API contract. */
const REQUIRED_IDS = [
  "navigate", "go_back", "go_forward", "refresh",
  "open_tab", "close_tab", "switch_tab",
  "click", "double_click", "right_click", "hover", "focus", "blur",
  "type", "clear_input", "select_option", "checkbox", "radio",
  "scroll", "drag", "drop",
  "upload_file", "download_file",
  "take_screenshot", "print_pdf",
  "extract_text", "extract_links", "extract_tables", "extract_images",
  "wait", "wait_for_selector", "wait_for_navigation",
  "execute_javascript", "evaluate_dom", "read_attributes",
  "read_cookies", "write_cookies", "delete_cookies",
];

test("catalog covers all 38 mission actions with unique ids", () => {
  assert.equal(ACTIONS.length, 38);
  const ids = new Set(ACTIONS.map((a) => a.id));
  assert.equal(ids.size, ACTIONS.length);
  for (const id of REQUIRED_IDS) assert.ok(ids.has(id), `missing action ${id}`);
});

test("every action exposes the full contract (id/name/description/permission/schema/validate/execute)", () => {
  for (const action of ACTIONS) {
    assert.ok(action.id.length > 2, action.id);
    assert.ok(action.name.length > 2, action.id);
    assert.ok(action.description.length > 15, `${action.id} needs a real description`);
    assert.ok(action.permission, action.id);
    assert.ok(action.category, action.id);
    assert.ok(action.risk, action.id);
    assert.equal(typeof action.validate, "function");
    assert.equal(typeof action.execute, "function");
    assert.ok(action.schema, action.id);
  }
});

test("actionById resolves; unknown id throws validation CueError", () => {
  assert.equal(actionById("navigate").id, "navigate");
  assert.equal(hasAction("navigate"), true);
  assert.equal(hasAction("nope"), false);
  assert.throws(() => actionById("nope"), (err) => err instanceof CueError && err.kind === "validation");
});

test("validate() maps bad args to CueError(validation) with field detail", () => {
  assert.throws(
    () => actionById("navigate").validate({ url: "not-a-url" }),
    (err) => err instanceof CueError && err.kind === "validation" && /url/i.test(err.message)
  );
  assert.throws(
    () => actionById("type").validate({ selector: { strategy: "css", value: "#x" } }), // missing text
    (err) => err instanceof CueError && err.kind === "validation"
  );
});

test("validate() fills schema defaults (zod)", () => {
  const args = actionById("take_screenshot").validate({}) as { fullPage: boolean; format: string };
  assert.equal(args.fullPage, false);
  assert.equal(args.format, "png");
  const nav = actionById("navigate").validate({ url: "https://example.com" }) as {
    waitUntil: string;
    newTab: boolean;
  };
  assert.equal(nav.waitUntil, "domcontentloaded");
  assert.equal(nav.newTab, false);
});

test("permissions are correctly assigned (spot checks)", () => {
  assert.equal(actionById("execute_javascript").permission, "javascript");
  assert.equal(actionById("execute_javascript").risk, "high");
  assert.equal(actionById("download_file").permission, "files:download");
  assert.equal(actionById("upload_file").permission, "files:upload");
  assert.equal(actionById("navigate").permission, "navigate");
  assert.equal(actionById("click").permission, "interact");
  assert.equal(actionById("type").permission, "input");
  assert.equal(actionById("take_screenshot").permission, "read");
  assert.equal(actionById("read_cookies").permission, "cookies:read");
  assert.equal(actionById("write_cookies").permission, "cookies:write");
});

test("rollback exists where state restoration is implemented", () => {
  for (const id of ["navigate", "go_back", "open_tab", "close_tab", "switch_tab", "type", "clear_input", "select_option", "checkbox", "scroll", "write_cookies", "delete_cookies"]) {
    assert.equal(typeof actionById(id).rollback, "function", `${id} should implement rollback`);
  }
});

test("catalogMetadata produces JSON-schema docs for every action", () => {
  const meta = catalogMetadata();
  assert.equal(meta.length, 38);
  for (const entry of meta) {
    assert.ok(entry.schema && typeof entry.schema === "object", entry.id);
    assert.ok(entry.description.length > 15);
    assert.ok(entry.permission);
  }
  const navigate = meta.find((m) => m.id === "navigate")!;
  assert.equal(navigate.schema.type, "object");
  const required = (navigate.schema as { required?: string[] }).required ?? [];
  assert.ok(required.includes("url"), "url must be required");
  assert.ok("url" in ((navigate.schema as { properties?: object }).properties ?? {}), "url must be documented");
});

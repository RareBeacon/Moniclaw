import { test } from "node:test";
import assert from "node:assert/strict";

import { priorConfidence, scoreSelector, strategyBase, uniquenessFactor } from "../packages/computer-use/selectors/score";
import { rankCandidates, type ElementFingerprint } from "../packages/computer-use/selectors/discover";
import { selectorSpecSchema, selectorQuerySchema, toSelectorQuery } from "../packages/computer-use/selectors/types";
import { healHintFromSpec } from "../packages/computer-use/recovery/service";

/** Fingerprint factory: the page probe emits "" (not null) for absent attributes. */
function fp(over: Partial<ElementFingerprint> & { tag: string }): ElementFingerprint {
  return {
    id: "", testId: "", role: "", ariaLabel: "", name: "", placeholder: "",
    text: "", type: "", href: "", formAction: "", visible: true, nth: 0,
    ...over,
  };
}

test("strategyBase ordering: testid > aria > label ≈ role(named) > placeholder > text > css > xpath", () => {
  const order = [
    strategyBase({ strategy: "testid", value: "submit" }),
    strategyBase({ strategy: "aria", value: "Submit" }),
    strategyBase({ strategy: "label", value: "Email" }),
    strategyBase({ strategy: "role", role: "button", name: "Submit" }), // ties with label by design
    strategyBase({ strategy: "placeholder", value: "Search" }),
    strategyBase({ strategy: "text", value: "Submit", exact: false }),
    strategyBase({ strategy: "css", value: ".btn" }),
    strategyBase({ strategy: "xpath", value: "//button[1]" }),
  ];
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] >= order[i], `position ${i - 1} should be >= ${i}`);
  // Hard boundaries that must be STRICT.
  assert.ok(order[0] > order[1], "testid strictly beats aria");
  assert.ok(order[1] > order[2], "aria strictly beats label");
  assert.ok(order[3] > order[4], "named role strictly beats placeholder");
  assert.ok(order[6] > order[7], "css strictly beats xpath");
});

test("role without accessible name loses confidence; id css gains", () => {
  const anonymous = strategyBase({ strategy: "role", role: "button" });
  const named = strategyBase({ strategy: "role", role: "button", name: "Save" });
  assert.ok(named > anonymous);
  const idCss = strategyBase({ strategy: "css", value: "#save" });
  const classCss = strategyBase({ strategy: "css", value: ".save" });
  assert.ok(idCss > classCss);
});

test("uniquenessFactor penalizes multi-match", () => {
  assert.equal(uniquenessFactor(1), 1);
  assert.ok(uniquenessFactor(2) < 1);
  assert.ok(uniquenessFactor(6) < uniquenessFactor(2));
});

test("scoreSelector multiplies base × uniqueness and discounts invisibility", () => {
  const spec = { strategy: "css" as const, value: ".btn" };
  const visible = scoreSelector(spec, 1, { visible: true });
  const invisible = scoreSelector(spec, 1, { visible: false });
  assert.ok(visible > invisible);
  assert.ok(visible <= 1 && invisible > 0);
});

test("priorConfidence mirrors strategy strength", () => {
  assert.ok(priorConfidence({ strategy: "testid", value: "x" }) > priorConfidence({ strategy: "xpath", value: "/x" }));
});

test("rankCandidates ranks exact text match highest for a button", () => {
  const elements: ElementFingerprint[] = [
    fp({ tag: "button", role: "button", text: "Sign in" }),
    fp({ tag: "a", role: "link", text: "Sign up now", href: "/signup", nth: 1 }),
    fp({ tag: "button", role: "button", text: "Sign out", nth: 2 }),
  ];
  const ranked = rankCandidates("sign in", elements);
  assert.ok(ranked.length > 0);
  assert.equal(JSON.stringify(ranked[0].spec), JSON.stringify({ strategy: "role", role: "button", name: "Sign in" }));
  assert.ok(ranked.every((c) => c.confidence > 0.3));
});

test("rankCandidates prefers testid when terms match it", () => {
  const elements: ElementFingerprint[] = [
    fp({ tag: "input", testId: "email-input", role: "textbox", name: "email", placeholder: "Email", type: "email" }),
  ];
  const ranked = rankCandidates("email input", elements);
  assert.equal(ranked[0].spec.strategy, "testid");
});

test("rankCandidates skips invisible elements", () => {
  const elements: ElementFingerprint[] = [
    fp({ tag: "button", role: "button", text: "Hidden", visible: false }),
  ];
  assert.equal(rankCandidates("hidden", elements).length, 0);
});

test("selector schemas: discriminated union + query defaults", () => {
  const textSpec = selectorSpecSchema.parse({ strategy: "text", value: "Hello" });
  if (textSpec.strategy !== "text") assert.fail("expected text strategy");
  assert.equal(textSpec.exact, false);
  const query = selectorQuerySchema.parse({ primary: { strategy: "css", value: "#a" } });
  assert.deepEqual(query.fallbacks, []);
  const viaShort = toSelectorQuery(selectorSpecSchema.parse({ strategy: "testid", value: "t1" }));
  assert.equal(viaShort.primary.strategy, "testid");
});

test("healHintFromSpec mines semantics for discovery", () => {
  assert.equal(healHintFromSpec({ strategy: "text", value: "Sign in", exact: false }), "Sign in");
  assert.equal(healHintFromSpec({ strategy: "role", role: "button", name: "Submit" }), "Submit");
  assert.equal(healHintFromSpec({ strategy: "css", value: "#checkout-btn" }), "checkout-btn");
  assert.equal(healHintFromSpec({ strategy: "css", value: "form input[name=email]" }), "email");
  assert.equal(healHintFromSpec({ primary: { strategy: "label", value: "Email address" }, fallbacks: [] }), "Email address");
});

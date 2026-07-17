import assert from "node:assert/strict";
import { titleLimitFor } from "./platform-title-limits";

let pass = 0;
function t(name: string, fn: () => void) {
  fn();
  pass += 1;
  console.log(`  ✓ ${name}`);
}

console.log("lib/marketing-planner/platform-title-limits");

t("youtube = 100 (by key)", () => assert.equal(titleLimitFor({ key: "youtube" }), 100));

t("tiktok/instagram/facebook = 2200", () => {
  assert.equal(titleLimitFor({ key: "tiktok" }), 2200);
  assert.equal(titleLimitFor({ key: "instagram" }), 2200);
  assert.equal(titleLimitFor({ key: "facebook" }), 2200);
});

t("website/blog = 60", () => {
  assert.equal(titleLimitFor({ key: "website" }), 60);
  assert.equal(titleLimitFor({ key: "blog" }), 60);
});

t("by name fallback (YouTube → 100)", () => assert.equal(titleLimitFor({ name: "YouTube" }), 100));

t("unknown (email / gbp) = undefined (ไม่จำกัด)", () => {
  assert.equal(titleLimitFor({ key: "email" }), undefined);
  assert.equal(titleLimitFor({ key: "gbp", name: "Google Business" }), undefined);
});

t("empty = undefined", () => assert.equal(titleLimitFor({}), undefined));

console.log(`\n${pass} passed`);

/**
 * REGRESSION LOCK — one base tracking, boxes loaded into SEVERAL containers.
 *
 * owner 2026-07-16: "ตรวจแทรคกิ้งเทียบ momo live ยังไม่ตรงกับในระบบเลย ทั้งกล่อง
 * ทั้งแทรคกิ้ง และคิวก็ยังเบิ้ลอยู่ · แก้ให้โดนต้นตอ และห้ามเกิดปัญหาขึ้นอีก"
 *
 * THE BUG: realContainerByBase() keyed by BASE and kept "the FIRST real container
 * seen", on the written assumption that "a base tracking's boxes all share one
 * container". Prod disproved it:
 *   1783582423      → GZS260710-1 (60 กล่อง) · GZS260710-2 (28) · GZS260712-1 (28)
 *   KY4001030721114 → GZE260709-1 (69 กล่อง) · GZE260712-1 (61)
 * MOMO sends the right container on EVERY parcel — we collapsed it away and stamped
 * one ตู้ onto all N siblings, so one container double-counted its คิว/กล่อง/น้ำหนัก
 * while the others read empty (warehouse blocked · admin couldn't collect). The cron
 * re-applied it every run, which is why it "kept coming back".
 *
 * These assertions are the fence: a cross-container split must resolve PER BOX.
 */
import assert from "node:assert/strict";
import { realContainerByBase } from "./live-cabinet-plan";
import type { MomoLiveParcel } from "./types";

let checks = 0;
function ok(name: string, fn: () => void) {
  fn();
  checks++;
  console.log(`  ✓ ${name}`);
}

const parcel = (tracking: string, containerName: string): MomoLiveParcel =>
  ({ tracking, containerName }) as unknown as MomoLiveParcel;

console.log("live-cabinet-split.test.ts — cross-container split (owner 2026-07-16)");

// ── the exact prod shape that broke ─────────────────────────────────────────
ok("1783582423: each box keeps ITS OWN container (was: all → GZS260710-1)", () => {
  const { byExact } = realContainerByBase([
    parcel("1783582423", "GZS260710-2"),
    parcel("1783582423-3", "GZS260710-2"),
    parcel("1783582423-8", "GZS260710-1"),
    parcel("1783582423-9", "GZS260710-1"),
    parcel("1783582423-23", "GZS260712-1"),
  ]);
  assert.equal(byExact.get("1783582423")?.container, "GZS260710-2");
  assert.equal(byExact.get("1783582423-3")?.container, "GZS260710-2");
  assert.equal(byExact.get("1783582423-8")?.container, "GZS260710-1");
  assert.equal(byExact.get("1783582423-23")?.container, "GZS260712-1");
});

ok("a split base is flagged ambiguous → the caller skips instead of guessing", () => {
  const { byBase } = realContainerByBase([
    parcel("KY4001030721114-4", "GZE260712-1"),
    parcel("KY4001030721114-1", "GZE260709-1"),
  ]);
  assert.equal(byBase.get("KY4001030721114")?.ambiguous, true);
});

// ── the common case must not change ─────────────────────────────────────────
ok("single-container base: byBase still resolves + is NOT ambiguous", () => {
  const { byExact, byBase } = realContainerByBase([
    parcel("800208111045-1", "GZE260714-1"),
    parcel("800208111045-2", "GZE260714-1"),
  ]);
  assert.equal(byBase.get("800208111045")?.container, "GZE260714-1");
  assert.ok(!byBase.get("800208111045")?.ambiguous);
  assert.equal(byExact.get("800208111045-2")?.container, "GZE260714-1");
});

ok("a bare stored row still resolves via the base fallback", () => {
  const { byBase } = realContainerByBase([parcel("610013263556-1", "GZE260714-1")]);
  assert.equal(byBase.get("610013263556")?.container, "GZE260714-1");
});

// ── existing guards must survive ────────────────────────────────────────────
ok("non-real containers (sack / routing batch / blank) are still ignored", () => {
  const { byExact, byBase } = realContainerByBase([
    parcel("1783147517-1", "PR20260701-EK01"),
    parcel("1783147517-2", ""),
    parcel("1783147517-3", "CG83584631177"),
  ]);
  assert.equal(byExact.size, 0);
  assert.equal(byBase.size, 0);
});

ok("a real container still wins over a sack sibling on the same base", () => {
  const { byExact, byBase } = realContainerByBase([
    parcel("1783147517-1", "PR20260701-EK01"),
    parcel("1783147517-2", "GZS260715-1"),
  ]);
  assert.equal(byExact.get("1783147517-2")?.container, "GZS260715-1");
  assert.equal(byBase.get("1783147517")?.container, "GZS260715-1");
  assert.ok(!byBase.get("1783147517")?.ambiguous);
});

console.log(`\n✅ live-cabinet-split.test.ts — ${checks} checks passed`);

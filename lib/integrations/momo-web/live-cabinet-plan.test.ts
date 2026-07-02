/**
 * Unit tests — MOMO Live → tb_forwarder.fcabinetnumber (เลขตู้) + fdatecontainerclose
 * (วันปิดตู้) fill DECISIONS (owner ภูม 2026-07-02).
 *
 * Focus (money-adjacent · fcabinetnumber drives report-cnt grouping · date filters it):
 *   1. isRealContainerCode — ONLY GZS/GZE/GZA count; routing-batch (PR…-SEA…) + sack
 *      (CBX…-SEA…) + empty do NOT (so a placeholder never masquerades as real).
 *   2. decideCabinetFill — fill-when-empty-OR-placeholder · NEVER overwrite a real ตู้ ·
 *      only ever write a real container · no-op when already equal.
 *   3. cleanCloseDate — SAME accept rules as commit-momo-row-core cleanDate (bare date).
 *   4. closeDateFromParcel — prepare_export (ปิดตู้) first, else exported; null when neither.
 *
 * Run: tsx lib/integrations/momo-web/live-cabinet-plan.test.ts
 */

import assert from "node:assert/strict";
import {
  isRealContainerCode,
  decideCabinetFill,
  cleanCloseDate,
  closeDateFromParcel,
} from "./live-cabinet-plan";
import type { MomoLiveParcel } from "./types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Minimal parcel factory — only the fields the cabinet plan reads. */
function parcel(p: Partial<MomoLiveParcel>): MomoLiveParcel {
  return {
    tracking: "",
    memberCode: "",
    weightKg: 0,
    cbm: 0,
    width: 0,
    length: 0,
    height: 0,
    quantity: 1,
    containerName: "",
    containerCode: "",
    containerNo: "",
    statusId: 0,
    statusText: "",
    shipBy: "",
    type: "",
    imageUrl: null,
    qrCode: "",
    statusDate: {},
    ...p,
  };
}

console.log("MOMO Live cabinet plan — isRealContainerCode");

check("real containers (GZS/GZE/GZA) pass", () => {
  assert.equal(isRealContainerCode("GZS260626-1"), true, "GZS sea");
  assert.equal(isRealContainerCode("GZE2604-01"), true, "GZE road");
  assert.equal(isRealContainerCode("GZA260601-AIR"), true, "GZA air");
  assert.equal(isRealContainerCode("gzs260626-1"), true, "case-insensitive");
  assert.equal(isRealContainerCode(" GZS260626-1 "), true, "trimmed");
});

check("routing-batch placeholders + sacks + empty are NOT real", () => {
  assert.equal(isRealContainerCode("PR20260624-SEA01"), false, "routing batch (owner's screenshot)");
  assert.equal(isRealContainerCode("MO20260523-EK01"), false, "MO routing batch");
  assert.equal(isRealContainerCode("PCS20260528-SEA01"), false, "PCS routing batch");
  assert.equal(isRealContainerCode("CBX260624-SEA05"), false, "sack (owner's screenshot)");
  assert.equal(isRealContainerCode("SEA01"), false, "bare mode token");
  assert.equal(isRealContainerCode(""), false, "empty");
  assert.equal(isRealContainerCode(null), false, "null");
  assert.equal(isRealContainerCode(undefined), false, "undefined");
});

console.log("MOMO Live cabinet plan — decideCabinetFill");

check("FILL: empty cabinet + real Live container", () => {
  const d = decideCabinetFill("", "GZS260626-1");
  assert.equal(d.fill, true);
  assert.equal(d.reason, "");
  // null current too
  assert.equal(decideCabinetFill(null, "GZS260626-1").fill, true);
});

check("FILL: routing-batch placeholder + real Live container (the owner's exact case)", () => {
  const d = decideCabinetFill("PR20260624-SEA01", "GZS260626-1");
  assert.equal(d.fill, true, "placeholder → real container replaces it");
  assert.equal(d.reason, "");
});

check("NEVER overwrite an existing REAL container", () => {
  const d = decideCabinetFill("GZS260525-2", "GZS260626-1");
  assert.equal(d.fill, false, "current is real → keep it");
  assert.equal(d.reason, "current_is_real");
});

check("NEVER write a non-real Live value (routing batch / sack / empty)", () => {
  assert.equal(decideCabinetFill("", "PR20260624-SEA01").fill, false, "live is routing batch");
  assert.equal(decideCabinetFill("", "PR20260624-SEA01").reason, "live_not_real");
  assert.equal(decideCabinetFill("", "CBX260624-SEA05").fill, false, "live is sack");
  assert.equal(decideCabinetFill("PR20260624-SEA01", "").fill, false, "live empty");
});

check("NO-OP: current already equals the Live container (idempotent)", () => {
  const d = decideCabinetFill("GZS260626-1", "GZS260626-1");
  // current_is_real short-circuits first (still no fill) — the important thing is fill=false.
  assert.equal(d.fill, false);
  // a case-only difference is also treated as equal (write is case-preserving but match is CI).
  assert.equal(decideCabinetFill("gzs260626-1", "GZS260626-1").fill, false, "case-insensitive equal → no overwrite");
});

console.log("MOMO Live cabinet plan — cleanCloseDate (mirrors commit cleanDate)");

check("accepts YYYY-MM-DD and YYYY-MM-DDThh:mm:ss", () => {
  assert.equal(cleanCloseDate("2026-06-26"), "2026-06-26");
  assert.equal(cleanCloseDate("2026-06-26T10:30:00"), "2026-06-26", "keeps date part only");
  assert.equal(cleanCloseDate("2026-06-26 10:30:00"), "2026-06-26", "space-separated timestamp");
  assert.equal(cleanCloseDate(" 2026-06-26 "), "2026-06-26", "trimmed");
});

check("rejects legacy sentinels / non-dates / impossible dates", () => {
  assert.equal(cleanCloseDate("0000-00-00"), null, "MySQL sentinel");
  assert.equal(cleanCloseDate("0000-00-00 00:00:00"), null, "MySQL sentinel ts");
  assert.equal(cleanCloseDate(""), null, "empty");
  assert.equal(cleanCloseDate("not-a-date"), null, "junk");
  assert.equal(cleanCloseDate("2026-02-30"), null, "Feb 30 → rejected (round-trip)");
  assert.equal(cleanCloseDate(null), null, "null");
  assert.equal(cleanCloseDate(12345), null, "non-string");
});

console.log("MOMO Live cabinet plan — closeDateFromParcel");

check("prepare_export (ปิดตู้) wins over exported", () => {
  const p = parcel({ statusDate: { prepare_export: "2026-06-26 09:00:00", exported: "2026-06-28 12:00:00" } });
  assert.equal(closeDateFromParcel(p), "2026-06-26", "close = prepare_export");
});

check("falls back to exported when prepare_export absent", () => {
  const p = parcel({ statusDate: { kodang: "2026-06-20", exported: "2026-06-28T12:00:00" } });
  assert.equal(closeDateFromParcel(p), "2026-06-28", "close = exported when no prepare_export");
});

check("null when neither close phase has a valid timestamp (don't invent one)", () => {
  assert.equal(closeDateFromParcel(parcel({ statusDate: { kodang: "2026-06-20", waiting: "2026-06-18" } })), null, "not closed yet");
  assert.equal(closeDateFromParcel(parcel({ statusDate: {} })), null, "empty status_date");
  assert.equal(closeDateFromParcel(parcel({ statusDate: { prepare_export: "" } })), null, "blank string phase");
  assert.equal(closeDateFromParcel(parcel({ statusDate: { prepare_export: "0000-00-00" } })), null, "sentinel phase");
});

console.log(`\n✅ live-cabinet-plan.test.ts — ${passed} checks passed`);

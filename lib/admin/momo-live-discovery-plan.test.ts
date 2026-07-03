/**
 * Unit tests for the PURE MOMO Live discovery diff + materialize builders.
 * Run: tsx lib/admin/momo-live-discovery-plan.test.ts
 *
 * Money-critical assertions:
 *   - a sending_thai parcel with weight + container + NO tb_forwarder row → surfaced
 *   - a tracking already in tb_forwarder (base OR exact) → suppressed (never re-minted)
 *   - split "-i/n" siblings aggregate to ONE base row; TOTAL = per-piece × qty summed
 *   - a no-weight parcel → skipped (never commit → never ฿0-bill)
 *   - the synthetic raw carries the AGGREGATE TOTAL in raw.kg/cbm (not per-piece)
 */

import assert from "node:assert";
import type { MomoLiveParcel } from "@/lib/integrations/momo-web/types";
import {
  classifyDiscovery,
  buildDiscoveryRaw,
  buildImportTrackRow,
  splitMemberCode,
  normalizeMemberCode,
  momoTypeToProductType,
  momoTypeLabel,
  pickSuggestedCarrier,
  payMethodForCarrier,
  DISCOVERY_BOARDS,
} from "@/lib/admin/momo-live-discovery-plan";
import { MOMO_LIVE_STATUSES } from "@/lib/integrations/momo-web/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function parcel(p: Partial<MomoLiveParcel>): MomoLiveParcel {
  return {
    tracking: "",
    memberCode: "PR043",
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
    statusText: "กำลังส่งมาไทย",
    shipBy: "ship",
    type: "general",
    imageUrl: null,
    qrCode: "",
    statusDate: {},
    ...p,
  };
}

console.log("momo-live-discovery-plan");

// ── (a) a weighted, containered, unknown parcel is surfaced ──────────────────
check("surfaces a sending_thai parcel with weight + container + no forwarder row", () => {
  const parcels = [
    parcel({ tracking: "YT2590231382196", weightKg: 0.26, cbm: 0.004, quantity: 1, containerName: "GZS260628-2" }),
  ];
  const { candidates, alreadyInSystem, skippedNoWeight } = classifyDiscovery(parcels, new Set());
  assert.equal(candidates.length, 1, "one candidate");
  assert.equal(alreadyInSystem, 0);
  assert.equal(skippedNoWeight, 0);
  const c = candidates[0];
  assert.equal(c.baseTracking, "YT2590231382196");
  assert.equal(c.container, "GZS260628-2");
  assert.equal(c.hasContainer, true);
  assert.equal(c.weightKg, 0.26);
  assert.equal(c.quantity, 1);
  assert.equal(c.memberCode, "PR043");
});

// ── (b) a tracking already in tb_forwarder is suppressed (base + exact) ──────
check("suppresses a tracking already present in tb_forwarder (base match)", () => {
  const parcels = [parcel({ tracking: "1782544029", weightKg: 9, quantity: 1 })];
  const { candidates, alreadyInSystem } = classifyDiscovery(parcels, new Set(["1782544029"]));
  assert.equal(candidates.length, 0, "suppressed");
  assert.equal(alreadyInSystem, 1);
});

check("suppresses a split tracking whose BASE already exists in tb_forwarder", () => {
  // MOMO sends split siblings; tb_forwarder holds the BASE row. The caller normalizes
  // tb_forwarder trackings to base — so a "-1/4" scrape must be suppressed by the base.
  const parcels = [
    parcel({ tracking: "1781675788-1/4", weightKg: 10, quantity: 1, containerName: "GZS260702-1" }),
    parcel({ tracking: "1781675788-2/4", weightKg: 12, quantity: 1, containerName: "GZS260702-1" }),
  ];
  const { candidates, alreadyInSystem } = classifyDiscovery(parcels, new Set(["1781675788"]));
  assert.equal(candidates.length, 0, "base-suppressed");
  assert.equal(alreadyInSystem, 1, "one base rolled up + suppressed");
});

// ── (c) split siblings aggregate to ONE base; TOTAL = per-piece × qty summed ──
check("aggregates split '-i/n' siblings into ONE base row with summed TOTALS", () => {
  // Live reports PER-PIECE; TOTAL = per-piece × qty. Two boxes of one base tracking.
  const parcels = [
    parcel({ tracking: "1782113771-3", weightKg: 38, cbm: 0.1, quantity: 2, containerName: "GZS260626-1" }), // 76 / 0.2
    parcel({ tracking: "1782113771-4", weightKg: 196, cbm: 0.3, quantity: 7, containerName: "GZS260626-1" }), // 1372 / 2.1
  ];
  const { candidates } = classifyDiscovery(parcels, new Set());
  assert.equal(candidates.length, 1, "one base");
  const c = candidates[0];
  assert.equal(c.baseTracking, "1782113771");
  assert.equal(c.parcelCount, 2, "two boxes rolled up");
  assert.equal(c.weightKg, r2(76 + 1372), "Σ TOTAL weight = 1448");
  assert.equal(c.cbm, r6(0.2 + 2.1), "Σ TOTAL cbm = 2.3");
  assert.equal(c.quantity, 9, "Σ pieces = 2 + 7");
  // dims are NOT set for a multi-box aggregate (not additive)
  assert.equal(c.width, 0);
  assert.equal(c.height, 0);
});

// ── (d) a no-weight parcel is skipped (never commit → never ฿0-bill) ─────────
check("skips a parcel with weightKg <= 0 (never commit an un-weighed row)", () => {
  const parcels = [parcel({ tracking: "999000111", weightKg: 0, cbm: 0, quantity: 1, containerName: "GZS260628-2" })];
  const { candidates, skippedNoWeight } = classifyDiscovery(parcels, new Set());
  assert.equal(candidates.length, 0, "not surfaced");
  assert.equal(skippedNoWeight, 1);
});

// ── (e) the synthetic raw carries the AGGREGATE TOTAL (not per-piece) ────────
check("buildDiscoveryRaw carries the AGGREGATE TOTAL in raw.kg/cbm/quantity", () => {
  const parcels = [
    parcel({ tracking: "1782113771-3", weightKg: 38, cbm: 0.1, quantity: 2 }),
    parcel({ tracking: "1782113771-4", weightKg: 196, cbm: 0.3, quantity: 7 }),
  ];
  const c = classifyDiscovery(parcels, new Set()).candidates[0];
  const raw = buildDiscoveryRaw(c) as Record<string, number | string>;
  // extractMetricsFromMomoRaw reads raw.kg AS-IS → must be the TOTAL 1448, not per-piece 38/196.
  assert.equal(raw.kg, r2(1448));
  assert.equal(raw.cbm, r6(2.3));
  assert.equal(raw.quantity, 9);
  assert.equal(raw.source, "live_discovery");
});

// ── (f) buildImportTrackRow sets the REAL cabinet in container_batch_no ──────
check("buildImportTrackRow puts the real cabinet in container_batch_no + tracking key", () => {
  const c = classifyDiscovery(
    [parcel({ tracking: "YT2590231382196", weightKg: 0.26, cbm: 0.004, quantity: 1, containerName: "GZS260628-2", statusDate: { exported: "2026-06-28" } })],
    new Set(),
  ).candidates[0];
  const row = buildImportTrackRow(c) as Record<string, unknown>;
  assert.equal(row.momo_tracking_no, "YT2590231382196");
  assert.equal(row.container_batch_no, "GZS260628-2", "real cabinet → drives fstatus '3' + transport");
  assert.equal(row.weight_kg, 0.26);
  assert.equal(row.quantity, 1);
  assert.equal(row.momo_updated_at, "2026-06-28", "manifest date from status_date.exported");
  assert.equal(row.momo_user_group, "PR");
  assert.equal(row.momo_user_code, "043");
});

// ── (g) member-code helpers ──────────────────────────────────────────────────
check("splitMemberCode / normalizeMemberCode", () => {
  assert.deepEqual(splitMemberCode("PR043"), { group: "PR", code: "043" });
  assert.deepEqual(splitMemberCode("pr10900"), { group: "PR", code: "10900" });
  assert.equal(normalizeMemberCode("  pr043 "), "PR043");
});

// ── (h) has-container candidates sort first (มาไทยแล้ว on top) ────────────────
check("sorts has-container candidates first", () => {
  const parcels = [
    parcel({ tracking: "AAA111", weightKg: 5, quantity: 1, containerName: "" }),
    parcel({ tracking: "BBB222", weightKg: 5, quantity: 1, containerName: "GZS260628-9" }),
  ];
  const { candidates } = classifyDiscovery(parcels, new Set());
  assert.equal(candidates[0].baseTracking, "BBB222", "container-having first");
  assert.equal(candidates[1].baseTracking, "AAA111");
});

// ── (i) MOMO type → fProductsType mapping (owner flag: ประเภทไม่ควรทั่วไปหมด) ──
check("momoTypeToProductType maps MOMO type → fProductsType (general/tis/fda/control)", () => {
  assert.equal(momoTypeToProductType("general"), "1"); // ทั่วไป
  assert.equal(momoTypeToProductType("tis"), "2"); // มอก.
  assert.equal(momoTypeToProductType("fda"), "3"); // อย.
  assert.equal(momoTypeToProductType("control"), "4"); // พิเศษ
  assert.equal(momoTypeToProductType("FDA"), "3", "case-insensitive");
  assert.equal(momoTypeToProductType("weird"), "1", "unknown → ทั่วไป");
  assert.equal(momoTypeToProductType(""), "1");
  assert.equal(momoTypeToProductType(null), "1");
});

check("momoTypeLabel renders a Thai chip label", () => {
  assert.equal(momoTypeLabel("tis"), "มอก.");
  assert.equal(momoTypeLabel("fda"), "อย.");
  assert.equal(momoTypeLabel("general"), "ทั่วไป");
  assert.equal(momoTypeLabel("xyz"), "xyz", "unknown → raw");
  assert.equal(momoTypeLabel(""), "—");
});

// ── (j) discovery scans ALL boards (owner: "เอาของทุกสถานะมาเลย") ──
check("DISCOVERY_BOARDS covers all MOMO live boards", () => {
  assert.equal(DISCOVERY_BOARDS.length, MOMO_LIVE_STATUSES.length);
  for (const b of MOMO_LIVE_STATUSES) assert.ok(DISCOVERY_BOARDS.includes(b), `includes ${b}`);
});

// ── (k) a candidate's fProductsType seeds from the REAL MOMO type, not hardcoded '1' ──
check("classify carries the raw MOMO type through to the candidate", () => {
  const c = classifyDiscovery(
    [parcel({ tracking: "T1", weightKg: 5, quantity: 1, type: "fda" })],
    new Set(),
  ).candidates[0];
  assert.equal(c.productType, "fda");
  assert.equal(momoTypeToProductType(c.productType), "3", "→ อย. (not ทั่วไป)");
});

// ── (l) delivery: pickSuggestedCarrier prefers the saved carrier when eligible ──
check("pickSuggestedCarrier prefers the saved carrier when eligible, else first, else ''", () => {
  const eligible = [{ id: "2" }, { id: "13" }, { id: "16" }];
  // saved carrier IS eligible → keep it (the customer's choice wins)
  assert.equal(pickSuggestedCarrier("13", eligible), "13");
  // saved carrier NOT eligible for this province → fall to the first eligible
  assert.equal(pickSuggestedCarrier("45", eligible), "2");
  // no saved carrier → first eligible
  assert.equal(pickSuggestedCarrier("", eligible), "2");
  assert.equal(pickSuggestedCarrier(null, eligible), "2");
  // no eligible carriers at all (no address) → "" (admin picks manually)
  assert.equal(pickSuggestedCarrier("2", []), "");
  assert.equal(pickSuggestedCarrier("", []), "");
});

// ── (m) delivery: payMethodForCarrier — BKK-origin → ต้นทาง · upcountry → COD ──
check("payMethodForCarrier derives ต้นทาง('1')/COD('2') from the carrier (money rule)", () => {
  // Flash (2) / J&T (24) / self-pickup (PCS) = pay-at-origin → '1' ต้นทาง (BKK band)
  assert.equal(payMethodForCarrier("2"), "1");
  assert.equal(payMethodForCarrier("24"), "1");
  assert.equal(payMethodForCarrier("PCS"), "1");
  // an upcountry private carrier (13 ธนามัย, 45 เอ็มพอร์ท) → '2' ปลายทาง COD
  assert.equal(payMethodForCarrier("13"), "2");
  assert.equal(payMethodForCarrier("45"), "2");
  // empty/unknown → '2' (legacy default fall-through — matches derivePayMethod)
  assert.equal(payMethodForCarrier(""), "2");
  assert.equal(payMethodForCarrier(null), "2");
});

// local rounding mirrors the module (kept private there)
function r2(n: number): number { return Number(n.toFixed(2)); }
function r6(n: number): number { return Number(n.toFixed(6)); }

console.log(`\n${passed} assertions passed\n`);

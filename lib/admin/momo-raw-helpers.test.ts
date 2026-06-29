/**
 * Wave 30.5 · momo-raw-helpers — pure function tests.
 *
 * Covers the two MOMO raw→field derivations that feed the tb_forwarder
 * commit (deriveTransportTypeFromMomoRaw · extractMetricsFromMomoRaw). These
 * live OUTSIDE commit-momo-row-core.ts precisely so they can be exercised
 * here — that module's `import "server-only"` throws under tsx.
 *
 * Run:  pnpm tsx lib/admin/momo-raw-helpers.test.ts
 *   (and via `pnpm test:unit` once wired into package.json)
 */

import {
  deriveTransportTypeFromMomoRaw,
  extractMetricsFromMomoRaw,
  extractWarehouseDatesFromMomoRaw,
  momoRawDisplay,
  flattenMomoRaw,
  collectMomoRawColumns,
  momoSpreadRow,
  collectMomoSpreadColumns,
  formatMomoSpreadValue,
  deriveModeFromCid,
  deriveTransportTypeFromCabinet,
  buildTrackingCabinetMap,
  aggregateTrackDetailMetrics,
  MOMO_FIELD_TH,
} from "./momo-raw-helpers";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    fail++;
  }
}

console.log("=== Wave 30.5 · momo-raw-helpers ===");

// ── deriveTransportTypeFromMomoRaw — defaults to "1" ────────────────
check("null → '1'", deriveTransportTypeFromMomoRaw(null) === "1");
check("undefined → '1'", deriveTransportTypeFromMomoRaw(undefined) === "1");
check("string raw → '1'", deriveTransportTypeFromMomoRaw("ship") === "1");
check("number raw → '1'", deriveTransportTypeFromMomoRaw(42) === "1");
check("empty object → '1'", deriveTransportTypeFromMomoRaw({}) === "1");
check("no ship_by key → '1'", deriveTransportTypeFromMomoRaw({ kg: 5 }) === "1");

// ── deriveTransportTypeFromMomoRaw — ship → "2" (case-insensitive) ──
check('{ship_by:"ship"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "ship" }) === "2");
check('{ship_by:"SHIP"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "SHIP" }) === "2");
check('{ship_by:"Ship"} → "2"', deriveTransportTypeFromMomoRaw({ ship_by: "Ship" }) === "2");

// ── deriveTransportTypeFromMomoRaw — everything else → "1" ──────────
check('{ship_by:"car"} → "1"', deriveTransportTypeFromMomoRaw({ ship_by: "car" }) === "1");
check('{ship_by:"air"} → "1" (air buckets to truck)', deriveTransportTypeFromMomoRaw({ ship_by: "air" }) === "1");
check('{ship_by:"truck"} → "1" (unknown)', deriveTransportTypeFromMomoRaw({ ship_by: "truck" }) === "1");
check('{ship_by:""} → "1"', deriveTransportTypeFromMomoRaw({ ship_by: "" }) === "1");
check("{ship_by:123} non-string → '1'", deriveTransportTypeFromMomoRaw({ ship_by: 123 }) === "1");
check('{ship_by:"  ship  "} padded → "1" (no trim by design)', deriveTransportTypeFromMomoRaw({ ship_by: "  ship  " }) === "1");

// ── extractMetricsFromMomoRaw — null / non-object → zero-metrics ────
const e1 = extractMetricsFromMomoRaw(null);
check("null → all zero, qty 1", e1.weight === 0 && e1.cbm === 0 && e1.width === 0 && e1.length === 0 && e1.height === 0 && e1.qty === 1);
const e2 = extractMetricsFromMomoRaw("nope");
check("string raw → zero-metrics", e2.weight === 0 && e2.qty === 1);
const e3 = extractMetricsFromMomoRaw({});
check("empty object → zero-metrics", e3.weight === 0 && e3.cbm === 0 && e3.qty === 1);

// ── extractMetricsFromMomoRaw — happy path (numbers) ────────────────
const m = extractMetricsFromMomoRaw({ kg: 5, cbm: 0.5, width: 10, length: 20, height: 30, quantity: 4 });
check("kg → weight 5", m.weight === 5);
check("cbm → 0.5", m.cbm === 0.5);
check("width → 10", m.width === 10);
check("length → 20", m.length === 20);
check("height → 30", m.height === 30);
check("quantity 4 → qty 4", m.qty === 4);

// ── extractMetricsFromMomoRaw — numeric strings coerce ──────────────
const s = extractMetricsFromMomoRaw({ kg: "5.5", cbm: "0.25", quantity: "3" });
check('kg "5.5" → 5.5', s.weight === 5.5);
check('cbm "0.25" → 0.25', s.cbm === 0.25);
check('quantity "3" → qty 3', s.qty === 3);

// ── extractMetricsFromMomoRaw — non-numeric / non-finite → 0 ────────
const bad = extractMetricsFromMomoRaw({ kg: "abc", cbm: NaN, width: Infinity, length: null, height: {} });
check('kg "abc" → 0', bad.weight === 0);
check("cbm NaN → 0", bad.cbm === 0);
check("width Infinity → 0", bad.width === 0);
check("length null → 0", bad.length === 0);
check("height object → 0", bad.height === 0);

// ── extractMetricsFromMomoRaw — qty floor + rounding ────────────────
check("quantity 0 → qty 1 (floor)", extractMetricsFromMomoRaw({ quantity: 0 }).qty === 1);
check("quantity -5 → qty 1 (floor)", extractMetricsFromMomoRaw({ quantity: -5 }).qty === 1);
check("quantity 2.4 → qty 2 (round down)", extractMetricsFromMomoRaw({ quantity: 2.4 }).qty === 2);
check("quantity 2.6 → qty 3 (round up)", extractMetricsFromMomoRaw({ quantity: 2.6 }).qty === 3);
check("quantity missing → qty 1", extractMetricsFromMomoRaw({ kg: 9 }).qty === 1);
check('quantity "abc" → qty 1 (NaN→0→floor 1)', extractMetricsFromMomoRaw({ quantity: "abc" }).qty === 1);

// ── extractWarehouseDatesFromMomoRaw (ภูม flag 2026-06-10) ──────────
// null / non-object / no status_date → both null
{
  const w = extractWarehouseDatesFromMomoRaw(null);
  check("warehouseDates null → {kodang:null, exported:null}", w.kodang === null && w.exported === null);
}
check("warehouseDates string → both null", (() => { const w = extractWarehouseDatesFromMomoRaw("x"); return w.kodang === null && w.exported === null; })());
check("warehouseDates no status_date → both null", (() => { const w = extractWarehouseDatesFromMomoRaw({ kg: 5 }); return w.kodang === null && w.exported === null; })());

// kodang present, exported empty → exported falls back to prepare_export
{
  const w = extractWarehouseDatesFromMomoRaw({
    status_date: { waiting: "2026-06-01", kodang: "2026-06-02", prepare_export: "2026-06-05", exported: "" },
  });
  check("kodang → 2026-06-02", w.kodang === "2026-06-02");
  check("exported empty → falls back to prepare_export 2026-06-05", w.exported === "2026-06-05");
}

// exported present → wins over prepare_export
{
  const w = extractWarehouseDatesFromMomoRaw({
    status_date: { kodang: "2026-06-02", prepare_export: "2026-06-05", exported: "2026-06-07" },
  });
  check("exported present → 2026-06-07 (wins over prepare_export)", w.exported === "2026-06-07");
}

// both kodang + exported empty → both null (parcel not yet in/out)
{
  const w = extractWarehouseDatesFromMomoRaw({ status_date: { kodang: "", exported: "", prepare_export: "" } });
  check("all empty status_date → both null", w.kodang === null && w.exported === null);
}

// whitespace-only values coerce to null
{
  const w = extractWarehouseDatesFromMomoRaw({ status_date: { kodang: "   ", exported: "  " } });
  check("whitespace-only → null", w.kodang === null && w.exported === null);
}

// the ภูม example (status 7, exported empty, prepare_export set)
{
  const w = extractWarehouseDatesFromMomoRaw({
    status_date: {
      waiting: "2026-06-09 17:14:36", kodang: "2026-06-09 17:14:36", morgbox: "",
      wooden_create: "", prepare_export: "2026-06-09 17:27:47", exported: "",
    },
  });
  check("ภูม example: kodang = 2026-06-09 17:14:36", w.kodang === "2026-06-09 17:14:36");
  check("ภูม example: exported→prepare_export = 2026-06-09 17:27:47", w.exported === "2026-06-09 17:27:47");
}

// ── momoRawDisplay (ภูม flag 2026-06-11) — readable view-model ──────
// The ภูม screenshot row (status 7, ship, fda, qty 2).
{
  const d = momoRawDisplay({
    _id: "6a17f8e1f5bfa90738ba7a9e",
    user_code: "10601", user_group: "PR", status: 7, tracking: "1779955936",
    images: ["https://api.momocargo.com/images/x.jpg"],
    wooden_create: false, wooden_info: null, ship_by: "ship", quantity: 2,
    extra_cost: 0, kg: 100, cbm: 0.310856, width: 91, length: 61, height: 28,
    type: "fda", container_no: "PR20260527-SEA02", sack_no: "", sack_size: null,
    CG_NO: "CG79961479667-CG79961479668",
    created_date: "2026-05-28 16:12:17", updated_date: "2026-05-28 21:39:35",
    status_date: { waiting: "2026-05-28 16:12:17", kodang: "2026-05-28 17:44:42", mergebox: "" },
  });
  check("display: memberCode = PR10601", d.memberCode === "PR10601");
  check("display: statusCode = 7", d.statusCode === 7);
  check("display: shipByLabel = เรือ", d.shipByLabel === "เรือ");
  check("display: productType = fda", d.productType === "fda");
  check("display: cgNo passthrough", d.cgNo === "CG79961479667-CG79961479668");
  check("display: weight 100 / cbm 0.310856 / qty 2", d.weight === 100 && d.cbm === 0.310856 && d.qty === 2);
  check("display: woodenCreate false", d.woodenCreate === false);
  check("display: images 1 url", d.images.length === 1);
  check("display: phases ordered 6 (waiting→exported)", d.phases.length === 6 && d.phases[0].key === "waiting" && d.phases[5].key === "exported");
  check("display: kodang phase has its timestamp", d.phases.find((p) => p.key === "kodang")?.at === "2026-05-28 17:44:42");
  check("display: unreached phase (exported) → null", d.phases.find((p) => p.key === "exported")?.at === null);
}
// defensive: null / non-object raw never throws
{
  const d = momoRawDisplay(null);
  check("display: null raw → safe defaults (qty 1, no throw)", d.qty === 1 && d.memberCode === "" && d.phases.length === 6);
}
check("display: car → รถ", momoRawDisplay({ ship_by: "car" }).shipByLabel === "รถ");
check("display: unknown ship_by passes through", momoRawDisplay({ ship_by: "boat" }).shipByLabel === "boat");

// ── momoRawDisplay · container_closed shape (ภูม flag 2026-06-11) ───
// The container endpoint sends total_kg/total_cbm/total_parcel + cid_code/fid/
// cid + container_details{} — NOT the per-parcel fields. The ภูม screenshot row.
{
  const c = momoRawDisplay({
    _id: "6a167cda4375ce132ae0a792",
    fid: "PR20260527-SEA01", cid: "GZS260525-2", cid_code: "JXLU6157980",
    company: "69fda549349f205edba23ddd", ship_by: "ship",
    total_kg: 5, total_cbm: 0.0216, total_parcel: 1, images: [],
    container_details: {
      ETD_CN_KODANG: "2026-05-27 13:16:37", ESTIMATE_DATE: "2026-06-10",
      VESSEL_NO: "", BL_NO: "",
    },
  });
  check("container: isContainer true", c.isContainer === true);
  check("container: weight ← total_kg 5", c.weight === 5);
  check("container: cbm ← total_cbm 0.0216", c.cbm === 0.0216);
  check("container: qty ← total_parcel 1", c.qty === 1);
  check("container: tracking ← cid_code", c.tracking === "JXLU6157980");
  check("container: containerNo ← fid", c.containerNo === "PR20260527-SEA01");
  check("container: cabinet ← cid", c.cabinet === "GZS260525-2");
  check("container: realContainerNo ← cid_code", c.realContainerNo === "JXLU6157980");
  check("container: etdCn ← ETD_CN_KODANG", c.etdCn === "2026-05-27 13:16:37");
  check("container: etaThEstimate ← ESTIMATE_DATE", c.etaThEstimate === "2026-06-10");
  check("container: shipByLabel เรือ", c.shipByLabel === "เรือ");
  check("container: no productType / cgNo", c.productType === "" && c.cgNo === "");
}
// import_track row stays parcel-shaped (not a container)
check("import_track: isContainer false", momoRawDisplay({ tracking: "1779955936", kg: 100, quantity: 2 }).isContainer === false);

// ── flattenMomoRaw / collectMomoRawColumns · "คลี่ทุก field" (พี่ป๊อป 2026-06-11) ──
{
  const flat = flattenMomoRaw({
    _id: "abc123", tracking: "1779", kg: 100, closed: true, missing: null,
    images: ["a.jpg", "b.jpg"], empties: [],
    status_date: { kodang: "2026-06-05 09:18:27", exported: "" },
    track_details: [{ reTrack: "T1", kg: 5 }],
  });
  const m = Object.fromEntries(flat);
  check("flatten: drops top-level _id", !("_id" in m));
  check("flatten: scalar tracking", m.tracking === "1779");
  check("flatten: number → string", m.kg === "100");
  check("flatten: boolean → 'true'", m.closed === "true");
  check("flatten: null → empty string", m.missing === "");
  check("flatten: primitive array joined", m.images === "a.jpg, b.jpg");
  check("flatten: empty array → []", m.empties === "[]");
  check("flatten: nested dot-key", m["status_date.kodang"] === "2026-06-05 09:18:27");
  check("flatten: nested empty string kept", m["status_date.exported"] === "");
  check("flatten: array-of-objects → JSON", m.track_details === JSON.stringify([{ reTrack: "T1", kg: 5 }]));
  check("flatten: key order follows raw (tracking before kg)",
    flat.findIndex(([k]) => k === "tracking") < flat.findIndex(([k]) => k === "kg"));
  check("flatten: non-object → []", flattenMomoRaw(null).length === 0);
  check("flatten: nested _id dropped",
    !flattenMomoRaw({ a: { _id: "x", v: 1 } }).some(([k]) => k.endsWith("_id")));

  // union of columns across rows with DIFFERENT keys (MOMO keys inconsistently)
  const cols = collectMomoRawColumns([
    { tracking: "1", kg: 5 },
    { tracking: "2", cbm: 0.1 },          // no kg, adds cbm
    { fid: "PR-1", total_kg: 9 },         // container shape — all new keys
  ]);
  check("collectColumns: union preserves first-seen order",
    JSON.stringify(cols) === JSON.stringify(["tracking", "kg", "cbm", "fid", "total_kg"]));
  check("collectColumns: no duplicate keys", new Set(cols).size === cols.length);
}

// ── momoSpreadRow / formatMomoSpreadValue · readable spread (พี่ป๊อป 2026-06-11) ──
{
  const sr = momoSpreadRow({ user_code: "107", user_group: "PR", tracking: "1779", ship_by: "ship" });
  const m = Object.fromEntries(sr);
  check("spread: merges user_group+user_code → member_code PR107", m.member_code === "PR107");
  check("spread: drops raw user_code", !("user_code" in m));
  check("spread: drops raw user_group", !("user_group" in m));
  check("spread: member_code lands at first user position (before tracking)",
    sr.findIndex(([k]) => k === "member_code") < sr.findIndex(([k]) => k === "tracking"));
  check("spread: non-user fields pass through", m.tracking === "1779" && m.ship_by === "ship");
  // a container row has no user_* → no member_code synthesised
  check("spread: no member_code when no user fields",
    !momoSpreadRow({ fid: "PR-1", total_kg: 9 }).some(([k]) => k === "member_code"));

  const scols = collectMomoSpreadColumns([
    { user_group: "PR", user_code: "1", tracking: "a" },
    { fid: "PR-1", total_kg: 9 },
  ]);
  check("spreadColumns: union with merged member_code",
    JSON.stringify(scols) === JSON.stringify(["member_code", "tracking", "fid", "total_kg"]));

  // value formatter: ship_by → Thai, true/false → ใช่/ไม่
  check("format: ship_by ship → เรือ", formatMomoSpreadValue("ship_by", "ship") === "เรือ");
  check("format: ship_by car → รถ", formatMomoSpreadValue("ship_by", "car") === "รถ");
  check("format: ship_by air → เครื่องบิน", formatMomoSpreadValue("ship_by", "air") === "เครื่องบิน");
  check("format: unknown ship_by passes through", formatMomoSpreadValue("ship_by", "boat") === "boat");
  check("format: true → ใช่", formatMomoSpreadValue("closed", "true") === "ใช่");
  check("format: false → ไม่", formatMomoSpreadValue("wooden_create", "false") === "ไม่");
  check("format: non-bool non-ship value untouched", formatMomoSpreadValue("kg", "869.5") === "869.5");
  check("format: empty stays empty", formatMomoSpreadValue("note", "") === "");

  // Thai dictionary covers the date keys พี่ป๊อป couldn't read
  check("dict: status_date.kodang has Thai", (MOMO_FIELD_TH["status_date.kodang"] ?? "").includes("เข้าโกดังจีน"));
  check("dict: status_date.exported has Thai", (MOMO_FIELD_TH["status_date.exported"] ?? "").includes("ออกจากจีน"));
  check("dict: created_date + updated_date have Thai",
    !!MOMO_FIELD_TH["created_date"] && !!MOMO_FIELD_TH["updated_date"]);
  check("dict: member_code labelled ลูกค้า", (MOMO_FIELD_TH["member_code"] ?? "").includes("ลูกค้า"));
  check("dict: status label = สถานะ (word view, no เลข)", MOMO_FIELD_TH["status"] === "สถานะ");

  // deriveModeFromCid — authoritative mode from the real cabinet (พี่ป๊อป ship_by-mismatch flag)
  check("cid: GZS → เรือ", deriveModeFromCid("GZS260605-1") === "เรือ");
  check("cid: GZE → รถ", deriveModeFromCid("GZE260605-1") === "รถ");
  check("cid: lowercase gzs → เรือ", deriveModeFromCid("gzs260605-1") === "เรือ");
  check("cid: unknown prefix → null", deriveModeFromCid("ABC123") === null);
  check("cid: empty → null", deriveModeFromCid("") === null);

  // deriveTransportTypeFromCabinet — legacy code for the commit fix (พี่ป๊อป #1)
  check("transport: GZS → '2' (sea)", deriveTransportTypeFromCabinet("GZS260528-1") === "2");
  check("transport: GZE → '1' (truck)", deriveTransportTypeFromCabinet("GZE260605-1") === "1");
  check("transport: unknown → null (falls back to ship_by)", deriveTransportTypeFromCabinet("PR20260605-SEA01") === null);
  check("transport: null → null", deriveTransportTypeFromCabinet(null) === null);

  // buildTrackingCabinetMap — tracking → real cabinet (พี่ป๊อป #4)
  const cabMap = buildTrackingCabinetMap([
    { cid: "GZS260528-1", track_details: [{ reTrack: "0004065", kg: 869.5 }] },
    { cid: "GZS260606-1", track_details: [{ reTrack: "1780629608", kg: 28 }, { reTrack: "1780555730", kg: 17 }] },
    { cid: "", track_details: [{ reTrack: "SKIP", kg: 1 }] },   // no cid → skipped
    { /* no cid/track_details */ },
  ]);
  check("cabMap: 0004065 → GZS260528-1 (the proven sea parcel)", cabMap["0004065"] === "GZS260528-1");
  check("cabMap: multi-track container maps all", cabMap["1780629608"] === "GZS260606-1" && cabMap["1780555730"] === "GZS260606-1");
  check("cabMap: container without cid skipped", !("SKIP" in cabMap));
  check("cabMap: mode of 0004065 cabinet = เรือ (proves ship_by=รถ was wrong)", deriveModeFromCid(cabMap["0004065"]) === "เรือ");
}

{
  // aggregateTrackDetailMetrics — track_details[] → {tracking → kg/cbm}
  // The metric back-fill (2026-06-29 · ภูม): warehouse weight/cbm was 0 in
  // tb_forwarder because the harvest dropped kg/cbm + missed split trackings.

  // (a) bare tracking (single parcel) → one key = its own metric (the ภูม case)
  const bare = aggregateTrackDetailMetrics([
    { reTrack: "1781683835", kg: 515, cbm: 1.626768 },
  ]);
  check("metrics: bare tracking keeps its own kg", bare["1781683835"]?.kg === 515);
  check("metrics: bare tracking keeps its own cbm", bare["1781683835"]?.cbm === 1.626768);
  check("metrics: bare tracking emits ONE key (no phantom base)", Object.keys(bare).length === 1);

  // (b) split "-i/n" → exact suffix keys (own metric) + BASE key (SUM)
  const split = aggregateTrackDetailMetrics([
    { reTrack: "1781515241-1/3", kg: 554, cbm: 2.036604 },
    { reTrack: "1781515241-2/3", kg: 338, cbm: 2.085096 },
    { reTrack: "1781515241-3/3", kg: 79, cbm: 0.221646 },
  ]);
  check("metrics: split exact key keeps per-parcel kg", split["1781515241-1/3"]?.kg === 554);
  check("metrics: split BASE key = SUM of parcels", split["1781515241"]?.kg === 554 + 338 + 79);
  check("metrics: split BASE cbm = SUM of parcels", Math.abs((split["1781515241"]?.cbm ?? 0) - (2.036604 + 2.085096 + 0.221646)) < 1e-9);

  // (c) legit hyphenated tracking (NOT a split-suffix) is left intact
  const legit = aggregateTrackDetailMetrics([
    { reTrack: "CBX260620-SEA07", kg: 1.5, cbm: 0.021216 },
  ]);
  check("metrics: 'CBX...-SEA07' is NOT base-stripped", legit["CBX260620-SEA07"]?.kg === 1.5);
  check("metrics: 'CBX...-SEA07' emits no phantom base", Object.keys(legit).length === 1);

  // (d) missing/garbage kg/cbm → 0, empty/garbage rows skipped (no crash)
  const messy = aggregateTrackDetailMetrics([
    { reTrack: "AAA" },                          // no kg/cbm → 0/0
    { reTrack: "", kg: 99 },                      // empty reTrack → skip
    null, "x", { kg: 5 },                          // garbage → skip
    { reTrack: "BBB", kg: "10" as unknown as number }, // non-number kg → 0
  ]);
  check("metrics: missing kg defaults 0", messy["AAA"]?.kg === 0);
  check("metrics: empty/garbage rows skipped", !("" in messy) && Object.keys(messy).length === 2);
  check("metrics: non-number kg → 0", messy["BBB"]?.kg === 0);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

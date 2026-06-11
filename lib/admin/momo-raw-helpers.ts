/**
 * Wave 30.5 — pure MOMO-raw field derivations (NO `server-only`).
 *
 * WHY A SEPARATE MODULE
 * ─────────────────────
 * These two helpers translate a MOMO Status-Sync `raw` JSON blob into the
 * shape tb_forwarder needs (transport-type code + package metrics). They are
 * pure `(raw) → value` functions — no DB, no session, no side effects.
 *
 * They USED to live in `lib/admin/commit-momo-row-core.ts`, but that module
 * has `import "server-only"` at the top, which THROWS the moment it's loaded
 * under plain `tsx`/Node (the `server-only` package resolves its `default`
 * export condition → `index.js` throws). That makes anything in it
 * impossible to cover with a `tsx`-run unit test.
 *
 * So the pure logic lives HERE (no `server-only`), the core imports it, and
 * `momo-raw-helpers.test.ts` exercises it directly. The core keeps the
 * DB-touching commit body (which legitimately needs `server-only`).
 *
 * @see lib/admin/commit-momo-row-core.ts — the consumer (the commit body)
 * @see lib/admin/momo-raw-helpers.test.ts — the unit test for this module
 */

/**
 * Derive tb_forwarder.ftransporttype ("1"|"2") from MOMO's raw `ship_by`.
 *
 * MOMO ships use "car"/"ship"/"air" — legacy tb_forwarder.ftransporttype
 * uses "1" (truck/EK) or "2" (sea). Air is rare in cargo → bucket to "1".
 * Anything unrecognised (missing key, non-object, unknown string) → "1".
 */
export function deriveTransportTypeFromMomoRaw(raw: unknown): "1" | "2" {
  if (!raw || typeof raw !== "object") return "1";
  const r = raw as Record<string, unknown>;
  const shipBy = typeof r.ship_by === "string" ? r.ship_by.toLowerCase() : "";
  if (shipBy === "ship") return "2";
  return "1";
}

// ────────────────────────────────────────────────────────────
// momoRawDisplay — a human-readable view-model of a MOMO raw blob
// (ภูม flag 2026-06-11). The /api-forwarder-momo Sync-Preview table
// surfaces the important MOMO fields as columns + a full readable detail
// so staff can cross-check every value before commit — instead of squinting
// at the raw JSON. Pure (no server-only) so the client preview table imports
// it directly; unit-tested in momo-raw-helpers.test.ts.
// ────────────────────────────────────────────────────────────

/** MOMO `ship_by` → Thai label. */
export const MOMO_SHIP_BY_TH: Record<string, string> = {
  ship: "เรือ",
  car:  "รถ",
  air:  "เครื่องบิน",
};

/** The MOMO warehouse lifecycle, in order, with Thai labels (keys = status_date.*). */
export const MOMO_PHASE_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "waiting",        label: "รอเข้าโกดังจีน" },
  { key: "kodang",         label: "เข้าโกดังจีน" },
  { key: "mergebox",       label: "รวมกล่อง/รวมตู้" },
  { key: "wooden_create",  label: "ตีลังไม้" },
  { key: "prepare_export", label: "เตรียมออก (ขึ้นรอบ)" },
  { key: "exported",       label: "ออกจากจีน → มาไทย" },
];

export type MomoRawDisplay = {
  userCode:     string;       // MOMO user_code (digits) — e.g. "10601"
  userGroup:    string;       // member prefix — e.g. "PR"
  memberCode:   string;       // userGroup + userCode — e.g. "PR10601"
  statusCode:   number | null;// MOMO numeric lifecycle status — e.g. 7
  tracking:     string;       // เลขพัสดุจีน
  shipBy:       string;       // raw "ship"/"car"/"air"
  shipByLabel:  string;       // Thai label, falls back to the raw string
  productType:  string;       // raw `type` — e.g. "fda" (กลุ่มต้องขอ อย.)
  cgNo:         string;       // CG_NO — เลขพัสดุย่อยจีน
  containerNo:  string;       // เลขตู้/รอบ
  sackNo:       string;       // เลขกระสอบรวม
  sackSize:     string;       // ขนาดกระสอบ
  weight:       number;       // kg
  cbm:          number;       // คิว
  width:        number;
  length:       number;
  height:       number;
  qty:          number;       // quantity
  extraCost:    number;       // extra_cost
  woodenCreate: boolean;      // ตีลังไม้แล้ว?
  woodenInfo:   string;       // รายละเอียดลังไม้
  images:       string[];     // รูปพัสดุที่โกดังจีน
  createdDate:  string;       // MOMO created_date
  updatedDate:  string;       // MOMO updated_date
  /** Ordered lifecycle phases with their timestamps (null when not reached). */
  phases:       Array<{ key: string; label: string; at: string | null }>;

  // ── Container-closed shape (ภูม flag 2026-06-11) ──
  // The container_closed endpoint sends a DIFFERENT raw than import_track:
  // aggregate `total_kg`/`total_cbm`/`total_parcel`, `cid_code`/`fid`/`cid`,
  // and a `container_details{}` block — NO per-parcel tracking/kg/quantity/type/
  // CG_NO/status_date. The fields below carry the container-only info; the
  // shared metric fields (weight/cbm/qty/tracking/containerNo) fall back to the
  // container values so the same columns populate for both shapes.
  isContainer:     boolean;   // true = a container_closed record (aggregate)
  cabinet:         string;    // container: raw.cid (real cabinet e.g. "GZS260525-2")
  realContainerNo: string;    // container: raw.cid_code (vessel container "JXLU6157980")
  etdCn:           string;    // container_details ETD from China
  etaThEstimate:   string;    // container_details estimated arrival Thailand
  vesselNo:        string;    // container_details vessel no
  blNo:            string;    // container_details B/L no
};

/**
 * Build a readable display view-model from a MOMO raw blob. Every field is
 * read defensively (missing / wrong-typed → empty/zero), so a partial or
 * malformed raw never throws. The MOMO internal `_id` is intentionally NOT
 * surfaced (it carries no operational meaning for staff).
 */
export function momoRawDisplay(raw: unknown): MomoRawDisplay {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const numOr0 = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
    return 0;
  };

  const metrics   = extractMetricsFromMomoRaw(raw);
  const shipBy    = str(r.ship_by).toLowerCase();
  const userCode  = str(r.user_code);
  const userGroup = str(r.user_group);

  const sd = (r.status_date && typeof r.status_date === "object" ? r.status_date : {}) as Record<string, unknown>;
  const phases = MOMO_PHASE_ORDER.map((p) => {
    const at = str(sd[p.key]).trim();
    return { key: p.key, label: p.label, at: at.length > 0 ? at : null };
  });

  const images = Array.isArray(r.images) ? r.images.filter((x): x is string => typeof x === "string") : [];

  // Container-closed records carry aggregate totals + a container_details block
  // instead of per-parcel fields. Detect + read those so the shared columns
  // (weight/cbm/qty/tracking/containerNo) populate for both shapes.
  const isContainer = "total_kg" in r || "cid_code" in r || "container_details" in r;
  const cd = (r.container_details && typeof r.container_details === "object"
    ? r.container_details : {}) as Record<string, unknown>;
  // container_details keys are UPPER_CASE in the raw (ETD_CN_KODANG …); read
  // lowercase too in case a future payload normalises them.
  const cdGet = (...keys: string[]): string => {
    for (const k of keys) { const v = str(cd[k]).trim(); if (v) return v; }
    return "";
  };
  const containerParcel = Math.round(numOr0(r.total_parcel));

  return {
    userCode,
    userGroup,
    memberCode:   userGroup && userCode ? `${userGroup}${userCode}` : userCode || userGroup,
    statusCode:   typeof r.status === "number" ? r.status : (str(r.status) ? Number(str(r.status)) : null),
    // import_track: raw.tracking · container: raw.cid_code (the vessel container no)
    tracking:     str(r.tracking) || str(r.cid_code),
    shipBy,
    shipByLabel:  MOMO_SHIP_BY_TH[shipBy] ?? (shipBy || "—"),
    productType:  str(r.type),
    cgNo:         str(r.CG_NO),
    // import_track: raw.container_no · container: raw.fid (the cabinet/รอบ code)
    containerNo:  str(r.container_no) || str(r.fid),
    sackNo:       str(r.sack_no),
    sackSize:     str(r.sack_size),
    // weight/cbm: import_track per-parcel · container aggregate total_*
    weight:       metrics.weight || numOr0(r.total_kg),
    cbm:          metrics.cbm    || numOr0(r.total_cbm),
    width:        metrics.width,
    length:       metrics.length,
    height:       metrics.height,
    // qty: container total_parcel wins (metrics.qty floors to 1 when no `quantity`)
    qty:          containerParcel > 0 ? containerParcel : metrics.qty,
    extraCost:    numOr0(r.extra_cost),
    woodenCreate: r.wooden_create === true,
    woodenInfo:   str(r.wooden_info),
    images,
    createdDate:  str(r.created_date),
    updatedDate:  str(r.updated_date),
    phases,

    isContainer,
    cabinet:         str(r.cid),
    realContainerNo: str(r.cid_code),
    etdCn:         cdGet("ETD_CN_KODANG", "etd_cn_kodang"),
    etaThEstimate: cdGet("ESTIMATE_DATE", "estimate_date", "eta_th_kodang", "ETA_TH_KODANG"),
    vesselNo:      cdGet("VESSEL_NO", "vessel_no"),
    blNo:          cdGet("BL_NO", "bl_no"),
  };
}

// ────────────────────────────────────────────────────────────
// flattenMomoRaw / collectMomoRawColumns — the "คลี่ทุก field" audit view
// (พี่ป๊อป flag 2026-06-11). MOMO staff key inconsistently, so before we
// decide which fields to trust, we spread EVERY field MOMO sends into one
// long row. These helpers flatten a raw blob into dot-keyed string cells
// (the MOMO internal `_id` is the only field dropped — พี่ป๊อป: "ยกเว้น _id")
// and compute the union of columns across many rows so a field that appears
// in only some rows still gets its own column (blank where MOMO didn't key it).
// Pure + unit-tested → the client raw-spread table imports them directly.
// ────────────────────────────────────────────────────────────

/** Render an array cell: primitives joined, arrays-of-objects as compact JSON. */
function formatRawArray(arr: unknown[]): string {
  if (arr.length === 0) return "[]";
  const allPrimitive = arr.every((x) => x === null || typeof x !== "object");
  if (allPrimitive) return arr.map((x) => (x == null ? "" : String(x))).join(", ");
  try { return JSON.stringify(arr); } catch { return "[?]"; }
}

/**
 * Flatten a MOMO raw blob into ordered `[dotKey, stringValue]` pairs.
 *
 * - Nested objects → dot keys (`status_date.kodang`, `container_details.BL_NO`).
 * - Arrays → one cell (primitives joined; objects → compact JSON) — never
 *   exploded into per-index columns (that would blow the column count up).
 * - `_id` is dropped at every level (พี่ป๊อป: keep everything except `_id`).
 * - null/undefined → "" ; boolean → "true"/"false" ; empty object → "{}".
 * - A non-object raw yields []. Key order follows the raw's own key order
 *   (so the spread mirrors how MOMO laid the record out).
 */
export function flattenMomoRaw(raw: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (val: unknown, prefix: string): void => {
    if (val === null || val === undefined) { out.push([prefix, ""]); return; }
    if (Array.isArray(val)) { out.push([prefix, formatRawArray(val)]); return; }
    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => k !== "_id");
      if (keys.length === 0) { out.push([prefix, "{}"]); return; }
      for (const k of keys) walk(obj[k], prefix ? `${prefix}.${k}` : k);
      return;
    }
    if (typeof val === "boolean") { out.push([prefix, val ? "true" : "false"]); return; }
    out.push([prefix, String(val)]);
  };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    for (const k of Object.keys(obj).filter((k) => k !== "_id")) walk(obj[k], k);
  }
  return out;
}

/** flattenMomoRaw as a `{ dotKey: value }` map (for per-row column lookup). */
export function flattenMomoRawMap(raw: unknown): Record<string, string> {
  return Object.fromEntries(flattenMomoRaw(raw));
}

/**
 * Ordered union of every flattened column across many MOMO raws — first-seen
 * order preserved. A column that appears in only some rows is still included
 * (so the audit grid shows where MOMO's keying is inconsistent / missing).
 */
export function collectMomoRawColumns(raws: unknown[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const raw of raws) {
    for (const [k] of flattenMomoRaw(raw)) {
      if (!seen.has(k)) { seen.add(k); order.push(k); }
    }
  }
  return order;
}

// ────────────────────────────────────────────────────────────
// MOMO-aware spread layer (พี่ป๊อป flag 2026-06-11): the raw-spread grid was
// too raw to read — user_group/user_code split apart, English dot-keys, and
// `ship_by: "car"/"ship"` (พี่ป๊อป: "EK=รถ, SEA=เรือ — ใส่ car/ship มาตลก").
// This layer keeps the "คลี่ทุก field" idea but makes it readable:
//   1) merge user_group+user_code → one `member_code` (PR+code = our customer)
//   2) Thai column labels (MOMO_FIELD_TH) — raw key still shown small for audit
//   3) friendly cell values (ship_by → รถ/เรือ · true/false → ใช่/ไม่)
// ────────────────────────────────────────────────────────────

/** Thai labels for MOMO raw dot-keys. Unknown keys fall back to the raw key. */
export const MOMO_FIELD_TH: Record<string, string> = {
  // identity / customer
  member_code:   "ลูกค้า (User)",
  status:        "สถานะ MOMO (เลข)",
  tracking:      "เลขพัสดุจีน",
  CG_NO:         "CG_NO (เลขพัสดุย่อย)",
  // packaging / metrics
  type:          "ประเภทสินค้า",
  ship_by:       "ขนส่ง",
  quantity:      "จำนวน (ชิ้น)",
  extra_cost:    "ค่าใช้จ่ายเพิ่ม",
  kg:            "น้ำหนัก (กก.)",
  cbm:           "ปริมาตร (คิว)",
  width:         "กว้าง (ซม.)",
  length:        "ยาว (ซม.)",
  height:        "สูง (ซม.)",
  wooden_create: "ตีลังไม้",
  wooden_info:   "รายละเอียดลังไม้",
  images:        "รูปสินค้า",
  real_container:"ตู้จริง (MOMO)",
  // routing
  container_no:  "ตู้/รอบ (MOMO)",
  sack_no:       "กระสอบ",
  sack_size:     "ขนาดกระสอบ",
  // timestamps
  created_date:  "วันที่สร้างรายการ",
  updated_date:  "อัปเดตล่าสุด",
  // status_date.* — the China-warehouse lifecycle dates
  "status_date.waiting":        "วันที่ · รอเข้าโกดังจีน",
  "status_date.kodang":         "วันที่ · เข้าโกดังจีน",
  "status_date.mergebox":       "วันที่ · รวมกล่อง/รวมตู้",
  "status_date.wooden_create":  "วันที่ · ตีลังไม้",
  "status_date.prepare_export": "วันที่ · เตรียมออก (ขึ้นรอบ)",
  "status_date.exported":       "วันที่ · ออกจากจีน → มาไทย",
  // ── container_closed shape ──
  fid:           "รหัสรอบ (MOMO ref)",
  cid:           "เลขตู้ (batch)",
  cid_code:      "เลขตู้เรือจริง (container)",
  company:       "รหัสบริษัท (MOMO)",
  total_kg:      "น้ำหนักรวม (กก.)",
  total_cbm:     "ปริมาตรรวม (คิว)",
  total_parcel:  "จำนวนพัสดุรวม",
  closed:        "ปิดตู้แล้ว",
  is_arrival:    "ถึงไทยแล้ว",
  loading_date:  "วันที่โหลดตู้",
  created_by:    "สร้างโดย",
  updated_by:    "อัปเดตโดย",
  note:          "หมายเหตุ",
  track_details: "รายการพัสดุในตู้",
  __v:           "เวอร์ชัน (ระบบ MOMO)",
  "container_details.ETD_CN_KODANG":  "ออกจากโกดังจีน (ETD)",
  "container_details.ESTIMATE_DATE":  "ถึงไทยโดยประมาณ (ETA)",
  "container_details.VESSEL_NO":      "ชื่อเรือ",
  "container_details.BL_NO":          "เลข B/L",
  "container_details.ETD_IMMIGRATION":"ออกจากด่าน ตม. (ETD)",
  "container_details.TRANSSHIPMENT":  "ท่าเปลี่ยนถ่าย",
  "container_details.ETA_IMMIGRATION":"ถึงด่าน ตม. (ETA)",
  "container_details.ETA_TH_KODANG":  "ถึงโกดังไทย (ETA)",
  // ── sack_info shape ──
  sack_id:       "เลขกระสอบ",
  weight:        "น้ำหนัก (กก.)",
  description:   "รายละเอียด",
  closed_date:   "วันที่ปิดกระสอบ",
  is_export:     "ส่งออกแล้ว",
  tracks:        "พัสดุในกระสอบ",
};

/**
 * MOMO-aware flattened row: same as flattenMomoRaw but merges the customer
 * identity (`user_group` + `user_code`) into a single `member_code` cell
 * (placed where the first of the two appeared), dropping both originals.
 * Everything else passes through unchanged, key order preserved.
 */
export function momoSpreadRow(raw: unknown): Array<[string, string]> {
  const flat = flattenMomoRaw(raw);
  const map = Object.fromEntries(flat);
  const hasUser = "user_group" in map || "user_code" in map;
  const member = `${map["user_group"] ?? ""}${map["user_code"] ?? ""}`;
  const out: Array<[string, string]> = [];
  let mergedDone = false;
  for (const [k, v] of flat) {
    if (k === "user_group" || k === "user_code") {
      if (hasUser && !mergedDone) { out.push(["member_code", member]); mergedDone = true; }
      continue;
    }
    out.push([k, v]);
  }
  return out;
}

/** momoSpreadRow as a `{ key: value }` map. */
export function momoSpreadRowMap(raw: unknown): Record<string, string> {
  return Object.fromEntries(momoSpreadRow(raw));
}

/** Ordered union of momoSpreadRow columns across many raws (first-seen order). */
export function collectMomoSpreadColumns(raws: unknown[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const raw of raws) {
    for (const [k] of momoSpreadRow(raw)) {
      if (!seen.has(k)) { seen.add(k); order.push(k); }
    }
  }
  return order;
}

/** Friendly cell value for the spread grid: ship_by → Thai, true/false → ใช่/ไม่. */
export function formatMomoSpreadValue(key: string, value: string): string {
  if (value === "") return value;
  if (key === "ship_by") return MOMO_SHIP_BY_TH[value.toLowerCase()] ?? value;
  if (value === "true")  return "ใช่";
  if (value === "false") return "ไม่";
  return value;
}

/** Package metrics extracted from a MOMO raw blob. */
export type MomoMetrics = {
  weight: number;
  cbm:    number;
  width:  number;
  length: number;
  height: number;
  qty:    number;
};

/** Warehouse-phase dates lifted from a MOMO raw blob's `status_date`. */
export type MomoWarehouseDates = {
  /** เข้าโกดังจีน — when the parcel arrived at the China warehouse. status_date.kodang */
  kodang:   string | null;
  /** ออกจากโกดังจีน — when the parcel left the China warehouse (shipped out).
   *  status_date.exported, falling back to status_date.prepare_export. Null
   *  while the parcel is still sitting in the China warehouse. */
  exported: string | null;
};

/**
 * Extract the warehouse-IN / warehouse-OUT dates from a MOMO raw blob.
 *
 * 2026-06-10 ภูม flag — the commit used to write the SAME date
 * (momo_updated_at = latest phase) into BOTH fdatestatus2 (เข้าโกดัง) and
 * fdatestatus3 (ออกโกดัง), so they always rendered identical. MOMO's raw
 * actually carries distinct phase timestamps under `status_date`:
 *   waiting → kodang → mergebox → wooden_create → prepare_export → exported
 * We map:
 *   fdatestatus2 (เข้าโกดังจีน)   ← status_date.kodang
 *   fdatestatus3 (ออกจากโกดังจีน) ← status_date.exported || prepare_export
 *
 * Empty strings / null / non-object → null for that phase. A null raw yields
 * both-null (the caller then falls back to its own manifest date for kodang).
 */
export function extractWarehouseDatesFromMomoRaw(raw: unknown): MomoWarehouseDates {
  const empty: MomoWarehouseDates = { kodang: null, exported: null };
  if (!raw || typeof raw !== "object") return empty;
  const sd = (raw as Record<string, unknown>).status_date;
  if (!sd || typeof sd !== "object") return empty;
  const s = sd as Record<string, unknown>;
  const pick = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  return {
    kodang:   pick(s.kodang),
    exported: pick(s.exported) ?? pick(s.prepare_export),
  };
}

/**
 * Extract package metrics (kg, cbm, w/l/h, qty) from a MOMO raw blob.
 *
 * - Numbers pass through (when finite); numeric strings are coerced.
 * - Anything non-numeric → 0.
 * - qty floors at 1 and rounds (a forwarder row is at least one package).
 * - A null / non-object raw yields the zero-metrics default (qty 1).
 */
export function extractMetricsFromMomoRaw(raw: unknown): MomoMetrics {
  const empty: MomoMetrics = { weight: 0, cbm: 0, width: 0, length: 0, height: 0, qty: 1 };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  return {
    weight: num(r.kg),
    cbm:    num(r.cbm),
    width:  num(r.width),
    length: num(r.length),
    height: num(r.height),
    qty:    Math.max(1, Math.round(num(r.quantity))),
  };
}

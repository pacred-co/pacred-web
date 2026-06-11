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

  return {
    userCode,
    userGroup,
    memberCode:   userGroup && userCode ? `${userGroup}${userCode}` : userCode || userGroup,
    statusCode:   typeof r.status === "number" ? r.status : (str(r.status) ? Number(str(r.status)) : null),
    tracking:     str(r.tracking),
    shipBy,
    shipByLabel:  MOMO_SHIP_BY_TH[shipBy] ?? (shipBy || "—"),
    productType:  str(r.type),
    cgNo:         str(r.CG_NO),
    containerNo:  str(r.container_no),
    sackNo:       str(r.sack_no),
    sackSize:     str(r.sack_size),
    weight:       metrics.weight,
    cbm:          metrics.cbm,
    width:        metrics.width,
    length:       metrics.length,
    height:       metrics.height,
    qty:          metrics.qty,
    extraCost:    numOr0(r.extra_cost),
    woodenCreate: r.wooden_create === true,
    woodenInfo:   str(r.wooden_info),
    images,
    createdDate:  str(r.created_date),
    updatedDate:  str(r.updated_date),
    phases,
  };
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

/**
 * carrier-coverage-guard.ts — the CLOSED-LIST gate for ขนส่งเอกชน.
 *
 * 🔴 OWNER RULE (2026-07-14, verbatim):
 *   "ให้อิง data ตามไฟล์นี้เลย เพราะเอามาจากการทำงานจริงฝั่ง PCS ·
 *    บังคับให้เลือกให้ใส่แค่ที่มีในไฟล์ที่ส่งให้เท่านั้น · ใช้เกณฑ์ตามไฟล์นี้ได้ทั้งหมด ·
 *    ไม่ให้เลือกหรือให้ใส่ นอกเหนือจาก data ตรงนี้"
 *
 * The owner's workbook (`บริษัทขนส่ง_พื้นที่ขนส่ง(จังหวัด).xlsx` → the generated
 * `carrier-province-coverage.ts`) is the **CLOSED, COMPLETE** list of private
 * couriers — NOT an addition to the legacy `api-shipBy.php` table. A carrier that
 * is not in the workbook may not be written; a carrier that is in the workbook but
 * does NOT serve the delivery province may not be written for that province.
 *
 * A UI filter alone is NOT enough (staff/customers can post a raw server action) →
 * this guard is wired into EVERY server action that writes a carrier
 * (`tb_forwarder.fshipby` / `tb_header_order.hshipby`). It is PURE (no IO) so the
 * pickers and the tests import the exact same rule the writers enforce.
 *
 * ── What is NOT gated (deliberate) ───────────────────────────────────────────
 *   1. OWN-FLEET (`PCS` รับเองที่โกดัง · `PCSF` เหมาๆ/PRF · `PCSE` ด่วน/PRE) — Pacred's
 *      own delivery, not "ขนส่งเอกชน". Valid in every province; the BKK/metro-zip +
 *      `derivePayMethodForDelivery` ต้นทาง/COD rules keep working untouched.
 *   2. An EMPTY carrier — "ยังไม่ระบุ" (MOMO commit leaves it blank for เซล to fill).
 *   3. A province we cannot canonicalise (blank, or junk like the "NY" spam rows in
 *      `tb_address`): coverage cannot be checked, so only the CLOSED-LIST half of the
 *      rule is enforced. This keeps messy legacy address data writable while still
 *      refusing an off-workbook carrier. (The picker shows an empty list + an
 *      empty-state telling staff to fix the province — see `ship-by-eligibility`.)
 *   4. A pure CARRY of an already-stored value (e.g. spawning a forwarder row from a
 *      shop order whose `hshipby` is legacy free-text like "สมใจสาย4"). Callers pass
 *      `previous` so re-writing an existing value never blocks; only a CHANGE is gated.
 *      Existing rows must keep rendering + flowing (they hold ~35 free-text carriers on
 *      prod: "สมใจสาย4" ×12 · "เรียกรถขนส่ง" ×5 · "เคพีเอ็น" ×2 · …).
 */

import {
  CARRIER_PROVINCE_COVERAGE,
  canonicalProvince,
  carriersForProvince,
  type CarrierCoverage,
} from "@/lib/forwarder/carrier-province-coverage";

/** Pacred's own delivery family — never a "ขนส่งเอกชน", valid in every province. */
export const OWN_FLEET_SHIPBY = ["PCS", "PCSF", "PCSE"] as const;
const OWN_FLEET_SET: ReadonlySet<string> = new Set(OWN_FLEET_SHIPBY);

export function isOwnFleetCarrier(value: string | null | undefined): boolean {
  return OWN_FLEET_SET.has((value ?? "").trim());
}

/** Every `fshipby` code the workbook allows (28). */
export const WORKBOOK_CARRIER_CODES: ReadonlySet<string> = new Set(
  CARRIER_PROVINCE_COVERAGE.map((c) => c.code).filter((c) => c !== ""),
);

/**
 * Resolve a stored carrier value → its workbook row.
 * Matches on the legacy `fshipby` CODE first (what we store), then on the exact
 * workbook NAME (a handful of prod rows store the name as free text).
 */
export function findWorkbookCarrier(
  value: string | null | undefined,
): CarrierCoverage | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    CARRIER_PROVINCE_COVERAGE.find((c) => c.code === v) ??
    CARRIER_PROVINCE_COVERAGE.find((c) => c.name === v) ??
    null
  );
}

/** True when `value` is one of the 28 couriers in the owner's workbook. */
export function isWorkbookCarrier(value: string | null | undefined): boolean {
  return findWorkbookCarrier(value) !== null;
}

export type CarrierCheck = { ok: true } | { ok: false; error: string };

const OK: CarrierCheck = { ok: true };

/**
 * The gate. Returns `{ok:false, error}` (Thai, staff-readable) when `carrier` may
 * not be written for a delivery in `province`.
 *
 * @param carrier  the value about to be written to fshipby / hshipby
 * @param province the delivery province (tb_forwarder.faddressprovince /
 *                 tb_header_order.haddressprovince / tb_address.addressprovince)
 * @param opts.previous the value CURRENTLY stored on the row — when `carrier` equals
 *                 it, the write is a carry, not a choice → always allowed.
 */
export function checkCarrierForProvince(
  carrier: string | null | undefined,
  province: string | null | undefined,
  opts?: { previous?: string | null },
): CarrierCheck {
  const value = (carrier ?? "").trim();

  // (2) not-yet-chosen — legal everywhere (เซล/ลูกค้ากรอกภายหลัง).
  if (!value) return OK;

  // (4) pure carry of the stored value — never block existing data.
  const previous = (opts?.previous ?? "").trim();
  if (previous && previous === value) return OK;

  // (1) Pacred's own delivery — not a private courier.
  if (isOwnFleetCarrier(value)) return OK;

  // ── CLOSED LIST ────────────────────────────────────────────────────────────
  const hit = findWorkbookCarrier(value);
  if (!hit) {
    return {
      ok: false,
      error:
        `บริษัทขนส่ง "${value}" ไม่อยู่ในรายชื่อขนส่งเอกชนที่บริษัทใช้ ` +
        `(ตามไฟล์พื้นที่ขนส่งของเจ้าของ) — กรุณาเลือกจากรายชื่อในระบบเท่านั้น ` +
        `ห้ามพิมพ์ชื่อขนส่งเอง`,
    };
  }

  // ── PROVINCE COVERAGE ──────────────────────────────────────────────────────
  const p = canonicalProvince(province);
  // (3) province unknown → coverage not checkable; the closed list already held.
  if (!p) return OK;

  if (hit.provinces.includes(p)) return OK;

  const serving = carriersForProvince(p).map((c) => c.name);
  const hint =
    serving.length > 0
      ? `ขนส่งที่วิ่ง จ.${p}: ${serving.slice(0, 6).join(" · ")}` +
        (serving.length > 6 ? ` …(อีก ${serving.length - 6})` : "")
      : `ยังไม่มีขนส่งเอกชนที่วิ่ง จ.${p} ในไฟล์พื้นที่ขนส่ง`;

  return {
    ok: false,
    error: `${hit.name} ไม่วิ่ง จ.${p} — ${hint}`,
  };
}

/**
 * Throwing variant for call-sites that are not `{ok,error}`-shaped.
 * Prefer `checkCarrierForProvince` inside a server action so the staff sees the
 * message instead of a 500.
 */
export function assertCarrierServesProvince(
  carrier: string | null | undefined,
  province: string | null | undefined,
  opts?: { previous?: string | null },
): void {
  const res = checkCarrierForProvince(carrier, province, opts);
  if (!res.ok) throw new Error(res.error);
}

/**
 * Range-guarded Zod field schemas for the CARGO per-line COST + DECLARED editor
 * (actions/admin/cargo-cost.ts). Extracted here (NOT in the "use server" action
 * file, which may only export async functions) so they are unit-testable.
 *
 * Why this exists — the money-correctness hole:
 * The cost/declared editor writes the 3-number model's COST + DECLARED basis:
 *   cost feeds margin + PEAK stock-in · declared feeds the ใบขน VAT base.
 * The old schema used ONE generic `z.coerce.number().min(0).max(99_999_999)` for
 * EVERY field — including the FX RATE fields (`cost_rate_cny` ≈ 5 THB/¥,
 * `declared_fx_rate` ≈ 5 THB/¥ … 37 THB/$). A ฿100M ceiling on a ~5 rate means a
 * fat-finger `5 → 500` sails through and silently mis-values
 * `declared_value_thb = amount × rate` (and any cost rollup). These schemas put a
 * SANE per-kind bound on each field (amounts vs rates) and reject int32-overflow
 * garbage with an explicit Thai message — reusing the V-E5 safe-numeric guard.
 *
 * Bounds are deliberately GENEROUS (a legitimate value must never trip the guard):
 *   - amounts  : [0, ฿/¥100M]              (a real per-line cost/declared is far under)
 *   - ¥ rate   : [0, 100]                  (real cost yuan-rate ≈ 4.5–6 · catches 5→500)
 *   - FX rate  : [0, 1000]                 (USD ≈ 37, CNY ≈ 5 · catches int32 + 10×+ typos)
 *   - duty %   : [0, 100]
 * All are OPTIONAL: "" / undefined / null → null (clear), else coerced + validated.
 */

import { z } from "zod";
import { isInt32OverflowSuspect } from "./safe-numeric";

/** ~฿/¥100M — sane per-line cost / declared-THB amount ceiling. */
export const MAX_CARGO_AMOUNT = 99_999_999;
/**
 * Foreign-currency declared AMOUNT ceiling (declared_amount_ccy). Sized to the
 * numeric(16,4) column (~1e12), NOT the THB cap — a WEAK declared currency
 * (JPY≈0.24, KRW≈0.026, IDR≈0.0023, VND≈0.0014 THB/unit · markets explicitly on
 * Pacred's roadmap จีน→ญี่ปุ่น→เกาหลี) makes a legitimate per-line amount large
 * (฿1M in IDR ≈ 434M IDR). The real safety net for the declared FIGURE is the
 * THB side — declared_value_thb stays bounded at ฿100M (cargoDeclaredThb) and the
 * action recomputes it from amount × rate (resolveDeclaredThb). int32-overflow
 * garbage is still rejected here regardless of ceiling.
 */
export const MAX_CARGO_CCY_AMOUNT = 999_999_999_999;
/** ¥→THB cost-rate ceiling (real ≈ 5 · generous bound catches 5→500 typos). */
export const MAX_CNY_COST_RATE = 100;
/** Customs FX-rate ceiling (THB per declared-ccy unit · USD ≈ 37, CNY ≈ 5 · KWD≈120). */
export const MAX_CUSTOMS_FX_RATE = 1000;

const INT32_MSG = "ค่าตัวเลขผิดปกติ (overflow) — กรุณาตรวจค่าที่กรอก";
const emptyToNull = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);

/**
 * Optional non-negative amount: coerced from FormData strings, ""→null,
 * int32-overflow rejected, bounded [0, max]. Returns `number | null`.
 */
export function nullableAmount(max: number, labelTh: string) {
  return z.preprocess(
    emptyToNull,
    z.coerce
      .number({ message: `${labelTh} ต้องเป็นตัวเลข` })
      .refine((n) => !isInt32OverflowSuspect(n), { message: INT32_MSG })
      .refine((n) => n >= 0 && n <= max, {
        message: `${labelTh} อยู่นอกช่วงที่อนุญาต (0 – ${max.toLocaleString()})`,
      })
      .nullable(),
  );
}

/**
 * Optional rate: coerced, ""→null, int32-overflow rejected, bounded [min, max].
 * Returns `number | null`. A rate is where the worst silent mis-valuation hides
 * (declared_value_thb = amount × rate), so the per-kind ceiling matters most here.
 */
export function nullableRate(min: number, max: number, labelTh: string) {
  return z.preprocess(
    emptyToNull,
    z.coerce
      .number({ message: `${labelTh} ต้องเป็นตัวเลข` })
      .refine((n) => !isInt32OverflowSuspect(n), { message: INT32_MSG })
      .refine((n) => n >= min && n <= max, {
        message: `${labelTh} อยู่นอกช่วงที่อนุญาต (${min} – ${max.toLocaleString()})`,
      })
      .nullable(),
  );
}

/** Optional short text (HS code): trimmed, ≤40, ""→null. */
export const nullableShortText = z.preprocess(
  emptyToNull,
  z.string().trim().max(40).nullable(),
);

// ── Named cargo COST + DECLARED field schemas (the 3-number model inputs) ──
/** Per-line cost amount (THB or ¥ unit cost). */
export const cargoCostAmount = nullableAmount(MAX_CARGO_AMOUNT, "ต้นทุน");
/** มูลค่าสำแดง in THB (fallback / direct edit). */
export const cargoDeclaredThb = nullableAmount(MAX_CARGO_AMOUNT, "มูลค่าสำแดง (บาท)");
/** มูลค่าสำแดง in the declared currency (engineer-down) — wide ceiling for weak ccys. */
export const cargoDeclaredCcy = nullableAmount(MAX_CARGO_CCY_AMOUNT, "มูลค่าสำแดง (สกุลเงิน)");
/** Cost-side ¥→THB rate snapshot. */
export const cargoCnyRate = nullableRate(0, MAX_CNY_COST_RATE, "เรทหยวนต้นทุน");
/** Customs FX rate (THB per 1 unit of the declared currency). */
export const cargoCustomsFx = nullableRate(0, MAX_CUSTOMS_FX_RATE, "เรทศุลกากร");
/** อากรขาเข้า percentage. */
export const cargoDutyPct = nullableRate(0, 100, "อากรขาเข้า (%)");
/** อากรขาเข้า in THB. */
export const cargoDutyThb = nullableAmount(MAX_CARGO_AMOUNT, "อากรขาเข้า (บาท)");

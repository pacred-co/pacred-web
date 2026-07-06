/**
 * ค่าเทียบ (KG-vs-CBM comparison threshold) write-guard — the SERVER-SIDE
 * enforcement of ภูม's two client rules (2026-06-19):
 *   1. warehouse staff may NOT edit ค่าเทียบ (read-only, seeded from the stored
 *      value) — only god roles or non-warehouse admins may set/override it;
 *   2. an editable override is capped at ≤350 (1 คิว ไม่เกิน 350 กก.).
 *
 * The forwarder edit page disables the input for warehouse, but `warehouse` is
 * admitted to `adminUpdateForwarderDimensions`, so a crafted POST could bypass
 * the UI gate on a billing-pricing field. This pure helper lets the action mirror
 * the client gate (and lets it be unit-tested without a DB).
 *
 * Pure: imports only the pure isGodRole predicate (no server-only runtime).
 */
import { isGodRole } from "@/lib/admin/god-role";
import type { AdminRole } from "@/lib/auth/require-admin";

/** The client-side cap (per-tracking-editor-client.tsx MAX_COMPARISON). */
export const COMPARISON_CAP = 350;

export interface ResolvedComparisonInput {
  /** The effective customComparison switch to apply ("1"=use typed value, "0"=off,
   *  undefined=caller didn't send it → keep the persisted/stored value). */
  switchInput: "0" | "1" | undefined;
  /** The effective ค่าเทียบ value (undefined when the caller didn't send it). */
  valueInput: number | undefined;
  /** Set when the override exceeds the cap → the action should reject with this. */
  error?: string;
}

/**
 * Resolve the ค่าเทียบ override a caller may apply, given their roles.
 *  - A non-god `warehouse` caller's override is DROPPED (switch+value → undefined)
 *    so the stored value seeds (matches the read-only client for warehouse).
 *  - An editable override above the cap returns an `error` (reject, like the UI).
 */
export function resolveComparisonInput(
  roles: AdminRole[] | null | undefined,
  customComparison: "0" | "1" | undefined,
  userComparisonValue: number | undefined,
  cap: number = COMPARISON_CAP,
): ResolvedComparisonInput {
  const canEdit = isGodRole(roles) || !(roles ?? []).includes("warehouse");

  let switchInput = customComparison;
  let valueInput = userComparisonValue;

  // warehouse (non-god) tried to change ค่าเทียบ → ignore it (use stored value).
  if (switchInput !== undefined && !canEdit) {
    switchInput = undefined;
    valueInput = undefined;
  }

  if (switchInput === "1" && valueInput !== undefined && valueInput > cap) {
    return {
      switchInput,
      valueInput,
      error: `ค่าเทียบเกินเพดาน — 1 คิว ไม่เกิน ${cap} กก. (กรอก ${valueInput})`,
    };
  }

  return { switchInput, valueInput };
}

/**
 * LOCKED PAIR (owner 2026-07-06) — "คิดราคาแบบกำหนดเอง" (custom sell price) และ
 * ค่าเทียบ (comparison) ต้องติ๊กพร้อมกัน หรือไม่ติ๊กทั้งคู่ — ห้ามติ๊กอันเดียว.
 * ไม่ติ๊กทั้งคู่ = ใช้เรทระบบ (auto waterfall · ค่าเทียบ default 250). ติ๊กคู่ =
 * กรอกราคาเอง + ค่าเทียบ (>0).
 *
 * Pure so the server action AND the client forms enforce the same rule. Pass the
 * EFFECTIVE (post-`resolveComparisonInput`) comparison switch server-side so a
 * warehouse caller whose ค่าเทียบ was dropped can't set custom price alone.
 * Returns null when the pair is valid, or an error message when it isn't.
 */
export function validateComparisonPricePair(
  priceOn: boolean,
  comparisonOn: boolean,
  comparisonValue: number | undefined,
): string | null {
  if (priceOn !== comparisonOn) {
    return "ต้องเลือกทั้ง 'คิดราคาแบบกำหนดเอง' และ 'ค่าเทียบ' พร้อมกัน (หรือไม่เลือกทั้งคู่ = ใช้เรทระบบ)";
  }
  if (comparisonOn && !(Number(comparisonValue ?? 0) > 0)) {
    return "กรอกค่าเทียบ (มากกว่า 0) เมื่อกำหนดราคาเอง";
  }
  return null;
}

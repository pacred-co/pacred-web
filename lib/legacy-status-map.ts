/**
 * Legacy PCS Cargo status vocabularies — the D1 faithful-port canonical map.
 *
 * The ported `tb_*` schema stores job status as the legacy single-char codes
 * (`tb_header_order.hstatus` = '1'-'6', `tb_forwarder.fstatus` = '1'-'7'), not
 * the rebuilt-era enum strings (`pending` / `arrived_thailand` / …). This module
 * is the single source of truth mapping legacy code ↔ rebuilt key ↔ Thai label,
 * so every surface renders the exact legacy Thai wording the ~8,898 PCS
 * customers and staff already know.
 *
 * Per docs/research/wave-1-fidelity/_SYNTHESIS.md §7.6 (the B-2 status reconcile
 * bundled with the B-0 data re-point).
 */

export type LegacyOrderCode = "1" | "2" | "3" | "4" | "5" | "6";
export type LegacyForwarderCode = "1" | "2" | "3" | "4" | "5" | "6" | "7";

export interface LegacyStatusEntry {
  /** The rebuilt-era enum key the pre-D1 app used (kept for rollout filtering). */
  key: string;
  /** The legacy PCS Thai label — the wording staff + customers already know. */
  thai: string;
}

/** Shop / cargo order — `tb_header_order.hstatus`. Legacy display order 1→6. */
export const LEGACY_ORDER_STATUS: Record<LegacyOrderCode, LegacyStatusEntry> = {
  "1": { key: "pending", thai: "รอดำเนินการ" },
  "2": { key: "awaiting_payment", thai: "รอชำระเงิน" },
  "3": { key: "ordered", thai: "สั่งสินค้า" },
  "4": { key: "awaiting_china_ship", thai: "รอร้านจีนจัดส่ง" },
  "5": { key: "completed", thai: "สำเร็จ" },
  "6": { key: "cancelled", thai: "ยกเลิก" },
};

/** Import / forwarder — `tb_forwarder.fstatus`. Legacy order: ship → arrive → THEN pay. */
export const LEGACY_FORWARDER_STATUS: Record<LegacyForwarderCode, LegacyStatusEntry> = {
  "1": { key: "awaiting_china_warehouse", thai: "รอสินค้าเข้าโกดังจีน" },
  "2": { key: "at_china_warehouse", thai: "สินค้าถึงโกดังจีน" },
  "3": { key: "in_transit_to_thailand", thai: "กำลังส่งมาไทย" },
  "4": { key: "arrived_thailand", thai: "ถึงไทยแล้ว" },
  "5": { key: "pending_payment", thai: "รอชำระเงิน" },
  "6": { key: "out_for_delivery", thai: "เตรียมส่ง" },
  "7": { key: "delivered", thai: "ส่งแล้ว" },
};

/** Thai label for a legacy order status code (`tb_header_order.hstatus`). */
export function legacyOrderStatusThai(code: string | null | undefined): string {
  if (!code) return "";
  return LEGACY_ORDER_STATUS[code as LegacyOrderCode]?.thai ?? code;
}

/** Thai label for a legacy forwarder status code (`tb_forwarder.fstatus`). */
export function legacyForwarderStatusThai(code: string | null | undefined): string {
  if (!code) return "";
  return LEGACY_FORWARDER_STATUS[code as LegacyForwarderCode]?.thai ?? code;
}

/** Rebuilt-era enum key → legacy order code — for status-filter queries on `tb_header_order`. */
export function toLegacyOrderCode(rebuiltKey: string): LegacyOrderCode | undefined {
  return (Object.keys(LEGACY_ORDER_STATUS) as LegacyOrderCode[]).find(
    (code) => LEGACY_ORDER_STATUS[code].key === rebuiltKey,
  );
}

/** Rebuilt-era enum key → legacy forwarder code — for status-filter queries on `tb_forwarder`. */
export function toLegacyForwarderCode(rebuiltKey: string): LegacyForwarderCode | undefined {
  return (Object.keys(LEGACY_FORWARDER_STATUS) as LegacyForwarderCode[]).find(
    (code) => LEGACY_FORWARDER_STATUS[code].key === rebuiltKey,
  );
}

/** The 6 order-status tabs in legacy display order — for the customer order-list tab strip. */
export const LEGACY_ORDER_TABS: { code: LegacyOrderCode; key: string; thai: string }[] = (
  Object.keys(LEGACY_ORDER_STATUS) as LegacyOrderCode[]
).map((code) => ({ code, key: LEGACY_ORDER_STATUS[code].key, thai: LEGACY_ORDER_STATUS[code].thai }));

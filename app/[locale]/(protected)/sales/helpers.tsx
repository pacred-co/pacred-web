import type { ReactNode } from "react";

/**
 * helpers.tsx — the legacy PCS Cargo helper functions used by the
 * sales-rep report screens (D1 / ADR-0017 · faithful-port). Each helper
 * cites its legacy source line; the DATA LOGIC (status→label mapping,
 * number_format) is transcribed 1:1.
 *
 * ── Tailwind rebuild (2026-05-30 · ปอน) ──
 * The two badge helpers used to `echo` Bootstrap-4 `badge badge-*
 * badge-pill` markup (which now renders unstyled — Bootstrap CSS was
 * dropped). The status→Thai-label mapping is UNCHANGED; only the chip
 * presentation is rebuilt to the Tailwind pattern shared with
 * /service-payment + /service-import (same semantic tones). Function
 * names + signatures + return types are unchanged so all four sales
 * pages keep calling them exactly as before.
 */

// Shared chip base — matches payStatusBadge/statusForwarderAll4 in the
// /service-payment + /service-import rebuilds.
const CHIP_BASE =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap";

/** PHP `number_format($n, $d)` — fixed decimals, comma thousands. */
export function numberFormat(n: number, decimals: number): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * `nameStatusUserPay($status)` — member/include/function.php L1358-1367.
 * The commission-payout status badge.
 *   1 → "ยังไม่เบิกจ่าย" (danger)   2 → "รอดำเนินการ" (warning)
 *   3 → "เบิกจ่ายแล้ว" (success)    default → '' (empty)
 */
export function nameStatusUserPay(status: string | null): ReactNode {
  switch (status) {
    case "1":
      return <span className={`${CHIP_BASE} bg-red-50 text-red-700 border-red-200`}>ยังไม่เบิกจ่าย</span>;
    case "2":
      return <span className={`${CHIP_BASE} bg-amber-50 text-amber-700 border-amber-200`}>รอดำเนินการ</span>;
    case "3":
      return <span className={`${CHIP_BASE} bg-emerald-50 text-emerald-700 border-emerald-200`}>เบิกจ่ายแล้ว</span>;
    default:
      return "";
  }
}

/**
 * The forwarder-status badge — the `switch ($row['fStatus'])` block
 * inlined identically in report-user-sales.php L181-189,
 * report-user-sales-add.php L94-102 and report-user-sales-history.php
 * L455-463. The 7 `fStatus` codes → the Thai pill badge.
 */
export function fStatusBadge(fStatus: string | null): ReactNode {
  switch (fStatus) {
    case "1":
      return <span className={`${CHIP_BASE} bg-red-50 text-red-700 border-red-200`}>รอสินค้าเข้าโกดังจีน</span>;
    case "2":
      return <span className={`${CHIP_BASE} bg-amber-50 text-amber-700 border-amber-200`}>สินค้าถึงโกดังจีนแล้ว</span>;
    case "3":
      return <span className={`${CHIP_BASE} bg-amber-50 text-amber-700 border-amber-200`}>กำลังส่งมาประเทศไทย</span>;
    case "4":
      return <span className={`${CHIP_BASE} bg-sky-50 text-sky-700 border-sky-200`}>สินค้าถึงประเทศไทยแล้ว</span>;
    case "5":
      return <span className={`${CHIP_BASE} bg-red-50 text-red-700 border-red-200`}>รอชำระเงิน</span>;
    case "6":
      return <span className={`${CHIP_BASE} bg-indigo-50 text-indigo-700 border-indigo-200`}>เตรียมส่ง</span>;
    case "7":
      return <span className={`${CHIP_BASE} bg-emerald-50 text-emerald-700 border-emerald-200`}>ส่งแล้ว</span>;
    default:
      return null;
  }
}

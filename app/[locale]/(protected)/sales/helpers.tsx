import type { ReactNode } from "react";

/**
 * helpers.tsx — the legacy PCS Cargo helper functions used by the
 * sales-rep report screens, transcribed 1:1 (D1 / ADR-0017 ·
 * faithful-port). Each helper cites its legacy source line.
 *
 * The legacy helpers `echo` raw HTML strings; the faithful
 * transcription returns the equivalent JSX so the rendered markup is
 * byte-identical to what the PHP emits.
 */

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
      return <span className="font-12 badge badge-danger badge-pill">ยังไม่เบิกจ่าย</span>;
    case "2":
      return <span className="font-12 badge badge-warning badge-pill">รอดำเนินการ</span>;
    case "3":
      return <span className="font-12 badge badge-success badge-pill">เบิกจ่ายแล้ว</span>;
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
      return <span className="font-12 badge badge-danger badge-pill">รอสินค้าเข้าโกดังจีน</span>;
    case "2":
      return <span className="font-12 badge badge-warning badge-pill">สินค้าถึงโกดังจีนแล้ว</span>;
    case "3":
      return <span className="font-12 badge badge-warning badge-pill">กำลังส่งมาประเทศไทย</span>;
    case "4":
      return <span className="font-12 badge badge-info badge-pill">สินค้าถึงประเทศไทยแล้ว</span>;
    case "5":
      return <span className="font-12 badge badge-danger badge-pill">รอชำระเงิน</span>;
    case "6":
      return <span className="font-12 badge badge-info badge-pill">เตรียมส่ง</span>;
    case "7":
      return <span className="font-12 badge badge-success badge-pill">ส่งแล้ว</span>;
    default:
      return null;
  }
}

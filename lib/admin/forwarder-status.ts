/**
 * Canonical PCS Cargo forwarder/container status config — SOLID colors.
 *
 * Source of truth — legacy PCS Cargo PHP:
 *  - `pcs-admin/include/function.php` L879-892 (`statusForwarderBadge`)
 *  - `pcs-admin/include/function.php` L2141-2149 (`statusCNT`)
 *  - `pcs-admin/report-cnt.php` L1791 (DETAIL mode row-class 3-flag composite)
 *  - `pcs-admin/report-cnt.php` L127-167 + L1101-1142 (inline `<style>` color rules)
 *
 * ⚠️ Why this file exists (2026-05-29 morning · ภูม flagged):
 * The earlier port (Wave 16 + Wave 23 P1-11.a) silently DROPPED the legacy
 * row-tint state machine + chip-color palette + label set. Staff scan a PCS
 * table in ~1 second by reading row BG + status chip; an "elegantly subtle"
 * Tailwind `-100` opacity tint is invisible at-a-glance. พี่ป๊อป opened the
 * admin to inspect, couldn't read state from a row, found the system unusable.
 *
 * Rule going forward: **chip-color and row-tint are LOGIC, not chrome.** They
 * encode workflow state for the eye that staff trained on. Use SOLID Tailwind
 * weights (`-300` / `-400` / `-500`), not `/30` / `/40` opacity. Polish lives
 * in spacing/typography/borders — not in stripping visual state.
 */

export type FStatus = "1" | "2" | "3" | "4" | "5" | "6" | "7";

/**
 * 7-state status badge palette — chip color + row BG tint per fstatus.
 *
 * Legacy mapping (function.php L879-892):
 *   1 = yellow  #ff9149 = รอเข้าโกดังจีน
 *   2 = cyan    #1cbcd8 = ถึงโกดังจีนแล้ว
 *   3 = pink    #ff5b9c = กำลังส่งมาไทย
 *   4 = brown   #8d6e63 = ถึงไทยแล้ว
 *   5 = red     #ff4961 = รอชำระเงิน
 *   6 = blue    #2196f3 = เตรียมส่ง
 *   7 = green   #37bc9b = ส่งแล้ว
 */
export const FSTATUS_CFG: Record<
  FStatus,
  { label: string; chip: string; rowBg: string }
> = {
  "1": { label: "รอเข้าโกดังจีน",  chip: "bg-yellow-400 text-yellow-950 border border-yellow-600",   rowBg: "bg-yellow-100" },
  "2": { label: "ถึงโกดังจีนแล้ว", chip: "bg-cyan-400 text-cyan-950 border border-cyan-600",         rowBg: "bg-cyan-100" },
  "3": { label: "กำลังส่งมาไทย",   chip: "bg-pink-400 text-pink-950 border border-pink-600",         rowBg: "bg-pink-100" },
  "4": { label: "ถึงไทยแล้ว",       chip: "bg-amber-700 text-amber-50 border border-amber-900",       rowBg: "bg-amber-100" },
  "5": { label: "รอชำระเงิน",       chip: "bg-red-500 text-red-50 border border-red-700",             rowBg: "bg-red-100" },
  "6": { label: "เตรียมส่ง",        chip: "bg-blue-500 text-blue-50 border border-blue-700",          rowBg: "bg-blue-100" },
  "7": { label: "ส่งแล้ว",          chip: "bg-emerald-500 text-emerald-50 border border-emerald-700", rowBg: "bg-emerald-100" },
};

export function fstatusBadge(fstatus: string): { label: string; chip: string; rowBg: string } {
  return FSTATUS_CFG[fstatus as FStatus] ?? { label: fstatus, chip: "bg-gray-300 text-gray-900", rowBg: "" };
}

/**
 * Cnt-payment status (2-state) — legacy function.php L2141-2149 (statusCNT)
 * + report-cnt.php LIST mode showing สถานะจ่ายค่าตู้ column.
 */
export const CNTSTATUS_CFG = {
  paid:   { label: "จ่ายแล้ว",   chip: "bg-emerald-500 text-emerald-50 border border-emerald-700" },
  unpaid: { label: "ยังไม่จ่าย",  chip: "bg-red-500 text-red-50 border border-red-700" },
};

/**
 * Cnt-hs row tint — cntstatus from tb_cnt:
 *   1 = pending (รอตรวจ · ส่งใบเบิกแล้ว แต่ผู้จัดการยังไม่อนุมัติ) → solid amber
 *   2 = approved (จ่ายแล้ว) → solid emerald
 *   3 = rejected (ปฏิเสธ) → solid red
 * Legacy `pcs-admin/cnt-hs.php` row-tint `.bg-color` (orange→red gradient unpaid)
 * + `.paid` (green) — we approximate solid Tailwind weights.
 */
export const CNTHS_ROW_TINT: Record<string, string> = {
  "1": "bg-amber-200",
  "2": "bg-emerald-200",
  "3": "bg-red-200",
};

/**
 * Composite row tint for DETAIL mode (`/admin/report-cnt/[fNo]`).
 * Mirrors legacy `report-cnt.php` L1791 3-flag string concat — solid Tailwind.
 *
 * Order matters — first match wins (selected > trackingDup > notYetWarehouse > inCheckQueue > normal).
 */
export type RowFlags = {
  inCheckQueue: boolean;      // cfFID set (อยู่ในรายการตรวจสอบ) — grey gradient
  notYetWarehouse: boolean;   // empty(arrIDNotCom[ID]) (ยังไม่ยิงเข้าโกดังไทย) — pink
  trackingDup: boolean;       // tracking ≥ 2 containers (จ่ายซ้ำ) — orange
  selected: boolean;          // JS user-select — green
};

export function detailRowTint(f: RowFlags): string {
  if (f.selected)        return "bg-emerald-300 ring-2 ring-emerald-600";
  if (f.trackingDup)     return "bg-orange-400 text-orange-950";
  if (f.notYetWarehouse && f.inCheckQueue) return "bg-rose-300 ring-2 ring-slate-500 text-rose-950";
  if (f.notYetWarehouse) return "bg-rose-300 text-rose-950";
  if (f.inCheckQueue)    return "bg-slate-300 text-slate-950";
  return "";
}

/**
 * LIST mode row tint — for `/admin/report-cnt` container summary.
 * Derived from fstatus + isPaid (no DETAIL-mode flags here since LIST groups
 * by container · per-tracking flags only relevant in DETAIL).
 */
export function listRowTint(fstatus: string, isPaid: boolean, selected: boolean): string {
  if (selected) return "bg-emerald-200 ring-2 ring-emerald-500";
  if (isPaid)   return "bg-emerald-100";
  return fstatusBadge(fstatus).rowBg;
}

/**
 * Legend chip list (DETAIL mode top of table · legacy report-cnt.php L1601-1615).
 * Renderers should map over this to produce the in-page color key.
 */
export const DETAIL_LEGEND = [
  { key: "notYetWarehouse", label: "ยังไม่ยิงเข้าโกดังไทย",            cls: "bg-rose-300 text-rose-950" },
  { key: "selected",         label: "พร้อมเพิ่มไปยังรายการตรวจสอบแล้ว", cls: "bg-emerald-300 text-emerald-950" },
  { key: "inCheckQueue",     label: "มีในรายการตรวจสอบแล้ว",            cls: "bg-slate-300 text-slate-950" },
  { key: "unpaidCnt",        label: "ยังไม่จ่ายเงิน (ค่าตู้)",            cls: "bg-amber-400 text-amber-950" },
  { key: "paidCnt",          label: "จ่ายเงินแล้ว (ค่าตู้)",              cls: "bg-emerald-500 text-emerald-50" },
  { key: "trackingDup",      label: "แทร็คกิ้งซ้ำ",                       cls: "bg-orange-400 text-orange-950" },
  { key: "idCoDup",          label: "ID/CO ซ้ำ",                          cls: "bg-blue-500 text-blue-50" },
  { key: "unpaidCustomer",   label: "ยังไม่เก็บเงินลูกค้า",                cls: "bg-red-500 text-red-50" },
] as const;

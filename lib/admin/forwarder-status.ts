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
 * encode workflow state for the eye that staff trained on — so they must stay
 * clearly READABLE at a glance (never a near-invisible `/30` `/40` opacity tint).
 *
 * 2026-06-20 owner re-tune ("ใช้สีเดิม แต่เบาโทนหน่อย มันแสบตาเกินไป หรี่ลงมา"): the
 * 2026-06-19 SOLID -400/-500 chips were too eye-searing on the dense รายการนำเข้า /
 * รายการตู้ tables. Softened to a SOFT PILL — same hue, light tint bg-{hue}-100 +
 * dark text-{hue}-800 + border-{hue}-300. This is still a distinct, state-encoding
 * colored pill (the dark text + border keep it readable — NOT the faint-tint-only
 * regression ป๊อป rejected in 2026-05), just gentler. Row tints stay at the light
 * -100 (already soft); the strong DETAIL composite tints were dimmed -300/-400 → -200.
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
  "1": { label: "รอเข้าโกดังจีน",  chip: "bg-yellow-100 text-yellow-800 border border-yellow-300",  rowBg: "bg-yellow-50" },
  "2": { label: "ถึงโกดังจีนแล้ว", chip: "bg-cyan-100 text-cyan-800 border border-cyan-300",        rowBg: "bg-cyan-50" },
  "3": { label: "กำลังส่งมาไทย",   chip: "bg-pink-100 text-pink-700 border border-pink-300",        rowBg: "bg-pink-50" },
  "4": { label: "ถึงไทยแล้ว",       chip: "bg-amber-100 text-amber-800 border border-amber-300",     rowBg: "bg-amber-50" },
  "5": { label: "รอชำระเงิน",       chip: "bg-red-100 text-red-700 border border-red-300",           rowBg: "bg-red-50" },
  "6": { label: "เตรียมส่ง",        chip: "bg-blue-100 text-blue-700 border border-blue-300",        rowBg: "bg-blue-50" },
  "7": { label: "ส่งแล้ว",          chip: "bg-emerald-100 text-emerald-700 border border-emerald-300", rowBg: "bg-emerald-50" },
};

export function fstatusBadge(fstatus: string): { label: string; chip: string; rowBg: string } {
  return FSTATUS_CFG[fstatus as FStatus] ?? { label: fstatus, chip: "bg-gray-100 text-gray-600 border border-gray-300", rowBg: "" };
}

/**
 * Cnt-payment status (2-state) — legacy function.php L2141-2149 (statusCNT)
 * + report-cnt.php LIST mode showing สถานะจ่ายค่าตู้ column.
 */
export const CNTSTATUS_CFG = {
  paid:   { label: "จ่ายแล้ว",   chip: "bg-emerald-100 text-emerald-700 border border-emerald-300" },
  unpaid: { label: "ยังไม่จ่าย",  chip: "bg-red-100 text-red-700 border border-red-300" },
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
  "1": "bg-amber-100",
  "2": "bg-emerald-100",
  "3": "bg-red-100",
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
  // 2026-06-20 softened (-300/-400 → -200 · ring kept for the selected/queue cues
  // since rings read as a deliberate outline, not a harsh fill).
  if (f.selected)        return "bg-emerald-200 ring-2 ring-emerald-500";
  if (f.trackingDup)     return "bg-orange-200 text-orange-900";
  if (f.notYetWarehouse && f.inCheckQueue) return "bg-rose-200 ring-2 ring-slate-400 text-rose-900";
  if (f.notYetWarehouse) return "bg-rose-200 text-rose-900";
  if (f.inCheckQueue)    return "bg-slate-200 text-slate-900";
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
  { key: "notYetWarehouse", label: "ยังไม่ยิงเข้าโกดังไทย",            cls: "bg-rose-200 text-rose-900" },
  { key: "selected",         label: "พร้อมเพิ่มไปยังรายการตรวจสอบแล้ว", cls: "bg-emerald-200 text-emerald-900" },
  { key: "inCheckQueue",     label: "มีในรายการตรวจสอบแล้ว",            cls: "bg-slate-200 text-slate-900" },
  { key: "unpaidCnt",        label: "ยังไม่จ่ายเงิน (ค่าตู้)",            cls: "bg-amber-100 text-amber-800 border border-amber-300" },
  { key: "paidCnt",          label: "จ่ายเงินแล้ว (ค่าตู้)",              cls: "bg-emerald-100 text-emerald-700 border border-emerald-300" },
  { key: "trackingDup",      label: "แทร็คกิ้งซ้ำ",                       cls: "bg-orange-200 text-orange-900" },
  { key: "idCoDup",          label: "ID/CO ซ้ำ",                          cls: "bg-blue-100 text-blue-700 border border-blue-300" },
  { key: "unpaidCustomer",   label: "ยังไม่เก็บเงินลูกค้า",                cls: "bg-red-100 text-red-700 border border-red-300" },
] as const;

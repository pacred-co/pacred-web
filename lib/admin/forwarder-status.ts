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
// `next` = the "ให้พนักงานทำอะไรต่อ" hint (self-explaining-row standard §0g · owner
// 2026-06-22) · `act:true` = needs a staff action NOW. Shown under the status pill
// wherever this SOT renders, so a worker scans the queue + knows the next step.
export const FSTATUS_CFG: Record<
  FStatus,
  { label: string; chip: string; rowBg: string; next: string; act: boolean }
> = {
  // owner 2026-07-15 — "จี๊ดจ๊าดไม่พอ · แสบตาแบบ PCS · สีสถานะที่ต้องมอง/กด ต้องเด่น" →
  // REVERSES the 2026-06-19 soften: the chip is now a LOUD solid fill (state-encoding ·
  // easy to find/read/click). rowBg bumped -50→-100 for a touch more presence (still
  // readable). Actionable statuses (4/5/6 · act:true) get the strongest fills.
  "1": { label: "รอเข้าโกดังจีน",  chip: "bg-yellow-400 text-yellow-950 border border-yellow-500 font-bold",  rowBg: "bg-yellow-100",  next: "รอสินค้าเข้าโกดังจีน",  act: false },
  "2": { label: "ถึงโกดังจีนแล้ว", chip: "bg-cyan-500 text-white border border-cyan-600 font-bold",           rowBg: "bg-cyan-100",    next: "รอส่งมาไทย",          act: false },
  "3": { label: "กำลังส่งมาไทย",   chip: "bg-pink-500 text-white border border-pink-600 font-bold",           rowBg: "bg-pink-100",    next: "กำลังมา — รอถึงไทย",   act: false },
  "4": { label: "ถึงไทยแล้ว",       chip: "bg-[#8d6e63] text-white border border-[#5d4037] font-bold",         rowBg: "bg-[#d7ccc8]",   next: "ตรวจ/แจ้งเก็บเงิน",     act: true  },
  "5": { label: "รอชำระเงิน",       chip: "bg-red-600 text-white border border-red-700 font-bold",             rowBg: "bg-red-100",     next: "รอลูกค้าชำระ/ตรวจสลิป", act: true  },
  "6": { label: "เตรียมส่ง",        chip: "bg-blue-600 text-white border border-blue-700 font-bold",           rowBg: "bg-blue-100",    next: "มอบงานคนขับ/จัดรถ",     act: true  },
  "7": { label: "ส่งแล้ว",          chip: "bg-emerald-600 text-white border border-emerald-700 font-bold",     rowBg: "bg-emerald-100", next: "เสร็จสิ้น",            act: false },
};

export function fstatusBadge(fstatus: string): { label: string; chip: string; rowBg: string; next: string; act: boolean } {
  return FSTATUS_CFG[fstatus as FStatus] ?? { label: fstatus, chip: "bg-gray-100 text-gray-600 border border-gray-300", rowBg: "", next: "", act: false };
}

// VIVID status chip (owner 2026-06-23: "เน้นสีเข้มตรงสถานะท้ายรายการเด่นๆ") — a SOLID,
// high-contrast version of the soft `chip`, for the end-of-row status pill once the
// rows themselves are white. Same hue per status, dialed up to a bold fill.
export const FSTATUS_VIVID: Record<string, string> = {
  "1": "bg-yellow-400 text-yellow-950",
  "2": "bg-cyan-500 text-white",
  "3": "bg-pink-500 text-white",
  "4": "bg-[#8d6e63] text-white",
  "5": "bg-red-600 text-white",
  "6": "bg-blue-600 text-white",
  "7": "bg-emerald-600 text-white",
};
export function fstatusVivid(fstatus: string): string {
  return FSTATUS_VIVID[fstatus] ?? "bg-slate-600 text-white";
}

/**
 * Status-filter TAB count-badge colours — faithful to legacy `forwarder.php`
 * L428-498 (`<div class="pcs-badge badge-{color} pcs-badge-pill">`). Every status
 * tab carries a COLOURED count pill so the whole strip reads at a glance — the
 * PCS look (ภูม 2026-07-10 "ใส่สีแบบ PCS ให้เป๊ะ"), not a plain grey number.
 * Legacy → Tailwind map:
 *   all=secondary(grey) · 1=warning(yellow) · 2=info(cyan) · 3=pink · 4=brown
 *   5=danger(red) · 6=primary(blue) · 6.1=info2(teal) · 7=success(green)
 *   c(เครดิต)=danger(red) · p(พิเศษ)=warning(amber)
 */
export const FSTATUS_TAB_BADGE: Record<string, string> = {
  all:   "bg-slate-500 text-white",
  "1":   "bg-yellow-400 text-yellow-950",
  "2":   "bg-cyan-500 text-white",
  "3":   "bg-pink-500 text-white",
  "4":   "bg-[#8d6e63] text-white",
  "5":   "bg-red-600 text-white",
  "6":   "bg-blue-600 text-white",
  "6.1": "bg-teal-500 text-white",
  "7":   "bg-emerald-600 text-white",
  "c":   "bg-red-600 text-white",
  "p":   "bg-amber-500 text-white",
};
export function fstatusTabBadge(v: string | undefined): string {
  return FSTATUS_TAB_BADGE[v ?? "all"] ?? "bg-slate-500 text-white";
}

/**
 * วันที่ปิดตู้ derived from the container code when MOMO didn't send one
 * (ภูม 2026-07-10). A Pacred/MOMO cabinet code embeds the close date as the
 * 6 digits right after the 3-letter prefix in `YYMMDD` (พ.ศ.-style 25xx→20xx):
 *   GZS`260529`-1 → 2026-05-29 · GZE`260701`-2 → 2026-07-01.
 * Returns an ISO `YYYY-MM-DD` or null when the code has no parseable date.
 * ONLY a display fallback — never overwrites a real MOMO close date.
 */
export function deriveContainerCloseDate(cabinet: string | null | undefined): string | null {
  const m = (cabinet ?? "").trim().match(/[A-Za-z]{2,4}(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const year = 2000 + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
export function listRowTint(_fstatus: string, _isPaid: boolean, selected: boolean): string {
  // /admin/forwarders (owner 2026-06-23 · this fn is used ONLY by forwarders-table):
  // rows are WHITE — colour now marks ONLY an ACTION state (a row ticked/selected
  // for a bulk action · keep the ring cue). The status shows VIVIDLY in the
  // end-of-row pill (fstatusVivid), not as a full-row wash ("สีทั้งแถวลายตา").
  return selected ? "bg-emerald-100 ring-2 ring-emerald-400" : "";
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

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
const FSTATUS_ICON_BASE = "/legacy/pcs/assets/images/icon/forwarder";

// `icon` = the legacy per-status graphic (function.php statusForwarderBadge · the
// hand-holding-a-Pacred-banknote for 5 = รอชำระเงิน, etc). Served from the LOCAL
// static mount on purpose — NOT `legacyMemberUrl()`. That helper resolves against
// `NEXT_PUBLIC_SUPABASE_URL`, and the mirror ภูม uploaded 2026-05-24 lives on PROD
// only, so a dev machine gets a 400 → broken image (verified 2026-07-16). These are
// in-repo static assets (public/legacy/pcs/…), not customer uploads, so the mirror
// buys nothing here. No brand leak either way (never pcscargo.co.th · §3).
export const FSTATUS_CFG: Record<
  FStatus,
  { label: string; chip: string; rowBg: string; next: string; act: boolean; icon: string }
> = {
  // owner 2026-07-15 — "จี๊ดจ๊าดไม่พอ · แสบตาแบบ PCS · สีสถานะที่ต้องมอง/กด ต้องเด่น" →
  // REVERSES the 2026-06-19 soften: the chip is now a LOUD solid fill (state-encoding ·
  // easy to find/read/click). rowBg bumped -50→-100 for a touch more presence (still
  // readable). Actionable statuses (4/5/6 · act:true) get the strongest fills.
  "1": { label: "รอเข้าโกดังจีน",  chip: "bg-yellow-400 text-yellow-950 border border-yellow-500 font-bold",  rowBg: "bg-yellow-100",  next: "รอสินค้าเข้าโกดังจีน",  act: false, icon: `${FSTATUS_ICON_BASE}/forwarder-1.png` },
  "2": { label: "ถึงโกดังจีนแล้ว", chip: "bg-cyan-500 text-white border border-cyan-600 font-bold",           rowBg: "bg-cyan-100",    next: "รอส่งมาไทย",          act: false, icon: `${FSTATUS_ICON_BASE}/forwarder-2.png` },
  "3": { label: "กำลังส่งมาไทย",   chip: "bg-pink-500 text-white border border-pink-600 font-bold",           rowBg: "bg-pink-100",    next: "กำลังมา — รอถึงไทย",   act: false, icon: `${FSTATUS_ICON_BASE}/forwarder-3.png` },
  "4": { label: "ถึงไทยแล้ว",       chip: "bg-[#8d6e63] text-white border border-[#5d4037] font-bold",         rowBg: "bg-[#d7ccc8]",   next: "ตรวจ/แจ้งเก็บเงิน",     act: true,  icon: `${FSTATUS_ICON_BASE}/forwarder-4.png` },
  // owner 2026-07-31 — เปลี่ยนชื่อทั้งระบบ "รอชำระเงิน" → "รอชำระ/ใบแจ้งหนี้"
  // (ขั้นนี้ = ออกใบแจ้งหนี้/ใบวางบิลแล้วรอลูกค้าโอน · ยังไม่มีสลิป)
  "5": { label: "รอชำระ/ใบแจ้งหนี้", chip: "bg-red-600 text-white border border-red-700 font-bold",             rowBg: "bg-red-100",     next: "รอลูกค้าชำระ/แนบสลิป",  act: true,  icon: `${FSTATUS_ICON_BASE}/forwarder-5.png` },
  "6": { label: "เตรียมส่ง",        chip: "bg-blue-600 text-white border border-blue-700 font-bold",           rowBg: "bg-blue-100",    next: "มอบงานคนขับ/จัดรถ",     act: true,  icon: `${FSTATUS_ICON_BASE}/forwarder-6.png` },
  "7": { label: "ส่งแล้ว",          chip: "bg-emerald-600 text-white border border-emerald-700 font-bold",     rowBg: "bg-emerald-100", next: "เสร็จสิ้น",            act: false, icon: `${FSTATUS_ICON_BASE}/forwarder-7.png` },
};

export function fstatusBadge(fstatus: string): { label: string; chip: string; rowBg: string; next: string; act: boolean; icon?: string } {
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
  // 5.1 = รอออก/ใบเสร็จรับเงิน (derived · ดู AWAITING_RECEIPT_CODE) — ม่วงจี๊ด
  // (owner 2026-07-31 "ขอสีจี๊ดจ๊าดเหมือนเพื่อนๆ มาอีกสีนึง") · ไม่ชนสีใครในแถบ
  "5.1": "bg-violet-600 text-white",
  "6": "bg-blue-600 text-white",
  // 6.1 = กำลังจัดส่ง (derived · fstatus 6 + คนขับเปิดรอบ) — เดิม hardcode indigo
  // ที่ forwarders-table L952; ย้ายมาไว้ที่ SOT ให้ทุกจอดึงตัวเดียวกัน
  "6.1": "bg-indigo-600 text-white",
  "7": "bg-emerald-600 text-white",
  // 99 = สถานะพิเศษ (NO CODE · fstatus='99') — สีเดียวกับ badge หัวข้อแท็บ "p"
  // (amber · legacy p=warning) ให้ป้ายบนแถวตรงกับสีหัวข้อ (owner 2026-08-02
  // "ทำไมขึ้นว่าสถานะ 99 · ต้องเป็นสถานะพิเศษ · ดูสีหัวข้อให้ตรงด้วย").
  "99": "bg-amber-500 text-white",
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
  "5.1": "bg-violet-600 text-white",
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
 * แถบแท็บสถานะรายการนำเข้า — SOT เดียวทั้งระบบ (owner 2026-07-31)
 * ═══════════════════════════════════════════════════════════════════════════
 * owner: *"สีสถานะทั้งหัวข้อและรายการ...มันควรจะเหมือนกันหรือเปล่าครับ ยังลิงก์
 * เชื่อมกันคนละจุดอยู่อีกหรอครับ ถ้าอนาคตมีสถานะงานเพิ่ม ไม่ต้องมาไล่แก้ไล่เติม
 * หากันตายเลยหรอครับ ข้อมูลกระจัดกระจายไม่ได้ถูกดึงถูกใช้จากที่เดียวกัน"*
 *
 * ลิสต์นี้คือ **ที่เดียว** ที่นิยามว่าแถบสถานะนำเข้ามีแท็บอะไร เรียงยังไง สีอะไร:
 *   • /admin/forwarders (หน้ารายการหลัก) — filterOpts สร้างจากลิสต์นี้
 *   • /admin/customers/[id] (หัวแถวสถานะบนโปรไฟล์ · scoped ต่อ PR) — เช่นกัน
 * เพิ่ม/แก้สถานะ → แก้ตรงนี้ + FSTATUS_TAB_BADGE/FSTATUS_VIVID ข้างบน = ขึ้นทุกจอเอง.
 *
 * `creditOnly` = แท็บที่โชว์เฉพาะลูกค้าเครดิต **เมื่ออยู่ใน scope ลูกค้ารายเดียว**
 * (โปรไฟล์) — หน้ารายการหลักรวมทุกลูกค้าจึงโชว์เสมอ (owner เคาะ 2026-07-31).
 * ความหมายของ code ตรง filter หน้าหลักเป๊ะ: "6" = fstatus 6 ที่ยังไม่มีคนขับเปิดรอบ ·
 * "6.1" = fstatus 6 + tb_forwarder_driver_item.fdistatus='' · "c" = fcredit='1' ·
 * "p" = fstatus='99'.
 */
export type ForwarderStatusTab = { code: string; label: string; creditOnly?: boolean };
export const FORWARDER_STATUS_TABS: readonly ForwarderStatusTab[] = [
  { code: "",    label: "ทั้งหมด" },
  { code: "1",   label: "รอเข้าโกดังจีน" },
  { code: "2",   label: "ถึงโกดังจีนแล้ว" },
  { code: "3",   label: "กำลังส่งมาไทย" },
  { code: "4",   label: "ถึงไทยแล้ว" },
  { code: "5",   label: "รอชำระ/ใบแจ้งหนี้" },
  { code: "5.1", label: "รอออก/ใบเสร็จรับเงิน" },
  { code: "6",   label: "เตรียมส่ง" },
  { code: "6.1", label: "กำลังจัดส่ง" },
  { code: "7",   label: "ส่งแล้ว" },
  { code: "c",   label: "เครดิตสินค้า", creditOnly: true },
  { code: "p",   label: "สถานะพิเศษ",  creditOnly: true },
];

/**
 * "รอออก/ใบเสร็จรับเงิน" — สถานะ DERIVED (owner 2026-07-31)
 * ═══════════════════════════════════════════════════════════════════════════
 * owner: *"เพิ่มสถานะ 'รอออก/ใบเสร็จรับเงิน' ... คือสถานะที่ลูกค้าหรือพนักงานแนบสลิป
 * เข้ามาในระบบ ให้ทางบัญชีตรวจสลิป พร้อมออกใบเสร็จ ไปใน flow จนจบ ก่อนที่จะไป
 * เตรียมส่ง"*
 *
 * เหมือน "6.1 กำลังจัดส่ง" — เป็นสถานะย่อยที่ **คำนวณจากข้อมูลจริง ไม่ใช่คอลัมน์ใหม่**
 * ⇒ ไม่ต้อง migration · ไม่มีสถานะค้างให้ sync · ย้อนสถานะไม่หลุด (สลิปถูกปฏิเสธ →
 * ตกกลับ "รอชำระ/ใบแจ้งหนี้" เอง).
 *
 *   fstatus = '5' (รอชำระ/ใบแจ้งหนี้)  +  มีสลิปรอบัญชีตรวจ
 *     สลิปรอตรวจ = tb_wallet_hs.status='1' ที่ reforder ชี้ fid นั้น
 *              หรือ ใบวางบิลของงานนั้นแนบสลิปแล้วแต่ยัง != paid/cancelled
 *
 * flow ที่ owner วางไว้:
 *   4 ถึงไทยแล้ว → 5 รอชำระ/ใบแจ้งหนี้ → **5.1 รอออก/ใบเสร็จรับเงิน** → 6 เตรียมส่ง → 7 ส่งแล้ว
 */
export const AWAITING_RECEIPT_CODE = "5.1" as const;

/** งานนี้อยู่ขั้น "รอออก/ใบเสร็จรับเงิน" ไหม (PURE — ผู้เรียกเป็นคนหาสัญญาณสลิปมาให้) */
export function isAwaitingReceipt(
  fstatus: string | null | undefined,
  hasPendingSlip: boolean,
  isCreditPayment = false,
): boolean {
  const st = String(fstatus ?? "").trim();
  // Customer-submitted cash slips stay at 5. Staff-submitted cash slips use
  // the legacy provisional 6+paydeposit=1 shape. Both are the same operational
  // gate: accounting must approve and issue the receipt before dispatch.
  // Credit is deliberately different: its physical lane remains 6 (ready to
  // dispatch) while the independent AR/document lane waits for review.
  return hasPendingSlip && !isCreditPayment && (st === "5" || st === "6");
}

/**
 * ป้ายสถานะที่ควรโชว์บนแถว — รวมสถานะย่อยที่ derive ไว้ให้แล้ว (SOT เดียว ·
 * เลิก hardcode "6.1 = indigo" ในตารางแต่ละจอ). คืน code ที่ใช้กับ
 * FSTATUS_VIVID / FORWARDER_STATUS_TABS ได้ตรงๆ.
 */
export function resolveRowStatusCode(
  fstatus: string | null | undefined,
  opts?: { driverOpen?: boolean; pendingSlip?: boolean; pendingSlipIsCredit?: boolean },
): string {
  const st = String(fstatus ?? "").trim();
  if (st === "6" && opts?.driverOpen) return "6.1";
  if (isAwaitingReceipt(st, Boolean(opts?.pendingSlip), Boolean(opts?.pendingSlipIsCredit))) return "5.1";
  return st;
}

/**
 * One predicate for the operational 5 / 5.1 / 6 / 6.1 queues.
 *
 * `5` is the only special case that cannot be expressed by the display code:
 * any submitted payment evidence has already left the plain "waiting for
 * payment" queue. Credit collection remains visible in its independent AR
 * lane; the other three operational queues follow the derived row code,
 * including driver-state priority over a stale pending-slip flag.
 */
export function matchesForwarderOperationalQueue(
  fstatus: string | null | undefined,
  queueCode: "5" | "5.1" | "6" | "6.1",
  opts?: { driverOpen?: boolean; pendingSlip?: boolean; pendingSlipIsCredit?: boolean },
): boolean {
  const st = String(fstatus ?? "").trim();
  if (queueCode === "5") return st === "5" && !opts?.pendingSlip;
  return resolveRowStatusCode(st, opts) === queueCode;
}

/** ป้ายภาษาไทยของ code (รวม 5.1 / 6.1 · fstatus '99' = แท็บ "p" สถานะพิเศษ) — ดึงจาก SOT แถบแท็บ */
export function statusCodeLabel(code: string): string {
  const c = code === "99" ? "p" : code;
  return FORWARDER_STATUS_TABS.find((t) => t.code === c)?.label ?? code;
}

/** สีพื้นแท็บตอน active — กติกาเดียวกับหน้ารายการหลัก (1-7 = vivid ของสถานะ ·
 *  p สถานะพิเศษ = amber ตัวเดียวกับป้ายแถว 99 [หัวข้อ=ป้าย สีตรงกัน] · อื่นๆ = แดงหลัก) */
export function fstatusTabActiveCls(code: string): string {
  if (code === "p") return FSTATUS_VIVID["99"];
  return /^[1-7]$/.test(code) ? fstatusVivid(code) : "bg-primary-600 text-white";
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

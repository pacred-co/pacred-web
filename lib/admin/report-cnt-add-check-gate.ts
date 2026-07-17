/**
 * Pure status-gate for /admin/report-cnt/[fNo] "เพิ่มในรายการตรวจสอบแล้ว"
 * (2026-06-09 bug fix · ภูม-reported · 2026-07-17 owner upper-bound).
 *
 * ── คิวนี้คืออะไร ──────────────────────────────────────────────────────
 * `tb_check_forwarder` = คิว "รอตรวจสอบ → แจ้งชำระเงินลูกค้า". มันมีงานเดียว:
 * `adminCallPriceUser` (actions/admin/forwarder-check.ts) แจ้งชำระเงิน **4→5**
 * ซึ่งอ่าน `.eq("fstatus","4")` เท่านั้น. คิวนี้จึงเป็นคิว "รายการที่ยังไม่เก็บเงิน"
 * ไม่ใช่คิว QA ทั่วไป.
 *
 * ── ทำไมต้องมีขอบบน (owner 2026-07-17) ────────────────────────────────
 * owner (verbatim): "บางสถานะมัน **ส่งแล้ว หรือ รอส่ง** มันจะยังไม่ส่งแจ้งชำระใน
 * รอตรวจสอบอีกได้ไงหละครับ **มันควรจะเข้าไปแค่ รายการที่จะให้ลูกค้าชำระเงิน**"
 *
 * gate เดิมมีแค่ **ขอบล่าง** ('4') ไม่มีขอบบน → แถว 5/6/7 (แจ้งชำระ/เก็บเงินไปแล้ว)
 * ผ่านเข้าคิวได้ แต่ `adminCallPriceUser` มองไม่เห็น (`.eq('4')`) → แจ้งชำระไม่ได้
 * ตลอดกาล + ไม่เคยถูกลบออกจากคิว (ลบเฉพาะ successfulFids) → **ค้างถาวร**.
 * prod 2026-07-17: คิว 168 แถว = fstatus 4 เพียง **8** · ค้าง **159** (5:27 · 6:112 · 7:20).
 *
 * → gate = ต้องเป็น **'4' เป๊ะ** (ขอบล่าง == ขอบบน) = เซ็ตเดียวกับที่ consumer
 *   ทำงานด้วยได้ (§0e เขียนให้ตรงกับที่ CONSUMER อ่าน). สถานะอื่น = dead weight
 *   โดยโครงสร้าง.
 *
 * ── MONEY-SAFETY: ทำไมขอบบนไม่ทำให้เงินหลุด ──────────────────────────
 * "แถวที่ควรเก็บเงิน" = แถวที่ยังไม่ถูกแจ้งชำระ = fstatus '4' เท่านั้น — ซึ่ง
 * **ยังผ่าน gate เหมือนเดิม**. แถว ≥5 คือแถวที่ *ผ่านการแจ้งชำระไปแล้ว* (การ
 * flip 4→5 คือตัวแจ้งชำระเอง) → กันมันออกจากคิว ไม่ทำให้เก็บเงินขาด เพราะมัน
 * เก็บผ่านคิวนี้ไม่ได้อยู่แล้ว. แถว <4 ยังไม่ถึงไทย → เข้าคิวใหม่ได้เมื่อถึง '4'.
 *
 * ── เคส "ส่งแล้วแต่ลูกค้าเคลม/ของเสียหาย" ────────────────────────────
 * คอมเมนต์เดิมยอมรับ '7' ด้วยเหตุผล "delivered row CAN re-enter QA for a
 * dispute/damage claim (legacy had no upper bound)". เหตุผลนั้น **ตกไปแล้ว**:
 *   (a) ใส่แถว '7' ในคิวนี้ไม่ได้ทำอะไรเลย — adminCallPriceUser ปฏิเสธมัน
 *       (`.eq('4')`) → เป็น dead weight ที่ทำให้ badge/คิวมั่ว เท่านั้น
 *   (b) เคสเคลม/ของเสียหาย มีคิวของตัวเองแล้ว = `/admin/forwarders/exceptions`
 *       (⚠️ ห้ามใส่ markdown bold คร่อม path ในคอมเมนต์ — ดอกจัน 2 ตัวชนสแลช จะกลาย
 *        เป็นตัวปิด block comment กลางคัน → ที่เหลือถูกอ่านเป็นโค้ด → tsc พังยกไฟล์)
 *       (G7 · mig 0230 · fexception_type: damaged / not_mine / container_returned …)
 * → dispute ให้ไปทางนั้น ไม่ใช่คิวแจ้งชำระ.
 *
 * SOLID — pure function · no DB · no IO · no Next imports. Lives in `lib/`
 * (not in the `"use server"` action file) because (a) `"use server"`
 * modules may only export async functions, and (b) the action's import
 * graph pulls in `server-only`, which throws under bare tsx → tests can't
 * import action modules. Mirror-vs-import would silently drift; a real
 * shared module + a real import here keeps the action + test + UI in lock-step.
 *
 * ผู้ใช้ร่วม (แก้ที่นี่ที่เดียว = ครบทั้ง write + read + UI):
 *   - actions/admin/report-cnt-detail.ts::adminReportCntAddCheck  (WRITE gate)
 *   - app/…/report-cnt/[fNo]/container-detail-client.tsx          (checkbox/select-all/filter)
 *   - app/…/forwarder-check/page.tsx                              (READ filter + badge)
 */

/** ขอบล่าง — '4' = "ถึงไทยแล้ว" (สินค้าอยู่โกดังไทยจริง จึงแจ้งชำระได้). */
export const REPORT_CNT_ADD_CHECK_MIN_FSTATUS = "4";

/** ขอบบน (owner 2026-07-17) — '4' เช่นกัน: ≥'5' = แจ้งชำระ/เก็บเงินไปแล้ว
 *  → ห้ามเข้าคิวอีก. ตรงกับ `adminCallPriceUser` ที่อ่าน `.eq("fstatus","4")`. */
export const REPORT_CNT_ADD_CHECK_MAX_FSTATUS = "4";

/** Mirror of `FSTATUS_CFG` labels (lib/admin/forwarder-status.ts) — kept
 *  duplicated here so the gate stays import-light (no React/Tailwind
 *  drag-in). Sync if labels move. */
export const FSTATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

/**
 * เหตุผลที่แถวเข้าคิวไม่ได้ — แยก 2 ทางเพราะ **ข้อความต้องบอกความจริง**
 * ([[wrong-error-message-hides-real-block]]): ถ้ายุบเป็นข้อความเดียว แถว
 * fstatus=6 จะได้ error "ยังไม่ถึงโกดังไทย" ซึ่ง **โกหก** → พนักงานไปรอ MOMO
 * sync ที่ไม่มีวันมา.
 */
export type AddCheckIneligibleReason =
  | "too_early"      // < min — ยังไม่ถึงไทย
  | "already_billed"; // > max — แจ้งชำระ/เก็บเงินไปแล้ว

export type ReportCntAddCheckRow = {
  id: number;
  fstatus: string | null;
  fidorco: string | null;
};

export type ReportCntAddCheckGateResult =
  | { ok: true }
  | {
      ok: false;
      /** ทุกแถวที่ถูกบล็อก (รวมทั้ง 2 เหตุผล) — sample ≤5 */
      blockedFidorcos: string[];
      blockedCount: number;
      sampleStatuses: string[];
      /** แยกตามเหตุผล (2026-07-17) เพื่อให้ข้อความบอก "บล็อกจริงเพราะอะไร" */
      tooEarly: { count: number; fidorcos: string[] };
      alreadyBilled: { count: number; fidorcos: string[] };
    };

/** ป้ายระบุแถว: ใช้ fidorco ถ้ามี ไม่งั้น `#<id>`. */
function rowLabel(r: ReportCntAddCheckRow): string {
  return r.fidorco ?? `#${r.id}`;
}

/**
 * เหตุผลที่แถวนี้เข้าคิวไม่ได้ — `null` = เข้าได้.
 *
 * null/"" → "too_early" (defensive · แถวไม่มีสถานะ = ไม่รู้ว่าถึงไทยหรือยัง
 * → ปฏิเสธไว้ก่อน · fail-closed).
 */
export function addCheckIneligibleReason(
  fstatus: string | null,
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  maxFstatus: string = REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
): AddCheckIneligibleReason | null {
  const s = (fstatus ?? "").trim();
  if (s === "") return "too_early"; // null / empty = "ยังไม่รู้ว่าถึงไทย" → fail-closed
  if (s < minFstatus) return "too_early";
  if (s > maxFstatus) return "already_billed";
  return null;
}

/**
 * ข้อความไทยบอกเหตุผล — `null` = เข้าคิวได้.
 * ใช้กับ tooltip ของ checkbox + หมายเหตุ "ทำไมแถวนี้ถูกซ่อน" ในหน้าคิว (§0f/§0g).
 */
export function addCheckIneligibleMessage(
  fstatus: string | null,
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  maxFstatus: string = REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
): string | null {
  const reason = addCheckIneligibleReason(fstatus, minFstatus, maxFstatus);
  if (reason === null) return null;
  const current = FSTATUS_LABEL[(fstatus ?? "").trim()] ?? ((fstatus ?? "").trim() || "(ว่าง)");
  if (reason === "too_early") {
    const minLabel = FSTATUS_LABEL[minFstatus] ?? minFstatus;
    return `ยังไม่ถึงโกดังไทย (ตอนนี้ "${current}") — เข้าคิวได้เมื่อสถานะถึง "${minLabel}"`;
  }
  return `แจ้งชำระเงินไปแล้ว (ตอนนี้ "${current}") — ไม่ต้องเข้าคิวแจ้งชำระอีก`;
}

/**
 * `isRowEligibleForAddCheck` — client-side hint: "แถวนี้ติ๊กเข้าคิวได้ไหม?"
 * ใช้โดย checkbox / select-all / ตัวกรอง "พร้อมตรวจสอบ" ในหน้า report-cnt
 * และตัวกรองฝั่ง READ ของ /admin/forwarder-check.
 */
export function isRowEligibleForAddCheck(
  fstatus: string | null,
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  maxFstatus: string = REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
): boolean {
  return addCheckIneligibleReason(fstatus, minFstatus, maxFstatus) === null;
}

/**
 * Decide whether the batch may proceed.
 *
 * `{ ok: true }` ก็ต่อเมื่อ **ทุกแถว** อยู่ในช่วง [minFstatus, maxFstatus]
 * (เทียบ string ตัวเลขหลักเดียวแบบ legacy — '4' < '5' < '6'…).
 *
 * All-or-nothing semantics — partial inserts would silently succeed on some
 * IDs and leave staff guessing; rejecting the whole batch forces them to fix
 * the selection. ผลลัพธ์แยก `tooEarly` / `alreadyBilled` เพื่อให้ผู้เรียก
 * ประกอบข้อความที่ **ตรงกับเหตุผลจริง** ของแต่ละกลุ่ม.
 *
 * Edge cases:
 *   - `fstatus === null` / `""` / ช่องว่าง → tooEarly (fail-closed)
 *   - `fstatus === "4"` (= min = max) → ผ่าน (ขอบเขตทั้งสองด้าน)
 *   - `fstatus === "5"/"6"/"7"` → alreadyBilled (owner 2026-07-17 · เดิมผ่าน)
 */
export function evaluateReportCntAddCheckStatus(
  rows: ReportCntAddCheckRow[],
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
  maxFstatus: string = REPORT_CNT_ADD_CHECK_MAX_FSTATUS,
): ReportCntAddCheckGateResult {
  const tooEarlyRows: ReportCntAddCheckRow[] = [];
  const alreadyBilledRows: ReportCntAddCheckRow[] = [];

  for (const r of rows) {
    const reason = addCheckIneligibleReason(r.fstatus, minFstatus, maxFstatus);
    if (reason === "too_early") tooEarlyRows.push(r);
    else if (reason === "already_billed") alreadyBilledRows.push(r);
  }

  const blocked = [...tooEarlyRows, ...alreadyBilledRows];
  if (blocked.length === 0) return { ok: true };

  const sampleStatuses = Array.from(
    new Set(blocked.map((r) => (r.fstatus ?? "").trim() || "(ว่าง)")),
  ).slice(0, 5);

  return {
    ok: false,
    blockedFidorcos: blocked.slice(0, 5).map(rowLabel),
    blockedCount: blocked.length,
    sampleStatuses,
    tooEarly: {
      count: tooEarlyRows.length,
      fidorcos: tooEarlyRows.slice(0, 5).map(rowLabel),
    },
    alreadyBilled: {
      count: alreadyBilledRows.length,
      fidorcos: alreadyBilledRows.slice(0, 5).map(rowLabel),
    },
  };
}

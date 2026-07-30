/**
 * packing-upload-plan.ts — สมองของหน้า "อัพ packing list" (owner 2026-07-30)
 *
 * owner: *"เราไล่อัพไปแล้ว แต่ บางรายการก็งง ตู้ไม่ตรง สร้างได้ สร้างไม่ได้
 *  เดี๋ยวให้กดอัพเดท เดี๋ยวไม่มี งงไปหมดเลย ... มันควรจะเชื่อมโยง ประมวลผลกัน
 *  และ map match กันได้และถูกต้องจริงๆไปเลยครับ ทำให้ใช้ได้จริงและ เสถียร"*
 *
 * รวม "การตัดสินใจที่คนอ่านแล้วต้องเข้าใจทันที" ของหน้านั้นมาไว้ที่เดียว **ตัวเดียว
 * ทั้งฝั่งจอและฝั่งเซิร์ฟ** เพื่อไม่ให้จอกับ apply พูดไม่ตรงกัน (ที่มาของ "งง"):
 *
 *   1. `isNonParcelPackingRow`  — แถวที่ไม่ใช่พัสดุ (หัวตารางในไฟล์ · เลขกระสอบ CBX)
 *      → เลิกนับเป็น "🔴 ไม่พบ" (ทุกไฟล์มีหัวตารางติดมา 1 แถว = 🔴 ผีทุกครั้ง)
 *   2. `describeMissingCreatable` — "สร้างได้ / สร้างไม่ได้ **เพราะอะไร**"
 *      (เดิมป้ายเขียน "สร้างได้" ทุกแถว แต่ช่องติ๊กโผล่แค่แถวที่รหัสเป็น PR)
 *   3. `decideContainerWrite` — "ตู้ไหนถูก" + apply จะทับเลขตู้หรือไม่
 *      (ยึดคำตอบจาก SOT `momo-container-truth` · ห้ามเดา)
 *   4. `describeApplyPlan` — ปุ่มยืนยันจะเขียนว่าอะไร **หรือทำไมไม่มีปุ่ม**
 *      (เดิมปุ่มหายเงียบเมื่อไม่มีงาน = "เดี๋ยวให้กดอัพเดท เดี๋ยวไม่มี")
 *   5. `markSupersededUploads` — ตู้เดียวอัพหลายไฟล์ → ไฟล์เก่าคือ "แทนที่แล้ว"
 *   6. `overlayPackingLines` — เอาบรรทัดของไฟล์ที่กำลังพรีวิว ทับตู้เดียวกันใน
 *      แผนที่ที่โหลดจาก DB (ไฟล์ที่เพิ่งลากเข้ามาอาจยังไม่ถูกบันทึกลงประวัติ)
 *
 * PURE — ไม่แตะ DB / ไม่แตะเงิน / client-safe (นำเข้าเฉพาะ cabinet-class ที่ pure).
 */

import { classifyCabinetId } from "@/lib/forwarder/cabinet-class";
import type { PackingContainerLine } from "@/lib/admin/momo-container-truth";

// ──────────────────────────────────────────────────────────────────────────────
// 1. แถวที่ไม่ใช่พัสดุ
// ──────────────────────────────────────────────────────────────────────────────

/**
 * หัวตารางที่ MOMO ใส่ซ้ำมาในไฟล์ (prod: ทุกไฟล์มี base="Tracking" code="Code"
 * ค่าตัวเลขว่างทั้งแถว) — normalize แล้วเทียบกับลิสต์นี้.
 * ถ้า MOMO เปลี่ยนคำ → แถวนั้นกลับไปขึ้น 🔴 ไม่พบ เหมือนเดิม (degrade แบบปลอดภัย ไม่กลืนพัสดุจริง).
 */
const HEADER_TOKENS = new Set([
  "tracking", "tracking no", "tracking number", "trackingno",
  "code", "no", "item", "product", "sm date", "smdate", "type", "remark", "remark number",
]);

const normToken = (v: string | null | undefined): string =>
  String(v ?? "").trim().toLowerCase().replace(/[.:]+$/, "").replace(/\s+/g, " ");

export type NonParcelReason = "header_row" | "sack";

export type NonParcelVerdict =
  | { nonParcel: false }
  | { nonParcel: true; reason: NonParcelReason; message: string };

/**
 * แถวนี้ "ไม่ใช่พัสดุ" ไหม — ต้องเรียกเฉพาะแถวที่ **จับคู่กับระบบไม่ได้** (unmatched)
 * เท่านั้น (ถ้าจับคู่ได้ = มีของจริงในระบบ ห้ามตีว่าไม่ใช่พัสดุ).
 *
 *  - `header_row` = หัวตารางในไฟล์ (ไม่มีค่ากล่อง/น้ำหนัก/คิว เลย + ข้อความเป็นชื่อคอลัมน์)
 *  - `sack`       = เลขกระสอบ CBX… (กระสอบอยู่ **ภายใน**ตู้อีกชั้น ไม่ใช่พัสดุของลูกค้า)
 */
export function isNonParcelPackingRow(input: {
  baseTracking: string | null | undefined;
  code?: string | null;
  boxes?: number | null;
  weight?: number | null;
  cbm?: number | null;
}): NonParcelVerdict {
  const base = String(input.baseTracking ?? "").trim();
  if (!base) {
    return { nonParcel: true, reason: "header_row", message: "แถวนี้ไม่มีเลขแทรคกิ้งในไฟล์ — ไม่ใช่พัสดุ" };
  }

  // กระสอบ (CBX…) — เลขกระสอบหลุดมาเป็นแถวพัสดุในไฟล์ (พบจริงในหลายตู้)
  if (classifyCabinetId(base) === "sack") {
    return {
      nonParcel: true,
      reason: "sack",
      message: `"${base}" เป็นเลขกระสอบ (CBX…) ไม่ใช่พัสดุของลูกค้า — กระสอบอยู่ภายในตู้อีกชั้น (ไม่ต้องสร้างรายการ)`,
    };
  }

  // หัวตารางในไฟล์ — ต้องไม่มีตัวเลขเลย **และ** ข้อความตรงกับชื่อคอลัมน์
  const noMetrics = input.boxes == null && input.weight == null && input.cbm == null;
  if (noMetrics && (HEADER_TOKENS.has(normToken(base)) || HEADER_TOKENS.has(normToken(input.code)))) {
    return {
      nonParcel: true,
      reason: "header_row",
      message: "แถวนี้เป็นหัวตารางที่ติดมาในไฟล์ (ไม่มีน้ำหนัก/คิว/กล่อง) — ไม่ใช่พัสดุ",
    };
  }

  return { nonParcel: false };
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. สร้างได้ / สร้างไม่ได้ (เพราะอะไร)
// ──────────────────────────────────────────────────────────────────────────────

/** ตัวตัดสินเดียวกับที่ apply ใช้ (`/^PR\d+$/i`) — จอกับเซิร์ฟห้ามคิดต่างกัน. */
export const PR_CODE_RX = /^PR\d+$/i;

export type MissingCreatable =
  | { creatable: true }
  | { creatable: false; reason: string };

/**
 * "🔴 ไม่พบ" แถวนี้กดสร้างได้ไหม + ถ้าไม่ได้ **บอกตัวขัดขวางจริง** เป็นภาษาคน.
 * เดิมป้ายเขียน "สร้างได้" ทุกแถว แต่ช่องติ๊กโผล่แค่แถวที่รหัสเป็น PR → คนงงว่า
 * "ทำไมแถวนี้สร้างไม่ได้" โดยไม่มีคำอธิบายเลย.
 */
export function describeMissingCreatable(input: { code: string | null | undefined }): MissingCreatable {
  const code = String(input.code ?? "").trim();
  if (!code) {
    return {
      creatable: false,
      reason: "MOMO ไม่ได้ส่งรหัสลูกค้า (PR) มาในไฟล์ — ให้ CS หาเจ้าของพัสดุก่อน (ถามโกดังจีน/ดูรูปป้ายกล่อง) แล้วสร้างที่หน้า “พัสดุที่ขาด”",
    };
  }
  if (PR_CODE_RX.test(code)) return { creatable: true };
  return {
    creatable: false,
    reason: `รหัสที่ MOMO ส่งมาคือ "${code}" ซึ่งไม่ใช่รูปแบบ PR#### — ให้ CS ตรวจ/แก้รหัสลูกค้าก่อน แล้วสร้างที่หน้า “พัสดุที่ขาด”`,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. ตู้ไหนถูก → apply จะทับเลขตู้หรือไม่
// ──────────────────────────────────────────────────────────────────────────────

export type ContainerWriteAction =
  /** ทับเลขตู้ตามไฟล์ได้ (SOT ยืนยันตรง หรือไม่มีข้อมูลค้าน = พฤติกรรมเดิม) */
  | "write"
  /** SOT บอกว่าแถวนี้อยู่ **ตู้อื่น** → ห้ามทับ (กันทับงานที่เพิ่ง data-fix ไป) */
  | "skip_conflict"
  /** แพคกิ้งบอกว่าชิปเม้นนี้แยกหลายตู้ แต่ยังชี้ไม่ได้ว่าแถวนี้ตู้ไหน → ไม่เดา */
  | "skip_ambiguous"
  /** ไฟล์ไม่มีเลขตู้ (Format B) → ไม่มีอะไรให้เขียน */
  | "none";

/**
 * ตัดสินว่า apply ควรเขียน `fcabinetnumber` ตามไฟล์หรือไม่.
 *
 * ⚠️ ชิปเม้นเดียวอยู่ได้ **หลายตู้จริง** (prod: 8 ชิปเม้น กระจาย 2-3 ตู้) → "ตู้ไม่ตรง"
 * ไม่ได้แปลว่าไฟล์ผิดเสมอ. ถ้าเดาแล้วประทับเลขตู้ทั้งครอบครัวเป็นตู้เดียว = ต้นเหตุ
 * ของอาการ "ตู้ไม่ตรงแปลกๆ" ที่ owner เจอ → เคสที่ชี้ไม่ได้ให้ **ไม่แตะ** แล้วบอกคน.
 */
export function decideContainerWrite(input: {
  /** เลขตู้ของไฟล์ที่กำลังอัพ */
  fileContainer: string | null | undefined;
  /** คำตอบจาก SOT (describeContainerTruth.shouldBe) — null = ตอบไม่ได้ */
  shouldBe: string | null | undefined;
  /** SOT บอกว่าชิปเม้นนี้กระจายหลายตู้ */
  multiContainer: boolean;
}): ContainerWriteAction {
  const file = String(input.fileContainer ?? "").trim();
  if (!file) return "none";
  const should = String(input.shouldBe ?? "").trim();
  if (should) return should === file ? "write" : "skip_conflict";
  return input.multiContainer ? "skip_ambiguous" : "write";
}

/** ข้อความไทยของการตัดสินใจข้างบน (โชว์ใต้ป้ายในตาราง). */
export function containerWriteNote(
  action: ContainerWriteAction,
  input: { fileContainer: string | null; shouldBe: string | null; packingCabinets: string[] },
): string | null {
  const file = String(input.fileContainer ?? "").trim() || "—";
  switch (action) {
    case "skip_conflict":
      return `แพคกิ้งลิสบอกว่าแถวนี้อยู่ตู้ ${input.shouldBe} ไม่ใช่ ${file} — ระบบจะ **ไม่ทับเลขตู้** ของแถวนี้ (อัปเดตแค่น้ำหนัก/คิว/กล่อง)`;
    case "skip_ambiguous":
      return `ชิปเม้นนี้ MOMO แยกส่ง ${input.packingCabinets.length} ตู้ (${input.packingCabinets.join(" · ")}) แต่ยังชี้ไม่ได้ว่าแถวนี้อยู่ตู้ไหน — ระบบจะ **ไม่ทับเลขตู้** ให้คนตรวจเอง`;
    case "write":
      return null; // ปกติ — ไม่ต้องอธิบาย
    case "none":
      return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. ปุ่มยืนยัน — จะเขียนว่าอะไร หรือทำไมไม่มีปุ่ม
// ──────────────────────────────────────────────────────────────────────────────

export type ApplyPlanInput = {
  format: "momo" | "yiwu";
  total: number;
  /** แถวที่จะถูกเขียนค่าลงระบบ (update + box_short + cab_diff) */
  willUpdate: number;
  /** จำนวน fid ที่จะเลื่อนสถานะ 1/2 → 3 */
  willAdvance: number;
  /** ที่ติ๊ก "สร้าง" ไว้ */
  toCreateCount: number;
  alreadyOk: number;
  billedDiffer: number;
  multiRow: number;
  notParcel: number;
  missing: number;
  /** ในกลุ่ม missing มีกี่แถวที่ "สร้างได้" (รหัสเป็น PR) */
  missingCreatable: number;
  /** ข้อความเวลาไทยของการกดบันทึกครั้งก่อนของตู้นี้ (null = ยังไม่เคย) */
  appliedBeforeText?: string | null;
};

export type ApplyPlan =
  | { kind: "ready"; label: string; details: string[] }
  | { kind: "nothing"; title: string; details: string[] };

/**
 * ปุ่มยืนยัน = ต้องมีคำตอบเสมอ. ถ้าไม่มีอะไรให้ทำ → **บอกเหตุผล** (ห้ามหายเงียบ).
 * `details` = การบ้านที่เหลือทั้งหมด ไม่ว่าหัวข้อไหนชนะ → คนเห็นบัญชีครบ ไม่ต้องเดา.
 */
export function describeApplyPlan(input: ApplyPlanInput): ApplyPlan {
  const details: string[] = [];
  if (input.appliedBeforeText) {
    details.push(`ตู้นี้เคยกดบันทึกเข้าระบบแล้ว (${input.appliedBeforeText})`);
  }
  if (input.notParcel > 0) {
    details.push(`ไม่ใช่พัสดุ ${input.notParcel} แถว (หัวตารางในไฟล์ / เลขกระสอบ CBX) — ข้ามอยู่แล้ว ไม่ต้องทำอะไร`);
  }
  if (input.billedDiffer > 0) {
    details.push(`🔒 วางบิลแล้ว ${input.billedDiffer} แถว — ค่าถูกล็อกตามบิลที่ออกไป แก้ที่บิลเท่านั้น`);
  }
  if (input.multiRow > 0) {
    details.push(`🟣 หลายแถว ${input.multiRow} แถว — แทรคเดียวมีหลายรายการที่ยังไม่วางบิล ระบบไม่แก้อัตโนมัติ (กันคิดเงินซ้ำ) ให้ตรวจเอง`);
  }
  const notCreatable = Math.max(0, input.missing - input.missingCreatable);
  if (notCreatable > 0) {
    details.push(`🔴 ไม่พบ + สร้างไม่ได้ ${notCreatable} แถว — MOMO ไม่ได้ส่งรหัสลูกค้า (PR) มา ให้ CS หาเจ้าของก่อน`);
  }
  if (input.missingCreatable > input.toCreateCount) {
    details.push(`🔴 ไม่พบ + สร้างได้ ${input.missingCreatable - input.toCreateCount} แถว — ติ๊ก "สร้าง" ที่แถวนั้นถ้าต้องการสร้างรายการ`);
  }

  const hasWork = input.format === "momo" && (input.willUpdate > 0 || input.willAdvance > 0 || input.toCreateCount > 0);
  if (hasWork) {
    const parts: string[] = [];
    if (input.willUpdate > 0) parts.push(`แก้ ${input.willUpdate}`);
    if (input.toCreateCount > 0) parts.push(`สร้าง ${input.toCreateCount}`);
    if (input.willAdvance > 0) parts.push(`เลื่อนสถานะ ${input.willAdvance}`);
    return { kind: "ready", label: `ยืนยัน + อัปเดต (${parts.join(" · ")})`, details };
  }

  // ── ไม่มีงาน → ต้องบอกว่าทำไม (เรียงตาม "อันไหนคนทำต่อได้ก่อน") ──
  if (input.format === "yiwu") {
    return { kind: "nothing", title: "ไฟล์อี้อู (Yiwu) — หน้านี้เป็นโหมดพรีวิวเท่านั้น ไม่บันทึกเข้าระบบ", details };
  }
  if (input.total === 0) {
    return { kind: "nothing", title: "ไฟล์นี้ไม่มีรายการพัสดุให้อัปเดต", details };
  }
  if (input.missingCreatable > 0) {
    return {
      kind: "nothing",
      title: `ยังไม่ได้ติ๊กสร้าง — มีของที่ระบบไม่พบ ${input.missingCreatable} รายการ ที่สร้างได้ (ติ๊ก "สร้าง" ที่แถวนั้น แล้วปุ่มยืนยันจะขึ้น)`,
      details,
    };
  }
  if (input.alreadyOk + input.notParcel >= input.total) {
    return {
      kind: "nothing",
      title: input.appliedBeforeText
        ? "ไม่มีอะไรต้องอัปเดต — ทุกแถวตรงกับระบบแล้ว (ไฟล์นี้บันทึกไปแล้ว)"
        : "ไม่มีอะไรต้องอัปเดต — ทุกแถวตรงกับระบบแล้ว",
      details,
    };
  }
  if (input.billedDiffer + input.multiRow > 0) {
    return {
      kind: "nothing",
      title: "แก้อัตโนมัติไม่ได้ — แถวที่ต่างจากระบบ วางบิลแล้ว (🔒) หรือเป็นแทรคที่มีหลายรายการ (🟣) ต้องให้คนตรวจ/แก้ที่บิลเอง",
      details,
    };
  }
  if (input.missing > 0) {
    return {
      kind: "nothing",
      title: `ของที่ระบบไม่พบ ${input.missing} รายการ ยังสร้างไม่ได้ — MOMO ไม่ได้ส่งรหัสลูกค้า (PR) มาในไฟล์`,
      details,
    };
  }
  return { kind: "nothing", title: "ไม่มีรายการที่ต้องอัปเดตในไฟล์นี้", details };
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. ตู้เดียวอัพหลายไฟล์
// ──────────────────────────────────────────────────────────────────────────────

export type UploadRowLite = {
  id: number;
  containerNo: string | null;
  uploadedAt: string;
};

/**
 * ตู้เดียวอัพซ้ำหลายไฟล์ (prod: 10 ตู้ · GZS260718-1 อัพ 3 รอบ) → ไฟล์ที่ **ใช้จริง**
 * คือไฟล์ล่าสุดของตู้นั้น ที่เหลือ = "แทนที่แล้ว". คืน id ของไฟล์ที่ถูกแทนที่.
 * เวลาเท่ากันเป๊ะ (อัพ 2 ครั้งในนาทีเดียว) → ยึด id ที่ใหญ่กว่า = ใหม่กว่า.
 */
export function markSupersededUploads(rows: UploadRowLite[]): Set<number> {
  const newestByCab = new Map<string, UploadRowLite>();
  for (const r of rows) {
    const cab = String(r.containerNo ?? "").trim();
    if (!cab) continue;
    const cur = newestByCab.get(cab);
    if (!cur) { newestByCab.set(cab, r); continue; }
    const a = Date.parse(r.uploadedAt), b = Date.parse(cur.uploadedAt);
    const aT = Number.isFinite(a) ? a : -Infinity;
    const bT = Number.isFinite(b) ? b : -Infinity;
    if (aT > bT || (aT === bT && r.id > cur.id)) newestByCab.set(cab, r);
  }
  const superseded = new Set<number>();
  for (const r of rows) {
    const cab = String(r.containerNo ?? "").trim();
    if (!cab) continue;
    const winner = newestByCab.get(cab);
    if (winner && winner.id !== r.id) superseded.add(r.id);
  }
  return superseded;
}

/**
 * ข้อความเตือนเมื่อตู้นี้เคยอัพมาก่อน (owner "เดี๋ยวไม่มี งงไปหมด").
 * **ไม่บล็อกการอัพซ้ำ** — อัพไฟล์ที่แก้แล้วใหม่เป็นเรื่องปกติ แค่บอกว่าตัวจริงคือไฟล์ล่าสุด.
 */
export function describePriorUploads(input: {
  count: number;
  latestText: string | null;
  appliedCount: number;
}): string | null {
  if (input.count < 2) return null;
  const applied = input.appliedCount > 0 ? ` · เคยกดบันทึกเข้าระบบแล้ว ${input.appliedCount} ครั้ง` : "";
  return `ตู้นี้มีไฟล์ที่อัพแล้ว ${input.count} ครั้ง${input.latestText ? ` (ล่าสุด ${input.latestText})` : ""}${applied} — ระบบใช้ไฟล์ล่าสุดเป็นตัวจริง ไฟล์ก่อนหน้าถือว่าแทนที่แล้ว`;
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. overlay บรรทัดของไฟล์ที่กำลังพรีวิว
// ──────────────────────────────────────────────────────────────────────────────

export type OverlayFileRow = {
  baseTracking: string;
  boxes: number | null;
  weight: number | null;
  cbm: number | null;
  subCount: number;
  cg?: string | null;
};

/**
 * เอาบรรทัดของ **ไฟล์ที่กำลังพรีวิว** ทับบรรทัดของตู้เดียวกันในแผนที่ที่โหลดจาก DB.
 *
 * ทำไมต้องมี: ไฟล์ที่เพิ่งลากเข้ามาอาจ **ยังไม่ถูกบันทึกลง `momo_packing_upload`**
 * (ฝั่งจอบันทึกแบบ fire-and-forget) → SOT จะไม่รู้จักตู้นี้เลย → ตอบ "ตู้ไหน" ไม่ได้
 * ในจังหวะที่คนต้องการคำตอบที่สุด. และถ้าตู้นี้เคยอัพไฟล์เก่าไว้ ไฟล์ที่เห็นอยู่บนจอ
 * ต้องชนะ (ตัวจริง = ไฟล์ล่าสุด).
 *
 * วิธี: ตัดทุกบรรทัดที่ `cabinet === container` ออกจากทุก base ก่อน แล้วใส่บรรทัดของ
 * ไฟล์นี้ลงไป — ตู้อื่นไม่ถูกแตะ (multi-container ยังเทียบข้ามตู้ได้เหมือนเดิม).
 */
export function overlayPackingLines(
  dbMap: Map<string, PackingContainerLine[]>,
  container: string | null | undefined,
  fileRows: OverlayFileRow[],
): Map<string, PackingContainerLine[]> {
  const cab = String(container ?? "").trim();
  const out = new Map<string, PackingContainerLine[]>();
  for (const [base, lines] of dbMap) {
    const kept = cab ? lines.filter((l) => String(l.cabinet ?? "").trim() !== cab) : lines;
    if (kept.length > 0) out.set(base, [...kept]);
  }
  if (!cab) return out;
  for (const r of fileRows) {
    const base = String(r.baseTracking ?? "").trim();
    if (!base) continue;
    const line: PackingContainerLine = {
      cabinet: cab,
      boxes: Number(r.boxes ?? 0) || 0,
      weightKg: Number(r.weight ?? 0) || 0,
      cbm: Number(r.cbm ?? 0) || 0,
      subCount: Number(r.subCount ?? 0) || 0,
      cg: r.cg ?? null,
    };
    out.set(base, [...(out.get(base) ?? []), line]);
  }
  return out;
}

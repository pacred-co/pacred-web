/**
 * "MOMO บิลของที่เราไม่เคยรับเข้า — สร้างรายการจากใบนี้ได้ไหม" (owner 2026-08-03).
 *
 * ปัญหาที่ปิด
 * ───────────
 * owner: *"เจอใน MOMO แต่ไม่เจอในระบบเราได้ไงครับ ตกหล่นไปอีกกี่แทรคกิ้งเนี่ยครับ …
 * พอไปดูที่ MOMO ก็เจอ แต่ของเราไม่เจอ สรุปเรามั่วเองนี่นา"* — พัสดุ `300251844018`
 * อยู่บนใบวางบิล `INV-20260728-0002` (MOMO เก็บเงินเราแล้ว ฿1,391.67) แต่ **ไม่มีในระบบ
 * เราเลยทั้ง 3 ที่** (staging · tb_forwarder · แพคกิ้งลิส). หน้าอัพใบวางบิลเดิมออกแบบมา
 * เป็น "ตัวเทียบ + เขียนทับต้นทุนของแถวที่มีอยู่แล้ว" เท่านั้น → บรรทัดที่จับคู่ไม่ได้
 * กลายเป็นข้อความแดง "ไม่พบในระบบ" ที่ **ไม่มีปุ่มอะไรให้กดเลย** = ทางตัน.
 *
 * โมดูลนี้ = **ตัวตัดสินว่าบรรทัดหนึ่งบนใบ "เพาะแถวใหม่" ได้ไหม** ใช้ทั้ง 2 ฝั่ง:
 *   • ฝั่งจอ  — ตัดสินว่าจะโชว์ปุ่ม หรือโชว์เหตุผลว่าทำไมสร้างไม่ได้ (§0d: ห้ามตัน+เงียบ)
 *   • ฝั่ง server — ตัดสินซ้ำจากใบที่แกะใหม่ ก่อนเขียนจริง (client ส่งมาแค่เลขแทรคกิ้ง)
 * → จอกับ server ปฏิเสธด้วยกฎชุดเดียวกันเสมอ.
 *
 * 🔴 กฎที่ fail-CLOSED (ทุกข้อมีเหตุผลจากของจริง ไม่ใช่ความระวังลอยๆ)
 * ──────────────────────────────────────────────────────────────────
 * 1. **จับคู่ได้แล้ว** → ไม่ต้องสร้าง (ปุ่มบันทึกต้นทุน/ตัดจ่ายเดิมทำงานอยู่แล้ว).
 * 2. **เลขมี suffix `-N` / `-N/M`** → ปฏิเสธ. ตัวเขียน (`createMissingMomoForwarderRow`)
 *    เขียน `ftrackingchn` เป็น **เลขฐาน** เสมอ (baseTrackingOf) → กดบนบรรทัด
 *    `1783582423-8` (qty 14) จะได้แถว **เลขฐาน** ที่ถือน้ำหนัก/คิวของกล่องเดียว = ทรง
 *    "aggregate header" ปลอม ที่รอบถัดไป `bare_base` fallback จะจับคู่กับบรรทัด `-1/N`
 *    แล้วเขียนต้นทุนของกล่องอื่นทับ — คลาสเดียวกับ half-split residue / fanout ที่เพิ่ง
 *    ไล่ปิดกันมา. ของทั้งชุดต้องนำเข้าทางปกติ ไม่ใช่เพาะจากใบ.
 * 3. **ใบไม่พิมพ์เลขตู้** → ปฏิเสธ (ใบทรงเก่าเขียน "(Guangzhou - TH)"). ไม่รู้ตู้ =
 *    ฐานต้นทุน/รายงานตู้ผิดตั้งแต่แถวแรก และเราไม่เดาเลขตู้.
 * 4. **เลขบนใบไม่ใช่ "ตู้"** (กระสอบ CBX… / placeholder รอบขนส่ง) → ปฏิเสธพร้อมบอกเหตุผล
 *    ตั้งแต่บนจอ แทนที่จะให้ `cabinetWriteGuard` ปฏิเสธตอนกดแล้วค่อยงง.
 * 5. **แพคกิ้งลิสค้านเลขตู้บนใบ** → ปฏิเสธ. ทั้งระบบตั้งอยู่บนสมมติฐานว่าเลขตู้ของ MOMO
 *    เชื่อไม่ได้ (SOT: lib/admin/momo-container-truth.ts) — ปั๊มเลขตู้จากใบทั้งที่แพคกิ้ง
 *    ค้าน = ด่าน `cabinetConflict` รอบหน้าจะตอบตัวเองว่า "ตรง" โดยโครงสร้าง.
 *
 * ⚪ เจ้าของ (PR) **ไม่ใช่เงื่อนไขบล็อก**: ไม่มี PR = เข้าเลน NO CODE (fstatus 99) ที่
 * owner เคาะไว้แล้ว — บิลไม่ได้เชิงโครงสร้าง (`lib/forwarder/billing-eligibility.ts`)
 * และมี workflow "ใส่ PR → กลับเข้า flow" ของ CS รออยู่. ปฏิเสธไปเลย = MOMO เก็บเงินเรา
 * แล้วแต่ระบบไม่รู้จักของชิ้นนี้ = สภาพเดิมที่ owner ด่า · เดา PR = เจ้าของปลอมรั่วเข้า
 * เส้นเงิน. สร้างค้างไว้ให้ CS หาเจ้าของ = ทางเดียวที่ทั้งไม่หายและไม่มั่ว.
 *
 * PURE — ไม่มี I/O / DB / clock.
 */

import { baseTrackingOf, normalizeMomoPrCode } from "./momo-raw-helpers";
import { isNonContainerCabinetId } from "@/lib/forwarder/cabinet-class";

/** โหมดการนำเข้า — mirror `commitMomoRowSchema.mode` (lib/admin/commit-momo-row-core.ts). */
export type MomoCreateMode = "normal" | "special-no-code";

export type InvoiceCreateDecision =
  | {
      allowed: true;
      /** โหมด **ตั้งต้น** จากคอลัมน์รหัสบนใบ — ฝั่ง server อาจอัพเกรด no-code → normal
       *  ได้อีกชั้นถ้าบอร์ด MOMO Live ถือ PR อยู่ (ดู pickMomoLivePrCode). */
      mode: MomoCreateMode;
      /** PR ที่ normalize แล้ว (null เมื่อโหมด no-code). */
      memberCode: string | null;
      /** เลขตู้ที่จะเขียน (trim แล้ว). */
      cabinet: string;
      /** ข้อความไทยอธิบายว่าจะสร้างอะไร — ใช้บนปุ่ม/กล่องยืนยัน. */
      reason: string;
    }
  | { allowed: false; reason: string };

export type InvoiceCreateInput = {
  /** เลขแทรคกิ้งตามที่พิมพ์บนใบ. */
  tracking: string;
  /** เลขตู้ที่ใบระบุ (null = ใบทรงเก่าที่ไม่พิมพ์ตู้). */
  cabinet: string | null;
  /** รหัสสมาชิกตามที่พิมพ์บนใบ (null = "No Code"). */
  memberCode: string | null;
  /** จับคู่กับ tb_forwarder ได้แล้วหรือยัง. */
  matched: boolean;
  /** เลขตู้ที่แพคกิ้งลิสยืนยัน (null/undefined = แพคกิ้งยังตอบไม่ได้ → ไม่ถือว่าค้าน). */
  packingShouldBe?: string | null;
};

export function decideCreateFromInvoiceLine(input: InvoiceCreateInput): InvoiceCreateDecision {
  const tracking = input.tracking.trim();

  if (input.matched) {
    return { allowed: false, reason: "มีรายการนี้ในระบบแล้ว — ไม่ต้องสร้างใหม่" };
  }
  if (tracking === "") {
    return { allowed: false, reason: "บรรทัดนี้ไม่มีเลขแทรคกิ้ง — สร้างไม่ได้" };
  }

  const base = baseTrackingOf(tracking);
  if (base !== tracking) {
    return {
      allowed: false,
      reason:
        `MOMO บิลบรรทัดนี้เป็นกล่องย่อยของชุดแยก (${tracking}) — สร้างจากใบไม่ได้ ` +
        `เพราะระบบจะเก็บเป็นเลขฐาน "${base}" ที่ถือน้ำหนัก/คิวของกล่องเดียว แล้วรอบหน้า ` +
        `ต้นทุนของกล่องอื่นจะถูกเขียนทับแถวนี้ · ของทั้งชุดต้องนำเข้าทางปกติ (ตรวจกับโกดัง)`,
    };
  }

  const cabinet = (input.cabinet ?? "").trim();
  if (cabinet === "") {
    return {
      allowed: false,
      reason:
        "ใบไม่ได้พิมพ์เลขตู้บนบรรทัดนี้ (ใบทรงเก่า) — สร้างไม่ได้ เพราะไม่รู้ว่าอยู่ตู้ไหน · " +
        "ขอใบที่ระบุตู้จาก MOMO หรืออัพแพคกิ้งลิสของตู้ก่อน",
    };
  }
  if (isNonContainerCabinetId(cabinet)) {
    return {
      allowed: false,
      reason:
        `"${cabinet}" ที่ใบระบุไม่ใช่เลขตู้ (เป็นเลขกระสอบ/รหัสรอบขนส่ง) — สร้างไม่ได้ · ` +
        `ต้องได้เลขตู้จริงก่อน (ดูแพคกิ้งลิสของตู้)`,
    };
  }

  const shouldBe = (input.packingShouldBe ?? "").trim();
  if (shouldBe !== "" && shouldBe !== cabinet) {
    return {
      allowed: false,
      reason:
        `แพคกิ้งลิสว่าชิปเม้นนี้อยู่ตู้ "${shouldBe}" แต่ใบว่า "${cabinet}" — สร้างไม่ได้ ` +
        `จนกว่าจะตรวจให้ตรงกัน (ระบบไม่ปั๊มเลขตู้จากใบทับสิ่งที่แพคกิ้งลิสค้าน)`,
    };
  }

  const pr = normalizeMomoPrCode(input.memberCode);
  if (pr) {
    return {
      allowed: true,
      mode: "normal",
      memberCode: pr,
      cabinet,
      reason: `สร้างรายการนำเข้าให้ลูกค้า ${pr} ในตู้ ${cabinet}`,
    };
  }
  return {
    allowed: true,
    mode: "special-no-code",
    memberCode: null,
    cabinet,
    reason:
      `ใบไม่ได้ระบุรหัสลูกค้า (No Code) — จะสร้างเป็นสถานะพิเศษ NO CODE ในตู้ ${cabinet} ` +
      `ให้ CS หาเจ้าของต่อ (แถว NO CODE วางบิลเก็บเงินไม่ได้จนกว่าจะใส่ PR)`,
  };
}

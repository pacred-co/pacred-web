/**
 * บอร์ด MOMO Live (`momo_box_detail`) = ความจริงจากเว็บ MOMO ที่ cron refresh ไว้ —
 * ใช้ตอบ 2 คำถามตอนที่ staging ตอบไม่ได้: **"พัสดุนี้เป็นของใคร (PR)"** และ **"อยู่ตู้ไหน"**.
 *
 * ทำไมต้องเป็นโมดูลแยก (ไม่ก๊อปตรรกะ)
 * ─────────────────────────────────────
 * เดิมการตัดสิน "แถวไหนบนบอร์ดถือ PR ที่ใช้ได้" ฝังอยู่ในเลน NO CODE ของ
 * `lib/admin/commit-momo-row-core.ts` ที่เดียว (owner 2026-08-02: *"มี PR แล้ว ทำไม
 * ไม่เติมให้เราเลย"*). พอมีทางเข้าที่ 2 — สร้างแถวจาก **ใบวางบิล MOMO** (owner 2026-08-03:
 * *"เจอใน MOMO แต่ไม่เจอในระบบเราได้ไงครับ ตกหล่นไปอีกกี่แทรคกิ้งเนี่ยครับ"*) — การก๊อป
 * ตรรกะไปวางอีกที่จะกลายเป็น **นิยาม NO CODE 2 ชุด** ที่ drift ได้เงียบๆ (ทางหนึ่งยอมรับ
 * "PCS10830" อีกทางไม่ยอมรับ = พัสดุเดียวกันได้เจ้าของต่างกันแล้วแต่ว่าเข้ามาทางไหน).
 * ตัวตัดสินจึงอยู่ที่นี่ที่เดียว · ทั้ง 2 ทางเรียกตัวเดียวกัน.
 *
 * ⚠️ ตัว query ยังอยู่ที่ผู้เรียก (คนละ posture กัน: commit-core fail-CLOSED เมื่ออ่านบอร์ด
 * ไม่ได้ เพราะมันกำลังจะเขียนแถวเงิน · ทางใบวางบิลก็ fail-CLOSED เหมือนกันแต่คนละข้อความ)
 * — ที่แชร์กันคือ **การตัดสิน** ซึ่งเป็นสิ่งที่ห้าม drift.
 *
 * PURE — ไม่มี I/O / DB / clock → เทสได้ตรงๆ.
 */

import { normalizeMomoPrCode } from "./momo-raw-helpers";
import { isNonContainerCabinetId } from "@/lib/forwarder/cabinet-class";

/** แถวจากบอร์ด MOMO Live เท่าที่การตัดสิน 2 ข้อนี้ต้องใช้. */
export type MomoLiveBoardRow = {
  member_code?: string | null;
  container_name?: string | null;
};

/**
 * PR ตัวแรกบนบอร์ดที่ "ระบุตัวลูกค้าได้จริง".
 *
 * ใช้ `normalizeMomoPrCode` เป็นตัวชี้ขาด (SOT เดียวกับทุกทาง) → `^PR\d+$` เท่านั้น:
 * "PR" เปล่า · "PCS10830" (รหัสยุคเก่า) · ตัวเลขลอยๆ · ค่าว่าง = **ไม่ผ่าน** เพราะ
 * ระบุลูกค้าไม่ได้ และการเดาเจ้าของ = พัสดุรั่วเข้าเส้นราคา/กระเป๋าเงิน/การวางบิลของคนอื่น
 * (คอมเมนต์เดียวกับ commit-momo-row-core: *"Never manufacture a PR placeholder"*).
 */
export function pickMomoLivePrCode(rows: readonly MomoLiveBoardRow[]): string | null {
  for (const row of rows) {
    const pr = normalizeMomoPrCode(row.member_code);
    if (pr) return pr;
  }
  return null;
}

/**
 * เลขตู้จริงตัวแรกบนบอร์ด — ข้ามกระสอบ (CBX…) และ placeholder รอบขนส่งของระบบ
 * (`PR20260720-SEA01`) ผ่าน `isNonContainerCabinetId` (SOT: lib/forwarder/cabinet-class.ts).
 * ค่าที่ได้จึงเขียนลง `fcabinetnumber` ได้โดยไม่ชน `cabinetWriteGuard`.
 */
export function pickMomoLiveContainer(rows: readonly MomoLiveBoardRow[]): string | null {
  for (const row of rows) {
    const name = (row.container_name ?? "").trim();
    if (name !== "" && !isNonContainerCabinetId(name)) return name;
  }
  return null;
}

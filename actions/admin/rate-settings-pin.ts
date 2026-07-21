"use server";

/**
 * verifyRateSettingsPin — ด่านรหัสของกล่อง "ค่าเทียบ · ราคาขั้นต่ำ"
 * (owner 2026-07-21: *"ล็อคไว้นะ กดแล้วให้ใส่รหัส"*).
 *
 * ทำไมต้องล็อก: 2 ค่านี้เป็น **ตัวคูณเงินทั้งระบบ** — ค่าเทียบตัดสินว่าชิปเม้นคิดตาม
 * กก. หรือ คิว · ราคาขั้นต่ำคือด่านกันตั้งเรทต่ำกว่าทุน. กดพลาดทีเดียวกระทบทุกงาน
 * ของลูกค้ารายนั้น → กันคนลั่นด้วยรหัสอีกชั้น.
 *
 * ตรวจ **ฝั่ง server** (แพทเทิร์นเดียวกับ verifyCostRevealPin ของ ภูม 2026-06-16)
 * เพื่อให้รหัสไม่ติดไปกับ client bundle — ถ้าเช็คในหน้าจอ ใครเปิด devtools ก็เห็น.
 *
 * ⚠️ นี่คือด่าน "กันลั่น/กันคนข้างๆ" ไม่ใช่ระบบความปลอดภัยจริง — ตัวคุมสิทธิ์จริงคือ
 * role gate ฝั่ง server (แก้ราคาขั้นต่ำได้เฉพาะ ultra · แก้ค่าเทียบเฉพาะ role ที่มีสิทธิ์)
 * ซึ่งยังทำงานอยู่ครบไม่ว่าจะผ่านรหัสนี้หรือไม่.
 */

import { requireAdmin } from "@/lib/auth/require-admin";

// รหัสที่ owner ตั้ง — override ได้ด้วย env เพื่อเปลี่ยนรหัสโดยไม่ต้องแก้โค้ด
// (server-only module · ไม่มีทางหลุดไป client bundle).
const RATE_SETTINGS_PIN = (process.env.RATE_SETTINGS_PIN ?? "popza007").trim();

export async function verifyRateSettingsPin(pin: unknown): Promise<{ ok: boolean }> {
  // ต้องเป็นแอดมินที่ล็อกอินอยู่ก่อน แล้วรหัสเป็นด่านที่สอง
  await requireAdmin();
  if (typeof pin !== "string") return { ok: false };
  return { ok: pin.trim() === RATE_SETTINGS_PIN };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * resolveLastUsedCarrier — "ยึดตามงานล่าสุดของ PR นั้นๆ ว่าเขาเลือกส่งแบบไหน"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * owner 2026-07-21 (verbatim): *"หลังจากนี้ ก็ยึดตามงานล่าสุดของ PR นั้น ๆ ไปเลยครับ
 * ว่าเขาเลือกส่งแบบไหนครับ แล้วถ้ามีอะไรจะเปลี่ยนก็ค่อยไปเปลี่ยนกันวันหลัง"*
 *
 * WHY IT EXISTS: งานที่ถูกสร้างโดยไม่มีคนเลือกขนส่ง (MOMO import / งานที่คีย์เข้ามา
 * ก่อนคุยกับลูกค้า) เคยลงมาเป็น fshipby ว่าง แล้วค้างแบบนั้นจนมีคนไปกดเลือกทีละแถว
 * (prod 2026-07-21: 263 แถวค้างจาก 48 ลูกค้า). ลูกค้าส่วนใหญ่ส่งแบบเดิมทุกครั้ง —
 * ระบบจึงควรหยิบ "แบบที่เขาใช้ล่าสุด" มาตั้งให้เอง แล้วให้ CS/ลูกค้าเปลี่ยนทีหลังได้.
 *
 * ลำดับการหา (เหมือน cart.php L154-161 ที่ legacy ใช้ตอนสร้างออเดอร์):
 *   1. ค่าที่ลูกค้าตั้งไว้เอง — `tb_users."userShipBy"`
 *      (⚠️ ตารางนี้เป็น camelCase มี quote จริง — เขียนตัวเล็กจะ error ทั้ง query)
 *   2. ขนส่งของงานล่าสุดของลูกค้าคนนั้น (ORDER BY id DESC · ข้ามแถวที่ยังว่าง)
 *   3. ไม่มีเลย = ลูกค้าใหม่ → คืน null → **ห้ามเดา** (owner: "งานไหนที่ไม่เคยมี
 *      ประวัติอะไรเลย … ก็ค่อยให้ CS มาใส่อีกที เพราะครั้งแรก ไม่ก็รอลูกค้าเขาตั้ง
 *      ค่าที่อยู่จัดส่ง") — เดาแล้วผิดคือของไปผิดบ้าน แพงกว่าปล่อยว่างให้คนเติม.
 *
 * ค่าที่ยาวเกิน 10 ตัวถูกทิ้ง (tb_forwarder.fshipby = varchar(10) — ค่า migrate
 * ที่เพี้ยนจะทำให้ INSERT ล้มทั้งงาน).
 *
 * SCOPE: คืน "รหัสขนส่ง" อย่างเดียว. วิธีเก็บเงิน + ค่าส่งไทย ตามมาจากกติกากลาง
 * (`enforceCodDomesticZero` · เอกชน = ปลายทาง + ค่าส่งไทย ฿0) — ไม่ตัดสินที่นี่.
 * READ-ONLY · ไม่เขียนอะไร · error = คืน null (fail-safe ไม่ทำให้ caller ล้ม).
 */
export async function resolveLastUsedCarrier(
  admin: SupabaseClient,
  userID: string,
): Promise<string | null> {
  const uid = (userID ?? "").trim();
  if (!uid) return null;

  // 1. ค่าที่ลูกค้าตั้งไว้ (ตามที่ลูกค้าเลือก)
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select('"userShipBy"')
    .eq("userID", uid)
    .maybeSingle<{ userShipBy: string | null }>();
  if (userErr) {
    console.error("[resolveLastUsedCarrier user] failed", { code: userErr.code, message: userErr.message, userID: uid });
  }
  const saved = (userRow?.userShipBy ?? "").trim();
  if (saved && saved.length <= 10) return saved;

  // 2. ขนส่งของงานล่าสุด (ข้ามแถวที่ยังไม่ได้เลือก — ไม่งั้นแถวว่างล่าสุดจะบังของจริง)
  const { data: lastFwd, error: lastErr } = await admin
    .from("tb_forwarder")
    .select("fshipby")
    .eq("userid", uid)
    .not("fshipby", "is", null)
    .neq("fshipby", "")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ fshipby: string | null }>();
  if (lastErr) {
    console.error("[resolveLastUsedCarrier last-order] failed", { code: lastErr.code, message: lastErr.message, userID: uid });
  }
  const last = (lastFwd?.fshipby ?? "").trim();
  if (last && last.length <= 10) return last;

  // 3. ลูกค้าใหม่ / ไม่เคยมีประวัติ → ห้ามเดา
  return null;
}

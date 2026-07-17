/**
 * ขีดจำกัดตัวอักษร "ชื่อ/แคปชั่น" ต่อแพลตฟอร์ม (owner ปอน 2026-07-18) — ใช้โชว์ตัวนับ
 * ในฟอร์มคอนเทนต์ เพื่อดราฟต์ชื่อให้พอดีลิมิตจริงตอนอัปคลิปแต่ละที่. Pure.
 *
 * ⚠️ ค่าตั้งต้น (owner ปรับได้) — อ้างอิงลิมิตจริงของช่องชื่อ/แคปชั่นเวลาอัปโหลด:
 *   youtube = ชื่อวิดีโอ 100 · tiktok/instagram/facebook = แคปชั่น Reels/วิดีโอ 2,200 ·
 *   website/blog = SEO title 60. แพลตฟอร์มที่ไม่อยู่ใน map = ไม่จำกัด (ไม่โชว์ตัวนับ).
 */

/** platform key → ลิมิตตัวอักษร. ไม่มีใน map = ไม่จำกัด. */
export const PLATFORM_TITLE_LIMIT: Record<string, number> = {
  youtube: 100,
  facebook: 2200,
  tiktok: 2200,
  instagram: 2200,
  website: 60,
  blog: 60,
};

/** ลิมิตของแพลตฟอร์ม — จาก key ก่อน (fallback ชื่อ). undefined = ไม่จำกัด. */
export function titleLimitFor(item: { key?: string; name?: string }): number | undefined {
  const byKey = item.key ? PLATFORM_TITLE_LIMIT[item.key.toLowerCase()] : undefined;
  if (byKey != null) return byKey;
  return item.name ? PLATFORM_TITLE_LIMIT[item.name.toLowerCase()] : undefined;
}

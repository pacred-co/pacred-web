import { z } from "zod";
import { isDirectImageUrl, normalizeImageUrl } from "@/lib/legacy-image";

/**
 * The ONE image-URL field validator for every product-image write path.
 *
 * Why this exists (owner-reported 2026-07-10 "แนบรูปแล้วไม่ขึ้น"): the image value a
 * customer or CS staffer supplies is stored verbatim in `tb_cart.cimages`, then
 * copied UNVALIDATED into `tb_order.cimages` → `tb_header_order.hcover` →
 * `tb_forwarder.fcover`. A single bad paste — a Google-Drive **folder** link, a
 * product WEBPAGE url, an `postimg.cc/<id>` share page instead of the direct
 * `i.postimg.cc/...` image — silently breaks the product image on every downstream
 * admin and customer surface, and (until now) there was no way to repair it.
 *
 * The field therefore:
 *   1. REJECTS a value that can never render as an `<img>` (see `isDirectImageUrl`).
 *   2. NORMALISES what it accepts (`normalizeImageUrl`): a Google-Drive *file* link
 *      becomes its embeddable thumbnail URL, dead `zzqss` proxies become alicdn,
 *      Aliyun OSS `?x-oss-process=` params are stripped. So the DB ends up holding a
 *      URL that actually loads.
 *   3. Enforces the REAL DB ceiling (`tb_cart.cimages` / `tb_order.cimages` are
 *      `varchar(300)`), so an over-long URL fails with this message instead of a
 *      raw Postgres 22001 on INSERT.
 *
 * Empty string is always allowed and means "no image".
 */
export const IMAGE_URL_HINT =
  "ลิงก์รูปภาพไม่ถูกต้อง — ต้องเป็นลิงก์รูป (ไฟล์ภาพ) โดยตรง " +
  "ไม่ใช่ลิงก์โฟลเดอร์ Google Drive หรือลิงก์หน้าเว็บ " +
  "เช่น ใช้ https://i.postimg.cc/xxx/yyy.jpg แทน https://postimg.cc/xxx";

/**
 * @param max Maximum stored length. Pass the real DB column width (300 for
 *            `cimages`) — the check runs AFTER normalisation, which often shortens
 *            the URL (OSS params stripped), so a borderline link can still pass.
 */
export function imageUrlField(max = 300) {
  return z
    .string()
    .trim()
    // Validate the RAW value first: `isDirectImageUrl` is the thing that knows a
    // Drive folder link / share page can never be embedded. (Normalising first
    // would collapse a folder link to "" and silently look like "no image".)
    .refine((s) => s === "" || isDirectImageUrl(s), { message: IMAGE_URL_HINT })
    .transform((s) => (s === "" ? "" : normalizeImageUrl(s)))
    .refine((s) => s.length <= max, {
      message: `ลิงก์รูปภาพยาวเกินไป (สูงสุด ${max} ตัวอักษร)`,
    });
}

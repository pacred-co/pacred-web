/**
 * PRODUCT TEXT — the ONE ceiling for every product name / shop name / product
 * link / product image, for everyone (ลูกค้า และ พนักงาน).
 *
 * 🔴 owner 2026-07-22: "แก้ไขให้หน่อยไม่สามารถกดสั่งในระบบได้ · ปรับขนาด database
 * จาก 300 เป็น 1000 หรือยังไงก็ได้ ให้มันตรงชื่อเวลากดสั่งอะครับ"
 *
 * WHAT BROKE (proven, not guessed): the staff "วางลิงก์" add-to-cart at
 * /admin/service-orders/cart/add sends `curl: product.sourceUrl` — the URL the
 * staffer PASTED, verbatim. A 1688 offer opened from a search result carries
 * `?spm=…&offerId=…&sortType=…&hotSaleSkuId=…&trace_log=…&uuid=…&forcePC=…`
 * plus a percent-encoded Chinese `keywords=` (9 bytes per Chinese character) —
 * a real one measures **401 chars**. `adminCartItemSchema.curl` was a bare
 * `.max(300)`, so zod refused it with its own untranslated default,
 * "Too big: expected string to have <=300 characters", and the admin surface
 * rendered that raw string to the operator. Order dead, no explanation.
 *
 * PROD CONFIRMS IT — the survivorship fingerprint on `tb_order.curl` (URLs that
 * carry query params): 87 rows under 100 chars · 41 in 100-199 · 100 in 200-249 ·
 * 37 in 250-289 · **0 in 290-300 · 0 above**. Everything longer than the column
 * was silently amputated for as long as the flow has existed.
 *
 * WHAT IS REAL: the DB column. `tb_cart` / `tb_order` `.ctitle` `.cnameshop`
 * `.curl` `.cimages` were `varchar(300)` — and the values that land in them are
 * scrape output (a marketplace title / a vendor string / a tracking-stuffed URL),
 * which nobody bounds for us. Migration 0272 widens them (and the downstream
 * `tb_header_order.htitle`/`.hcover` + `tb_forwarder.fcover` they are copied into
 * at order-submit) to varchar(1000); PRODUCT_TEXT_MAX below IS that number.
 *
 * WHY 1000 AND NOT `text`: so the validator and the column can share ONE number.
 * `text` removes the ceiling entirely — then a runaway paste (a whole 1688 app
 * share blob, a base64 data-URI image) has no backstop at any layer. 1000 clears
 * the worst real values by a wide margin (worst URL seen 401 · ภูม once pasted
 * 935 · worst real 1688 title 50 · worst vendor 10 · worst image URL 90).
 *
 * THE RULE FOR EVERY SURFACE (same as lib/validators/order-qty.ts): the input's
 * `maxLength`, the clamp/normalise while typing, and the submit validation must
 * all come from HERE. A value the server would reject must be impossible to
 * submit — that mismatch is what produced the invisible wall in the first place.
 * And every cap carries a THAI message that names the field and the limit: an
 * error that does not name the real problem leaves the customer stuck forever
 * ([[wrong-error-message-hides-real-block]]).
 */

import { z } from "zod";
import { imageUrlField } from "@/lib/validators/image-url";
import { normalizeProductUrl, MAX_URL_CHARS } from "@/lib/url/normalize-product-url";

/**
 * `tb_cart` / `tb_order` `.ctitle` `.cnameshop` `.curl` `.cimages` — and the
 * `tb_header_order.htitle`/`.hcover` + `tb_forwarder.fcover` they roll up into
 * (migration 0272). Change this ONLY together with a migration.
 */
export const PRODUCT_TEXT_MAX = 1000;

/** Product link (`curl`). Same column width — named separately so a future
 *  URL-only change doesn't silently move the title ceiling too. */
export const PRODUCT_URL_MAX = PRODUCT_TEXT_MAX;

/** Product image link (`cimages` → `hcover` → `fcover`). */
export const PRODUCT_IMAGE_URL_MAX = PRODUCT_TEXT_MAX;

/** `ccolor` / `csize` are `varchar(200)` — unchanged by 0272. */
export const VARIANT_TEXT_MAX = 200;

/** `cdetails` is `text` in both tables; this is a sanity bound, not a column width. */
export const PRODUCT_DETAILS_MAX = 2000;

/** ชื่อสินค้า — `ctitle` (→ `htitle`). */
export function productTitleField() {
  return z
    .string()
    .trim()
    .max(PRODUCT_TEXT_MAX, {
      message: `ชื่อสินค้ายาวเกินไป (สูงสุด ${PRODUCT_TEXT_MAX} ตัวอักษร)`,
    });
}

/** ชื่อร้าน — `cnameshop`. */
export function shopNameField() {
  return z
    .string()
    .trim()
    .max(PRODUCT_TEXT_MAX, {
      message: `ชื่อร้านยาวเกินไป (สูงสุด ${PRODUCT_TEXT_MAX} ตัวอักษร)`,
    });
}

/**
 * ลิงก์สินค้า — `curl`.
 *
 * NORMALISES BEFORE MEASURING. `normalizeProductUrl` already knows that a
 * marketplace product is fully identified by `offer/{id}` (1688) / `?id=` +
 * `?skuId=` (Taobao·Tmall) / `?wareId=` (JD) and that every other param is
 * ad-attribution noise — the customer path has called it at INSERT time since
 * 2026-06-05, the staff path never did. Running it INSIDE the field means the
 * 401-char paste that broke the owner's order becomes a 47-char canonical URL
 * and can no longer be rejected by anyone. The `.max` below stays as the
 * backstop for the fail-open case (free text that isn't a URL at all).
 *
 * @param required pass true for the staff form, where the URL is mandatory.
 */
export function productUrlField(opts: { required?: boolean } = {}) {
  const base = z.string().trim();
  const bounded = opts.required
    ? base.min(1, { message: "กรุณากรอก URL สินค้า" })
    : base;
  return bounded
    .transform((s) => (s === "" ? "" : normalizeProductUrl(s)))
    .refine((s) => s.length <= PRODUCT_URL_MAX, {
      message: `ลิงก์สินค้ายาวเกินไป (สูงสุด ${PRODUCT_URL_MAX} ตัวอักษร)`,
    });
}

/**
 * ลิงก์รูปสินค้า — `cimages`. Delegates to the shared image-URL field (which
 * rejects a Drive-folder/share-page link, normalises a Drive file link, strips
 * Aliyun OSS `?x-oss-process=` params) at the widened column width.
 */
export function productImageUrlField() {
  return imageUrlField(PRODUCT_IMAGE_URL_MAX);
}

/** สี / ขนาด — `ccolor` / `csize` (`varchar(200)`). */
export function variantTextField(label: "สี" | "ขนาด") {
  return z
    .string()
    .trim()
    .max(VARIANT_TEXT_MAX, {
      message: `${label}ยาวเกินไป (สูงสุด ${VARIANT_TEXT_MAX} ตัวอักษร)`,
    });
}

/** รายละเอียด / หมายเหตุสินค้า — `cdetails` (`text`). */
export function productDetailsField() {
  return z
    .string()
    .trim()
    .max(PRODUCT_DETAILS_MAX, {
      message: `รายละเอียดสินค้ายาวเกินไป (สูงสุด ${PRODUCT_DETAILS_MAX.toLocaleString()} ตัวอักษร)`,
    });
}

/**
 * Invariant the unit test pins: the normaliser must truncate BELOW the column
 * width, so a normalised URL can never be the thing that fails validation.
 */
export const PRODUCT_URL_NORMALISE_CEILING = MAX_URL_CHARS;

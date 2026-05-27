"use server";

/**
 * Admin product-search server action — TAMIT link-paste for staff.
 *
 * Admin variant of `actions/product-search.ts` (the customer one,
 * cherry-picked from dave-pacred commit `356edcb`). Built for Wave 23
 * P2 #16 (2026-05-27 ภูม flag) so /admin/service-orders/cart/add can
 * paste a 1688/Taobao/Tmall URL → auto-fetch image + title + ¥ price
 * → add to a customer's cart in one click.
 *
 * ── Why a separate admin action (not the customer one) ───────────
 * The customer `searchProductByUrl` from `actions/product-search.ts`
 * runs `getCurrentUserWithProfile()` and requires `profile.member_code`
 * — fine for a customer pasting into their own cart, but admins don't
 * have a member_code. They auth via `withAdmin([...])` instead. The
 * `convertProductUrlDetail`, `isSupportedProductUrl`, and demo-fallback
 * detection logic are identical — only the auth gate differs.
 *
 * ── Graceful failure ────────────────────────────────────────────
 * TAMIT can be down / slow / rate-limited. Per the legacy posture
 * the action returns { ok: false, error, fallback: "manual" } and the
 * UI shows the legacy "ระบบค้นหาไม่พร้อม กรอกด้วยตนเอง" notice + the
 * manual `AdminAddCartForm` below the link-paste panel. Never throws.
 * Never blocks the page.
 */

import { z } from "zod";
import { convertProductUrlDetail } from "@/lib/china-search";
import { isSupportedProductUrl } from "@/lib/china-search/url-allow-list";
import { withAdmin, type AdminActionResult } from "./common";
import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────
// Input schema — lightweight; the heavy lifting (URL→productId)
// lives downstream in convertProductUrlDetail / extractProductId.
// ────────────────────────────────────────────────────────────
const searchProductByUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(10, { message: "URL สั้นเกินไป" })
    .max(2000, { message: "URL ยาวเกินไป" }),
});

export type AdminProductSearchOk = {
  /** Provider key — "1688" | "taobao" | "tmall". */
  provider: "1688" | "taobao" | "tmall";
  /** Best-effort product code (legacy `productID`). */
  productId?: string;
  /** Cleaned product title (Thai-translated if upstream returned it). */
  title: string;
  /** Best image URL (mainImage > listImage[0] > undefined). */
  imageUrl?: string;
  /** Shop / vendor name. */
  shopName?: string;
  /** Base price in CNY (¥). */
  priceCny: number;
  /** Promo / lowest-tier price if cheaper than base. */
  promoPriceCny?: number;
  /** Source URL (the URL the admin pasted, normalised). */
  sourceUrl: string;
};

export type AdminProductSearchErr =
  | "invalid_url"
  | "unsupported_host"
  | "not_configured"
  | "network_error"
  | "rate_limited"
  | "unexpected_error";

/** AdminActionResult-wrapped product card · adds a friendly Thai message. */
export type AdminProductSearchResult = AdminActionResult<AdminProductSearchOk> & {
  /** Thai-ready user-facing message for the err path (when ok=false). */
  message?: string;
  /** Always "manual" — UI falls back to AdminAddCartForm on err. */
  fallback?: "manual";
};

// CS roles that can use the cart-add tool (matches actions/admin/cart.ts CART_ROLES).
const SEARCH_ROLES = ["super", "ops", "sales_admin"] as const;

/**
 * Resolve a pasted 1688 / taobao / tmall URL → product card data.
 *
 * Never throws. Network/parse failures degrade to { ok: false, fallback:
 * "manual" } so the page can show the legacy "manual entry" notice and
 * keep the order flow alive.
 */
export async function searchProductByUrlAdmin(
  url: string,
): Promise<AdminProductSearchResult> {
  // 1. validate shape
  const parsed = searchProductByUrlSchema.safeParse({ url });
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_url" satisfies AdminProductSearchErr,
      message: parsed.error.issues[0]?.message ?? "URL ไม่ถูกต้อง",
      fallback: "manual",
    };
  }

  // 2. host allow-list — refuse non-china URLs up-front (no TAMIT round-trip)
  if (!isSupportedProductUrl(parsed.data.url)) {
    return {
      ok: false,
      error: "unsupported_host" satisfies AdminProductSearchErr,
      message:
        "รองรับเฉพาะลิงก์จาก 1688 / Taobao / Tmall เท่านั้น (เช่น detail.1688.com, item.taobao.com, detail.tmall.com)",
      fallback: "manual",
    };
  }

  // 3. admin auth gate via withAdmin (replaces customer's getCurrentUserWithProfile)
  return withAdmin<AdminProductSearchOk>([...SEARCH_ROLES], async () => {
    // 4. fetch via existing china-search adapter — handles TAMIT cache +
    //    detail + short-URL resolve + demo fallback.
    let detail;
    try {
      detail = await convertProductUrlDetail(parsed.data.url);
    } catch (err) {
      // convertProductUrlDetail catches inside but we belt-and-suspenders
      // here so a future refactor that throws upstream doesn't crash the
      // page. Log so we see partner-API regressions in Sentry.
      logger.error("admin/product-search", "convertProductUrlDetail threw", err);
      return {
        ok: false,
        error: "ระบบค้นหาไม่พร้อม กรุณากรอกรายการสินค้าด้วยตนเอง",
      };
    }

    if (!detail.available) {
      const friendly =
        detail.reason === "not_configured"
          ? "ระบบค้นหายังไม่ได้ตั้งค่า (TAMIT_API_KEY) · กรุณากรอกรายการเอง"
          : detail.reason === "rate_limited"
          ? "TAMIT จำกัด rate ชั่วคราว · ลองใหม่อีกครั้ง หรือกรอกเอง"
          : detail.message ?? "ระบบค้นหาไม่พร้อม กรุณากรอกรายการสินค้าด้วยตนเอง";
      return { ok: false, error: friendly };
    }

    const d = detail.detail;
    // Demo-fallback detection: convertProductUrlDetail returns a placeholder
    // card (base_price_cny=0 + no image) when TAMIT couldn't resolve — show
    // as soft error so admin sees the manual notice instead of an empty card.
    const isDemo =
      (d.base_price_cny ?? 0) === 0 &&
      !d.main_image &&
      (!d.images || d.images.length === 0);
    if (isDemo) {
      return {
        ok: false,
        error: "ไม่พบข้อมูลสินค้าจากลิงก์นี้ กรุณากรอกรายการสินค้าด้วยตนเอง",
      };
    }

    return {
      ok: true,
      data: {
        provider: d.provider,
        productId: d.product_id,
        title: d.title || `สินค้าจาก ${d.provider.toUpperCase()}`,
        imageUrl: d.main_image ?? d.images?.[0],
        shopName: d.shop_name,
        priceCny: d.base_price_cny ?? 0,
        promoPriceCny: d.promo_price_cny,
        sourceUrl: d.url,
      },
    };
  });
}

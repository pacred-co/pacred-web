"use server";

/**
 * Product-search server actions (D1 / ADR-0017 · fidelity §4).
 *
 * Closes the "Link-paste product search" gap called out in
 * `docs/research/d1-fidelity-customer.md` §4 — the defining legacy
 * `shops.php` / `cart/add/` workflow where a customer pastes a
 * Taobao / 1688 / Tmall URL and the system fetches title + image +
 * price, presents a qty input + add-to-cart button, and inserts a
 * `cart_items` row that flows through the existing cart + place-order
 * path.
 *
 * ── Why this lives in actions/ (not just /api/china-search) ───────
 * The /api/china-search GET endpoint already exists (Sprint-P-50 et al)
 * and wraps `convertProductUrlDetail`. The Server Action wrapper here
 * is the surface that the client component on /service-order/add binds
 * to — it adds:
 *
 *   1. URL allow-list (1688 / taobao / tmall + short-link hosts) so
 *      pasting "google.com" doesn't burn a TAMIT round-trip.
 *   2. Auth check matching the page's protected gate (the API route
 *      also auths, but failing here avoids a network hop in the UI).
 *   3. A typed `ProductSearchResult` shape narrowed for the V1 paste
 *      UI (single base price + image + name; no SKU axis grid in V1).
 *   4. Search-history side-effect (fire-and-forget) — keeps the legacy
 *      tb_search_history write in parity with the keyword-search path.
 *
 * ── Graceful failure ──────────────────────────────────────────────
 * TAMIT can be down / slow / rate-limited. Per the legacy posture
 * (and `docs/learnings/partner-apis-quirks.md`) the action returns
 * { ok: false, error, fallback: "manual" } and the UI shows the
 * legacy "ระบบค้นหาไม่พร้อม กรอกด้วยตนเอง" notice + the manual
 * add-item form. Never throws. Never blocks the page.
 */

import { z } from "zod";
import { convertProductUrlDetail } from "@/lib/china-search";
import { isSupportedProductUrl } from "@/lib/china-search/url-allow-list";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { saveSearchQuery } from "@/actions/search";
import { logger } from "@/lib/logger";

// URL host allow-list lives in lib/china-search/url-allow-list.ts so
// it can be unit-tested without dragging the `server-only` chain
// (convertProductUrlDetail → lib/china-search/index → "server-only").
// Re-exported here for legacy callers + the public ProductSearchErr
// shape that names "unsupported_host".
export { isSupportedProductUrl };

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

export type ProductSearchOk = {
  ok: true;
  product: {
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
    /** Source URL (the URL the customer pasted, normalised). */
    sourceUrl: string;
  };
};

export type ProductSearchErr = {
  ok: false;
  error:
    | "invalid_url"
    | "unsupported_host"
    | "not_signed_in"
    | "no_member_code"
    | "not_configured"
    | "network_error"
    | "rate_limited"
    | "unexpected_error";
  /** Optional user-facing message — Thai, ready to render. */
  message?: string;
  /** Always "manual" for V1 — the UI falls back to manual entry. */
  fallback: "manual";
};

export type ProductSearchResult = ProductSearchOk | ProductSearchErr;

/**
 * Resolve a pasted 1688 / taobao / tmall URL → product card data.
 *
 * Never throws. Network/parse failures degrade to { ok: false, fallback:
 * "manual" } so the page can show the legacy "manual entry" notice and
 * keep the order flow alive.
 */
export async function searchProductByUrl(
  url: string,
): Promise<ProductSearchResult> {
  // 1. validate shape
  const parsed = searchProductByUrlSchema.safeParse({ url });
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_url",
      message: parsed.error.issues[0]?.message ?? "URL ไม่ถูกต้อง",
      fallback: "manual",
    };
  }

  // 2. host allow-list — refuse non-china URLs up-front
  if (!isSupportedProductUrl(parsed.data.url)) {
    return {
      ok: false,
      error: "unsupported_host",
      message:
        "รองรับเฉพาะลิงก์จาก 1688 / Taobao / Tmall เท่านั้น (เช่น detail.1688.com, item.taobao.com, detail.tmall.com)",
      fallback: "manual",
    };
  }

  // 3. auth — match the protected layout's gate so the failure happens
  //    inside the action (no point doing a network call for a logged-out
  //    user). saveSearchQuery would no-op anonymously anyway.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) {
    return {
      ok: false,
      error: "not_signed_in",
      message: "กรุณาเข้าสู่ระบบ",
      fallback: "manual",
    };
  }
  if (!data.profile.member_code) {
    return {
      ok: false,
      error: "no_member_code",
      message: "บัญชีของท่านยังไม่มีรหัสสมาชิก",
      fallback: "manual",
    };
  }

  // 4. fetch via existing china-search adapter — handles TAMIT cache +
  //    detail + short-URL resolve + demo fallback.
  let detail;
  try {
    detail = await convertProductUrlDetail(parsed.data.url);
  } catch (err) {
    // convertProductUrlDetail catches inside but we belt-and-suspenders
    // here so a future refactor that throws upstream doesn't crash the
    // page. saveSearchQuery is fire-and-forget below; still log so we
    // see partner-API regressions in Sentry.
    logger.error("product-search", "convertProductUrlDetail threw", err);
    return {
      ok: false,
      error: "network_error",
      message:
        "ระบบค้นหาไม่พร้อม กรุณากรอกรายการสินค้าด้วยตนเอง",
      fallback: "manual",
    };
  }

  // 5. fire-and-forget search-log (parity with /api/china-search route)
  void saveSearchQuery({
    query: parsed.data.url,
    source: "china-search.url-detail",
  });

  // convertProductUrlDetail returns { available: true } even on failure
  // (it serves a demo card so checkout doesn't break) — but when the
  // demo has no title / no price the UX is worse than telling the user
  // "ระบบไม่พร้อม". Detect the demo-fallback case explicitly: the
  // helper sets base_price_cny=0 + an empty main_image when it had to
  // synthesize the row.
  if (!detail.available) {
    return {
      ok: false,
      error: detail.reason === "not_configured" ? "not_configured"
            : detail.reason === "rate_limited" ? "rate_limited"
            : "network_error",
      message:
        detail.message ??
        "ระบบค้นหาไม่พร้อม กรุณากรอกรายการสินค้าด้วยตนเอง",
      fallback: "manual",
    };
  }

  const d = detail.detail;
  const isDemo =
    (d.base_price_cny ?? 0) === 0 &&
    !d.main_image &&
    (!d.images || d.images.length === 0);
  if (isDemo) {
    // The adapter returned a placeholder card — surface as a soft error
    // so the UI shows the manual notice. We still got back a productId
    // sometimes; not useful for the customer without price + image.
    return {
      ok: false,
      error: "network_error",
      message:
        "ไม่พบข้อมูลสินค้าจากลิงก์นี้ กรุณากรอกรายการสินค้าด้วยตนเอง",
      fallback: "manual",
    };
  }

  return {
    ok: true,
    product: {
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
}

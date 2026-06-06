"use client";

/**
 * URL-paste add-to-cart island — wires the legacy MODE A
 * "หยิบใส่รถเข็น" button in `app/[locale]/(protected)/search/page.tsx`
 * UrlPasteMode.
 *
 * Why this file exists (2026-06-02 §0c §0e):
 *   The legacy `<form action="" name="addCartURL">` button posted to no
 *   handler — customer click → green ripple, nothing inserted into
 *   tb_cart. The whole MODE A url-paste flow was a silent dead end on
 *   the customer side (the admin-side equivalent at
 *   /admin/service-orders/cart/add was wired in Wave 23 P2 #16).
 *
 * This island wraps the bottom of the MODE A product card:
 *   - qty stepper (min/max guarded; default = minQty)
 *   - color + size text inputs (legacy plain inputs · we keep parity)
 *   - free-text "รายละเอียดเพิ่มเติม" textarea (color/size description
 *     when the legacy sku_axes radio set wasn't filled — common path)
 *   - "หยิบใส่รถเข็น" submit → addCartItem (writes tb_cart faithfully)
 *
 * If TAMIT hasn't resolved the product detail yet (price = 0 OR title
 * blank), the button renders disabled with "กำลังโหลดข้อมูลสินค้า…"
 * so the customer doesn't submit an empty cart row.
 *
 * Mobile-first per AGENTS.md §6:
 *   - tap targets ≥ 44px (qty -/+ buttons, the main CTA)
 *   - body text ≥ 16px (no iOS zoom-on-focus)
 *   - primary CTA (red, full-width on mobile) thumb-reachable
 */

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCart, Plus, Minus, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { addCartItem } from "@/actions/cart";

// Mirrors PROVIDERS in lib/validators/cart.ts L7 (only these 5 are
// accepted by the cart Zod schema).
type Provider = "1688" | "taobao" | "tmall" | "shop" | "nice";

// Mirrors ChinaProductDetail.sku_axes / sku_map (lib/china-search/types.ts).
// Re-declared here so the client component bundle doesn't drag
// `server-only`-flagged modules into the browser.
export type SkuAxis = {
  name: string;
  values: Array<{ label: string; image?: string; data?: string; is_image?: boolean }>;
};
export type SkuRow = {
  sku_id:     string;
  prop_path:  Record<string, string>;
  price_cny:  number;
  stock:      number;
  image?:     string;
};

// Heuristic column-axis detectors — copy of admin's COLOR_AXIS_RE +
// SIZE_AXIS_RE so the cart `ccolor`/`csize` columns get populated.
const COLOR_AXIS_RE = /(colou?r|颜色|色|สี|seleksi.*warna)/i;
const SIZE_AXIS_RE  = /(size|尺寸|尺码|码|ขนาด|ไซ?ส์|ยาว|กว้าง|ส่วนสูง)/i;

export function UrlPasteAddToCart({
  url,
  provider,
  title,
  shopName,
  mainImage,
  priceCny,
  priceThb,
  rsDefault,
  minQty,
  maxQty,
  detailAvailable,
  skuAxes,
  skuMap,
  basePriceCny,
  promoPriceCny,
}: {
  url:        string;
  provider:   Provider;
  title:      string;
  shopName:   string;
  mainImage:  string | null;
  priceCny:   number;
  priceThb:   number;
  rsDefault:  number;
  minQty:     number;
  maxQty:     number;
  /** True when TAMIT returned a product detail · false when TAMIT
   *  failed (URL not supported, vendor down, scraper blocked).
   *  When false the island shows an error fallback + link to the
   *  proper manual-entry workflow at /service-order/add. */
  detailAvailable: boolean;
  /** SKU axes (color, size, style, etc.) — mirrors admin pattern. */
  skuAxes?:       SkuAxis[];
  /** Flattened SKU rows with per-combination price + stock. */
  skuMap?:        SkuRow[];
  /** Underlying TAMIT base + promo (the prop `priceCny` above is
   *  already the precomputed promo|base; these are passed so the
   *  island can show ราคาเริ่มต้น vs ราคา SKU ที่เลือก). */
  basePriceCny?:  number;
  promoPriceCny?: number;
}) {
  const t = useTranslations("searchPage");
  const minClamp = Math.max(1, minQty);
  const maxClamp = Math.max(minClamp, maxQty || 999);

  // priceThb is computed locally from priceCny × rsDefault inside this
  // island (so the qty stepper recomputes the total live).  Kept as a
  // prop only so the server-rendered card above can show its own ¥→฿
  // line without duplicating the math.  Silence the unused-vars lint.
  void priceThb;

  const [qty,        setQty]        = useState<number>(minClamp);
  const [color,      setColor]      = useState<string>("");
  const [size,       setSize]       = useState<string>("");
  const [details,    setDetails]    = useState<string>("");
  // SKU picker state — keyed by axis.name, value = the selected
  // axis-value label. Mirrors the admin pattern at
  // app/[locale]/(admin)/admin/service-orders/cart/add/link-paste-search.tsx L151.
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  // Manual price override — only relevant when no SKU is selected AND
  // TAMIT didn't return base/promo. Pre-filled with TAMIT's value
  // when present.
  const [manualPrice, setManualPrice] = useState<string>(priceCny > 0 ? String(priceCny) : "");
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<boolean>(false);
  const [pending,    startTransition] = useTransition();

  // ── Derived: matched SKU + effective price/image ──────────────────
  const matchedSku = useMemo<SkuRow | undefined>(() => {
    if (!skuAxes || skuAxes.length === 0 || !skuMap || skuMap.length === 0) return undefined;
    if (skuAxes.some((ax) => !selectedVariants[ax.name])) return undefined;
    return skuMap.find((row) =>
      skuAxes.every((ax) => row.prop_path[ax.name] === selectedVariants[ax.name]),
    );
  }, [skuAxes, skuMap, selectedVariants]);

  const matchedSkuImage = useMemo<string | undefined>(() => {
    if (matchedSku?.image) return matchedSku.image;
    if (!skuAxes) return undefined;
    for (const ax of skuAxes) {
      const valLabel = selectedVariants[ax.name];
      if (!valLabel) continue;
      const val = ax.values.find((v) => v.label === valLabel);
      if (val?.image) return val.image;
    }
    return undefined;
  }, [matchedSku, skuAxes, selectedVariants]);

  // Auto-compose color/size strings from selected axes — saves the
  // customer from re-typing what the picker already says.
  const composedFromAxes = useMemo(() => {
    if (!skuAxes || skuAxes.length === 0) return { ccolor: "", csize: "", other: "" };
    let cc = "", cs = "";
    const other: string[] = [];
    for (const ax of skuAxes) {
      const val = selectedVariants[ax.name];
      if (!val) continue;
      if (!cc && COLOR_AXIS_RE.test(ax.name))      cc = val;
      else if (!cs && SIZE_AXIS_RE.test(ax.name))  cs = val;
      else                                          other.push(`${ax.name}: ${val}`);
    }
    return { ccolor: cc, csize: cs, other: other.join(" · ") };
  }, [skuAxes, selectedVariants]);

  // axesIncomplete = true when SKU axes exist but not all are picked.
  // Lets the button switch from "หยิบใส่รถเข็น" → "เลือกตัวเลือกก่อน".
  const axesIncomplete = !!skuAxes && skuAxes.length > 0
    && skuAxes.some((ax) => !selectedVariants[ax.name]);

  // Render fallback only when TAMIT failed COMPLETELY — no image AND
  // no usable title AND no SKU data. If we got ANY of: the product
  // card (image + title), or skuMap (admin gets ¥188 by picking a SKU
  // even when base price is blank — same here), let the customer
  // proceed.
  const hasUsableTitle = title.trim().length > 0
    && !title.trim().match(/^สินค้าจาก (TMALL|TAOBAO|1688) \(รหัส /);
  const hasRealImage = !!mainImage;
  const hasSkuData   = !!skuMap && skuMap.length > 0;
  if (!detailAvailable || (!hasRealImage && !hasUsableTitle && !hasSkuData)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 text-base">
              {t("fetchDetailFailed")}
            </p>
            <p className="text-sm text-amber-800">
              {t("fetchDetailFailedHint", { shop: shopName || t("thisShopFallback") })}
            </p>
          </div>
        </div>
        <Link
          href="/service-order/add"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-base font-semibold px-5 py-3 min-h-[44px] w-full md:w-auto transition-colors"
        >
          <ShoppingCart className="h-5 w-5" />
          {t("openAddProductManual")}
        </Link>
        {url && (
          <p className="text-xs text-amber-800 break-all">
            {t("originalLinkPasted")}: <code className="bg-amber-100 px-1 rounded">{url}</code>
          </p>
        )}
      </div>
    );
  }

  // 2) Detail loaded → render island. Price resolution order
  //    (mirrors admin/link-paste-search.tsx L177):
  //    matched SKU price → TAMIT promo → TAMIT base → priceCny prop
  //    → customer's manual input. The manual input is only displayed
  //    when every prior source is 0 (skipping the picker).
  const effectivePriceCny = (() => {
    if (matchedSku?.price_cny && matchedSku.price_cny > 0) return matchedSku.price_cny;
    if (promoPriceCny && promoPriceCny > 0)                return promoPriceCny;
    if (basePriceCny  && basePriceCny  > 0)                return basePriceCny;
    if (priceCny      && priceCny      > 0)                return priceCny;
    const n = Number(manualPrice);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const effectivePriceThb = effectivePriceCny * rsDefault;
  // Show the manual price input only when SKU picker can't supply a
  // price (no axes OR axes complete but matched row has 0) AND TAMIT
  // didn't give us a base/promo either.
  const priceMissing =
    effectivePriceCny === 0
    || (!matchedSku && !promoPriceCny && !basePriceCny && priceCny === 0);
  const isReady = effectivePriceCny > 0 && title.trim().length > 0 && !axesIncomplete;

  function adjQty(delta: number) {
    setQty((q) => {
      const next = q + delta;
      if (next < minClamp) return minClamp;
      if (next > maxClamp) return maxClamp;
      return next;
    });
  }

  function onSubmit() {
    if (axesIncomplete) {
      setError(t("selectAllOptionsFirst"));
      return;
    }
    if (effectivePriceCny <= 0) {
      setError(t("priceNotEnteredError"));
      return;
    }
    if (!title.trim()) {
      setError(t("noProductNameError"));
      return;
    }
    setError(null); setSuccess(false);
    // SKU-aware compose: color/size first from explicit inputs,
    // fall through to auto-detected from axes. details gets the
    // "other" axes appended so admin sees the full picker context.
    const finalColor    = color.trim() || composedFromAxes.ccolor || undefined;
    const finalSize     = size.trim()  || composedFromAxes.csize  || undefined;
    const detailsParts  = [details.trim(), composedFromAxes.other].filter(Boolean);
    const finalDetails  = detailsParts.length > 0 ? detailsParts.join(" · ") : undefined;
    const finalImage    = matchedSkuImage ?? mainImage ?? undefined;
    startTransition(async () => {
      const res = await addCartItem({
        provider,
        shop_name:  shopName || "pacred",
        url:        url || undefined,
        title:      title || undefined,
        image_path: finalImage,
        color:      finalColor,
        size:       finalSize,
        price_cny:  effectivePriceCny,
        amount:     qty,
        details:    finalDetails,
      });
      if (res.ok) {
        setSuccess(true);
        // Clear form so customer can paste another URL without stale qty.
        // Keep manualPrice — TAMIT often fails on a whole shop, so the
        // next URL from the same vendor likely shares the price posture.
        // Clear SKU picks too — next product has different axes.
        setQty(minClamp); setColor(""); setSize(""); setDetails("");
        setSelectedVariants({});
        setTimeout(() => setSuccess(false), 4000);
      } else {
        // Translate the few error codes the customer cares about.
        const msg =
          res.error === "cart cap reached (151 items)"
            ? t("cartFullError")
            : res.error === "not_signed_in"
              ? t("sessionExpiredError")
              : t("addToCartFailedError", { error: res.error });
        setError(msg);
      }
    });
  }

  const lineTotalThb = effectivePriceThb * qty;

  return (
    <div className="space-y-3">
      {/* ── SKU PICKER — clickable axes (color · size · style · ...) ─
          Mirrors admin pattern at
          /admin/service-orders/cart/add/link-paste-search.tsx L428-490.
          Each axis renders a row of clickable button chips; selecting
          one updates state, looks up the matched SKU in skuMap, and
          re-computes effectivePriceCny. Image thumbs render on chips
          that are themselves images (rare — Taobao colour swatches). */}
      {skuAxes && skuAxes.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
          <p className="text-sm font-semibold text-emerald-900">
            {t("selectProductOptions")}{" "}
            {axesIncomplete && (
              <span className="text-red-600 font-bold ml-1">{t("required")}</span>
            )}
            {matchedSku && (
              <span className="text-emerald-700 ml-2 text-xs font-normal">
                {t("allSelectedPrice", { price: matchedSku.price_cny.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
              </span>
            )}
          </p>
          {skuAxes.map((axis) => {
            const selectedLabel = selectedVariants[axis.name];
            return (
              <div key={axis.name}>
                <p className="text-sm text-emerald-800 mb-1.5">
                  <strong className="text-foreground">{axis.name}</strong>
                  {selectedLabel && (
                    <span className="ml-2 text-primary-600 font-medium">: {selectedLabel}</span>
                  )}
                  <span className="ml-1.5 text-xs text-emerald-600">{t("optionsCount", { count: axis.values.length })}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {axis.values.map((v) => {
                    const isSelected = selectedLabel === v.label;
                    const showThumb  = v.is_image && v.image;
                    return (
                      <button
                        key={v.label}
                        type="button"
                        onClick={() => {
                          setSelectedVariants((prev) => {
                            // Toggle: clicking the selected chip clears it.
                            if (prev[axis.name] === v.label) {
                              const next = { ...prev };
                              delete next[axis.name];
                              return next;
                            }
                            return { ...prev, [axis.name]: v.label };
                          });
                          setError(null);
                          setSuccess(false);
                        }}
                        disabled={pending}
                        title={v.label}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm min-h-[44px] transition ${
                          isSelected
                            ? "border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500/30 font-semibold"
                            : "border-border bg-white hover:border-primary-300 text-foreground"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {showThumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={v.image}
                            alt=""
                            className="h-7 w-7 rounded object-contain bg-white border border-border/50"
                          />
                        )}
                        <span className="max-w-[16rem] truncate">{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual price input — only when the matched SKU + TAMIT base/promo
          all came back 0. Pre-filled with TAMIT's value when present. */}
      {priceMissing ? (
        <label className="block rounded-xl border border-amber-300 bg-amber-50 p-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-1.5">
            <AlertTriangle className="h-4 w-4" />
            {t("manualPriceLabel", { shop: shopName || t("thisShopFallback2") })}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder={t("priceExamplePlaceholder")}
              step="0.01"
              min="0"
              inputMode="decimal"
              className="flex-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <span className="text-lg font-bold text-amber-700">¥</span>
            {effectivePriceCny > 0 && (
              <span className="text-sm text-amber-800">
                ≈ {effectivePriceThb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ฿
              </span>
            )}
          </div>
        </label>
      ) : null}

      {/* Color / size / details — legacy customer cart parity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-muted block mb-1">{t("colorLabel")}</span>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder={t("colorPlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted block mb-1">{t("sizeLabel")}</span>
          <input
            type="text"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder={t("sizePlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-muted block mb-1">{t("detailsLabel")}</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={t("detailsPlaceholder")}
          maxLength={2000}
          rows={2}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        />
      </label>

      {/* qty stepper + total */}
      <div className="rounded-xl border border-border bg-surface-alt/50 dark:bg-surface-alt/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-semibold text-foreground">{t("quantity")}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => adjQty(-1)}
              disabled={pending || qty <= minClamp}
              aria-label={t("decreaseQuantity")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Minus className="h-5 w-5" />
            </button>
            <input
              type="number"
              value={qty}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || Number.isNaN(n)) return;
                if (n < minClamp) setQty(minClamp);
                else if (n > maxClamp) setQty(maxClamp);
                else setQty(Math.floor(n));
              }}
              min={minClamp}
              max={maxClamp}
              inputMode="numeric"
              className="w-20 h-11 text-center rounded-lg border border-border bg-white dark:bg-surface text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <button
              type="button"
              onClick={() => adjQty(1)}
              disabled={pending || qty >= maxClamp}
              aria-label={t("increaseQuantity")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between text-sm">
          <span className="text-muted">{t("total")}</span>
          <span>
            <b className="text-red-600 text-lg">{lineTotalThb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            {" "}฿
            <span className="text-xs text-muted">
              ({effectivePriceCny.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}¥ × {qty} × {rsDefault}฿/¥)
            </span>
          </span>
        </div>
      </div>

      {/* Status flash */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span>
            {t("addedToCart")} ·{" "}
            <Link href="/cart" className="underline font-semibold">{t("viewCart")}</Link>
          </span>
        </div>
      )}

      {/* Submit CTA */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || !isReady}
        className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-base font-semibold px-6 py-3 min-h-[44px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShoppingCart className="h-5 w-5" />
        {pending
          ? t("addingToCart")
          : !title.trim()
            ? t("noProductName")
            : axesIncomplete
              ? t("selectAllOptionsFirst")
              : effectivePriceCny <= 0
                ? t("enterPriceAbove")
                : t("addToCart")}
      </button>
    </div>
  );
}

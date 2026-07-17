"use client";

/**
 * Admin link-paste product search panel — top of /admin/service-orders/cart/add.
 *
 * Wave 23 P2 #16 (2026-05-27 ภูม flag) — cherry-pick of dave-pacred
 * commit `356edcb` (เดฟ customer-side link-paste) adapted for admin.
 * Wave 24 #187 (2026-05-27 ภูม flag) — SKU variant picker added (1688
 * color swatches + Taobao 颜色分类/规格 chips) so admin sees the same
 * "เรียงตามสี · ข้อกำหนด" pickers that Taobao shows shoppers, instead of
 * a free-text "หมายเหตุ" box.
 *
 * Flow:
 *   1. Admin pastes 1688/Taobao/Tmall URL → click ค้นหา
 *   2. Server action fetches via TAMIT → returns product card + variant axes
 *   3. Admin clicks chips per axis (one value each) — selected combo looks
 *      up `skuMap` to derive the effective price + image + stock
 *   4. Admin adjusts qty → click "+ เพิ่มในรถเข็น"
 *   5. Selected axis-values flow into tb_cart.ccolor + csize + cdetails:
 *        - Axis whose name matches /颜色|color|สี/i  → ccolor
 *        - Axis whose name matches /尺码|尺寸|规格|size|ขนาด/i → csize
 *        - Other axes → joined into cdetails ("axisName: valueLabel · ...")
 *   6. On TAMIT failure → red notice + admin uses the manual form below
 *
 * Provider mapping (TAMIT → tb_cart.cprovider enum):
 *   - "1688"  → "1"
 *   - "taobao" → "2"
 *   - "tmall"  → "3"
 *
 * Mobile-first per AGENTS.md §6: inputs ≥ 44px high · body text ≥ 16px ·
 * single-column on <md · primary CTA thumb-reachable.
 */

import { useState, useMemo, useTransition } from "react";
import {
  searchProductByUrlAdmin,
  type AdminProductSearchOk,
  type AdminSkuAxis,
} from "@/actions/admin/product-search";
import { adminAddItemToCart, adminAddItemsToCartBulk } from "@/actions/admin/cart";
import { ADMIN_CART_PROVIDERS } from "@/lib/validators/admin-cart";
import { MAX_ORDER_QTY, clampOrderQty } from "@/lib/validators/order-qty";

type Props = {
  /** Cart owner — PR<n> if admin chose a customer, else myAdminId. */
  initialUserId: string;
  /** Pacred-admin's own legacy adminid — fallback if userid blank. */
  myAdminId: string;
  /** Live yuan exchange rate (tb_settings.rsdefault) for ฿ preview. */
  rsDefault: number;
};

// Map TAMIT provider key → tb_cart.cprovider enum value.
function mapProvider(p: AdminProductSearchOk["provider"]): (typeof ADMIN_CART_PROVIDERS)[number] {
  switch (p) {
    case "1688":   return "1";
    case "taobao": return "2";
    case "tmall":  return "3";
    default:       return "4";  // "Shops" fallback (shouldn't hit)
  }
}

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60";

// Heuristics for mapping axis name → tb_cart.ccolor vs csize column.
// Covers Chinese (1688/Taobao native), English, and Thai axis names.
const COLOR_AXIS_RE = /颜色|颜色分类|color|colour|สี/i;
const SIZE_AXIS_RE  = /尺码|尺寸|规格|size|ขนาด|spec/i;

// ────────────────────────────────────────────────────────────
// SKU helpers — pure functions, kept top-level for clarity
// ────────────────────────────────────────────────────────────

/**
 * Look up the concrete SKU row matching the admin's selected axis-values.
 * Returns undefined if no exact match (partial selection, or skuMap absent).
 */
function findSkuFor(
  axes: AdminSkuAxis[] | undefined,
  skuMap: AdminProductSearchOk["skuMap"],
  selected: Record<string, string>,
) {
  if (!axes || axes.length === 0 || !skuMap || skuMap.length === 0) return undefined;
  // All axes must be selected for a unique SKU match.
  if (axes.some((ax) => !selected[ax.name])) return undefined;
  return skuMap.find((row) =>
    axes.every((ax) => row.propPath[ax.name] === selected[ax.name]),
  );
}

/** Pull the selected value's thumbnail (image-based axes only). */
function findAxisValueImage(
  axes: AdminSkuAxis[] | undefined,
  selected: Record<string, string>,
): string | undefined {
  if (!axes) return undefined;
  for (const ax of axes) {
    const valLabel = selected[ax.name];
    if (!valLabel) continue;
    const val = ax.values.find((v) => v.label === valLabel);
    if (val?.image) return val.image;
  }
  return undefined;
}

/** Compose ccolor / csize / cdetails from selected variants. */
function composeVariantStrings(
  axes: AdminSkuAxis[] | undefined,
  selected: Record<string, string>,
  fallbackTitle: string,
  noteOverride: string,
): { ccolor: string; csize: string; cdetails: string } {
  if (!axes || axes.length === 0) {
    return {
      ccolor: "",
      csize: "",
      cdetails: noteOverride.trim() || fallbackTitle,
    };
  }
  let ccolor = "";
  let csize  = "";
  const otherAxes: string[] = [];
  for (const ax of axes) {
    const val = selected[ax.name];
    if (!val) continue;
    if (!ccolor && COLOR_AXIS_RE.test(ax.name))      ccolor = val;
    else if (!csize  && SIZE_AXIS_RE.test(ax.name))  csize  = val;
    else                                              otherAxes.push(`${ax.name}: ${val}`);
  }
  // cdetails composition:
  //   - admin's own note (if any)       — always first
  //   - axes not mapped to color/size   — joined with ·
  //   - fallback to title if nothing    — keeps tb_cart.cdetails NOT NULL safe
  const parts = [
    noteOverride.trim(),
    ...otherAxes,
  ].filter(Boolean);
  const cdetails = parts.length > 0 ? parts.join(" · ") : (fallbackTitle || "-");
  return { ccolor, csize, cdetails };
}

export function AdminLinkPasteSearch({ initialUserId, myAdminId, rsDefault }: Props) {
  // Form state
  const [userid, setUserid]   = useState(initialUserId);
  const [url, setUrl]         = useState("");
  const [product, setProduct] = useState<AdminProductSearchOk | null>(null);
  const [qty, setQty]         = useState(1);
  const [note, setNote]       = useState("");

  // SKU picker state — keyed by axis.name, value is the selected axis-value label.
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  // Gallery state — which image index is currently displayed as the main hero.
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  // 2026-06-08 ภูม flag · 1688 wholesale multi-pick (รูปที่ 3 in chat):
  // qty per skuMap entry · keyed by idx · default 0. When product has ≥ 2
  // SKUs, we render a row per SKU with stock + qty stepper (mirrors 1688's
  // multi-variant qty grid); submit calls adminAddItemsToCartBulk with all
  // qty > 0 entries. When ≤ 1 SKU, we fall back to single-pick UI.
  const [qtyBySku, setQtyBySku] = useState<Record<number, number>>({});

  // Async state
  const [searching, startSearch] = useTransition();
  const [adding, startAdd]       = useTransition();
  const [searchErr, setSearchErr]= useState<string | null>(null);
  const [flash, setFlash]        = useState<
    | { kind: "added"; title: string; id: number }
    | { kind: "add_failed"; message: string }
    | null
  >(null);

  // ── Derived state from selected variants ─────────────────────────────
  // matchedSku is the concrete SKU row when ALL axes are selected; partial
  // selection leaves it undefined. effectivePrice/Image/Stock fall back to
  // the product-level values if no SKU match yet.
  const matchedSku = useMemo(
    () => (product ? findSkuFor(product.skuAxes, product.skuMap, selectedVariants) : undefined),
    [product, selectedVariants],
  );
  const variantImage = useMemo(
    () => (product ? findAxisValueImage(product.skuAxes, selectedVariants) : undefined),
    [product, selectedVariants],
  );
  const effectivePrice = matchedSku?.priceCny
    ?? product?.promoPriceCny
    ?? product?.priceCny
    ?? 0;
  const effectiveStock = matchedSku?.stock
    ?? product?.stockTotal
    ?? undefined;
  const heroImage =
    matchedSku?.image
    || variantImage
    || product?.images?.[activeImageIdx]
    || product?.imageUrl
    || undefined;

  // True when product has axes AND not all of them are selected yet.
  const axesIncomplete =
    !!product?.skuAxes
    && product.skuAxes.length > 0
    && product.skuAxes.some((ax) => !selectedVariants[ax.name]);

  const previewThb = product ? (effectivePrice * rsDefault).toFixed(2) : "—";

  // ── Multi-pick mode (1688 wholesale qty grid) ───────────────────────
  // Auto-detect: when the product carries ≥ 2 concrete SKUs, render the
  // 1688-style "row per SKU + qty input" grid instead of the single-pick
  // chip picker. Submit calls adminAddItemsToCartBulk with all qty>0
  // rows in one atomic batch.
  const isMultiPickMode = !!product?.skuMap && product.skuMap.length >= 2;
  const totalSelectedQty = useMemo(
    () => Object.values(qtyBySku).reduce((s, q) => s + (q > 0 ? q : 0), 0),
    [qtyBySku],
  );
  const selectedSkuCount = useMemo(
    () => Object.values(qtyBySku).filter((q) => q > 0).length,
    [qtyBySku],
  );
  const multiPickTotalYuan = useMemo(() => {
    if (!isMultiPickMode || !product?.skuMap) return 0;
    return product.skuMap.reduce((sum, sku, idx) => {
      const q = qtyBySku[idx] ?? 0;
      return sum + sku.priceCny * q;
    }, 0);
  }, [isMultiPickMode, product, qtyBySku]);
  const multiPickPreviewThb = isMultiPickMode
    ? (multiPickTotalYuan * rsDefault).toFixed(2)
    : "—";

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    setSearchErr(null);
    setFlash(null);
    setProduct(null);
    setQty(1);
    setNote("");
    setSelectedVariants({});
    setActiveImageIdx(0);
    startSearch(async () => {
      const r = await searchProductByUrlAdmin(u);
      if (r.ok) {
        if (r.data) {
          setProduct(r.data);
          // Auto-select an axis if it has only ONE value (e.g. the 1688 hat
          // with size=58CM only). Saves a redundant click — admin can still
          // change later if more values appear.
          const auto: Record<string, string> = {};
          for (const ax of r.data.skuAxes ?? []) {
            if (ax.values.length === 1 && ax.values[0]) auto[ax.name] = ax.values[0].label;
          }
          setSelectedVariants(auto);
        } else {
          setSearchErr("ค้นหาสำเร็จแต่ไม่มีข้อมูลสินค้า");
        }
      } else {
        const msg = (r.message && r.message.trim()) || r.error || "ค้นหาไม่สำเร็จ";
        setSearchErr(msg);
      }
    });
  }

  function onAddToCart() {
    if (!product) return;
    const owner = userid.trim() || myAdminId;
    if (!owner) {
      setFlash({ kind: "add_failed", message: "กรอกรหัสสมาชิก (เจ้าของรถเข็น) ก่อน" });
      return;
    }
    // ── Multi-pick branch (1688 wholesale qty grid) ────────────────────
    if (isMultiPickMode) {
      const skuMap = product.skuMap!;
      const items: Parameters<typeof adminAddItemsToCartBulk>[0]["items"] = [];
      for (let i = 0; i < skuMap.length; i++) {
        const q = qtyBySku[i] ?? 0;
        if (q <= 0) continue;
        const sku = skuMap[i];
        // Materialise the propPath as `selectedVariants` so composeVariantStrings
        // picks the right axis label for ccolor/csize/cdetails. Then add the
        // admin note (shared across all rows) as a prefix.
        const { ccolor, csize, cdetails } = composeVariantStrings(
          product.skuAxes,
          sku.propPath,
          product.title,
          note,
        );
        items.push({
          curl:      product.sourceUrl,
          cdetails,
          ctitle:    product.title,
          cnameshop: product.shopName || "pcs",
          cprovider: mapProvider(product.provider),
          // Prefer the per-SKU image · fall back to axis-value image · then hero.
          cimages:   sku.image || findAxisValueImage(product.skuAxes, sku.propPath) || heroImage || product.imageUrl || "",
          cprice:    sku.priceCny,
          camount:   q,
          ccolor,
          csize,
        });
      }
      if (items.length === 0) {
        setFlash({ kind: "add_failed", message: "กรอกจำนวนอย่างน้อย 1 ตัวเลือก" });
        return;
      }
      setFlash(null);
      startAdd(async () => {
        const r = await adminAddItemsToCartBulk({ userid: owner, items });
        if (r.ok) {
          setFlash({ kind: "added", title: `${product.title} (${items.length} รายการ · ${items.reduce((s, it) => s + it.camount, 0)} ชิ้น)`, id: 0 });
          setQtyBySku({});
          setNote("");
          setActiveImageIdx(0);
        } else {
          setFlash({ kind: "add_failed", message: r.error || "เพิ่มสินค้าไม่สำเร็จ" });
        }
      });
      return;
    }
    // ── Single-pick branch (existing chip picker) ──────────────────────
    if (axesIncomplete) {
      const missing = product.skuAxes!
        .filter((ax) => !selectedVariants[ax.name])
        .map((ax) => ax.name)
        .join(" · ");
      setFlash({ kind: "add_failed", message: `กรุณาเลือก: ${missing}` });
      return;
    }
    setFlash(null);
    const { ccolor, csize, cdetails } = composeVariantStrings(
      product.skuAxes,
      selectedVariants,
      product.title,
      note,
    );
    startAdd(async () => {
      const r = await adminAddItemToCart({
        userid: owner,
        item: {
          curl:      product.sourceUrl,
          cdetails,
          ctitle:    product.title,
          cnameshop: product.shopName || "pcs",
          cprovider: mapProvider(product.provider),
          cimages:   heroImage || product.imageUrl || "",
          cprice:    effectivePrice,
          camount:   qty,
          ccolor,
          csize,
        },
      });
      if (r.ok) {
        setFlash({ kind: "added", title: product.title, id: r.data?.id ?? 0 });
        // Reset for next add — keep userid + url field intact so admin
        // can paste another product for the same customer.
        setQty(1);
        setNote("");
        setSelectedVariants({});
        setActiveImageIdx(0);
      } else {
        setFlash({ kind: "add_failed", message: r.error || "เพิ่มสินค้าไม่สำเร็จ" });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Cart owner — outside the search form so a search doesn't lose context */}
      <div>
        <label htmlFor="lps_userid" className="block text-xs font-medium text-muted mb-1.5">
          รหัสสมาชิก (เจ้าของรถเข็น)
        </label>
        <input
          id="lps_userid"
          type="text"
          value={userid}
          onChange={(e) => setUserid(e.target.value)}
          className={`${INPUT_CLS} font-mono`}
          placeholder={`PR123 (เว้นว่าง = รถเข็นแอดมิน${myAdminId ? ` ${myAdminId}` : ""})`}
        />
      </div>

      <hr className="border-border" />

      {/* URL paste form */}
      <form onSubmit={onSearch} className="space-y-2">
        <label htmlFor="lps_url" className="block text-xs font-medium text-muted">
          1. วางลิงก์สินค้า (1688 / Taobao / Tmall) แล้วกด ค้นหา
        </label>
        <div className="flex gap-2 flex-wrap">
          <input
            id="lps_url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={searching}
            className={`${INPUT_CLS} flex-1 min-w-[200px]`}
            placeholder="https://detail.1688.com/offer/... หรือ https://item.taobao.com/item.htm?id=..."
            inputMode="url"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={searching || !url.trim()}
            className="rounded-lg bg-primary-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {searching ? "กำลังค้นหา..." : "🔍 ค้นหา"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          ระบบจะดึงรูป · ชื่อสินค้า · ราคา ¥ · <strong>ตัวเลือกสี/ขนาด</strong> จาก marketplace มาให้อัตโนมัติ
        </p>
      </form>

      {/* Search error (TAMIT down / not_configured / unsupported_host / etc) */}
      {searchErr && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
          <p className="font-medium mb-1">⚠ ค้นหาไม่สำเร็จ</p>
          <p className="text-xs leading-relaxed">{searchErr}</p>
          <p className="text-xs leading-relaxed mt-1.5 text-red-700">
            👇 ใช้ฟอร์มกรอกเองด้านล่างแทน
          </p>
        </div>
      )}

      {/* Product card */}
      {product && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-4">
          {/* ── Hero: image + title + meta + price ─────────────────────── */}
          <div className="flex items-start gap-4 flex-wrap">
            {/* Main image + thumb strip */}
            <div className="flex-shrink-0 space-y-2">
              {heroImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImage}
                  alt={product.title}
                  className="h-40 w-40 rounded-lg object-contain bg-white border border-border"
                />
              ) : (
                <div className="h-40 w-40 rounded-lg bg-surface-alt border border-border flex items-center justify-center text-5xl text-muted">
                  📦
                </div>
              )}
              {/* Thumb strip — first 5 images, click to swap hero (only when no SKU image override) */}
              {product.images && product.images.length > 1 && (
                <div className="flex gap-1.5 flex-wrap max-w-[10rem]">
                  {product.images.slice(0, 5).map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      onClick={() => setActiveImageIdx(i)}
                      aria-label={`รูป ${i + 1}`}
                      className={`h-9 w-9 rounded border bg-white overflow-hidden ${
                        i === activeImageIdx
                          ? "border-primary-500 ring-2 ring-primary-500/30"
                          : "border-border hover:border-primary-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title + meta + price */}
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <a
                href={product.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-medium text-foreground hover:text-primary-600 break-words"
              >
                {product.title}
              </a>
              <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                <span className="inline-block rounded-full bg-white border border-border px-2 py-0.5 font-mono text-[11px] uppercase">
                  {product.provider}
                </span>
                {product.shopName && (
                  <span className="text-xs">ร้าน: <strong>{product.shopName}</strong></span>
                )}
                {product.productId && (
                  <span className="text-[11px] font-mono text-muted">#{product.productId}</span>
                )}
              </div>
              <div className="text-lg font-mono font-semibold text-red-700">
                ¥{effectivePrice.toFixed(2)}
                {matchedSku == null && product.promoPriceCny != null && product.promoPriceCny < product.priceCny && (
                  <span className="ml-2 text-xs text-muted line-through font-normal">
                    ¥{product.priceCny.toFixed(2)}
                  </span>
                )}
                <span className="ml-2 text-xs text-muted font-normal">
                  ≈ ฿{previewThb} <span className="text-[11px]">(เรท {rsDefault.toFixed(2)})</span>
                </span>
              </div>
              {effectiveStock != null && (
                <div className="text-[11px] text-muted">
                  คงเหลือ: <span className="font-mono">{effectiveStock.toLocaleString()}</span> ชิ้น
                  {matchedSku && <span className="ml-1.5 text-emerald-700">· ตรง SKU ที่เลือก</span>}
                </div>
              )}
            </div>
          </div>

          {/* ── Multi-pick grid (1688 wholesale qty grid) ─────────────── */}
          {/* 2026-06-08 ภูม flag (รูปที่ 3 in the chat): when product has ≥ 2
              concrete SKUs (typical 1688 wholesale), render a row-per-SKU qty
              grid mirroring 1688's "数量" column · staff/customers type qty
              per SKU; submit batches all qty>0 rows in 1 INSERT. */}
          {isMultiPickMode && product.skuMap && (
            <div className="space-y-2 border-t border-emerald-200 pt-3">
              <p className="text-xs font-medium text-muted">
                เลือกตัวเลือกสินค้า + จำนวน <span className="text-[11px]">({product.skuMap.length} ตัวเลือก · เลือกได้หลายอันพร้อมกัน)</span>
              </p>
              <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-emerald-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-emerald-50/60 text-[11px] uppercase tracking-wide text-emerald-800">
                    <tr>
                      <th className="px-2 py-2 text-left">ตัวเลือก</th>
                      <th className="px-2 py-2 text-right whitespace-nowrap">ราคา ¥</th>
                      <th className="px-2 py-2 text-right whitespace-nowrap">คงเหลือ</th>
                      <th className="px-2 py-2 text-center w-44">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.skuMap.map((sku, idx) => {
                      const q = qtyBySku[idx] ?? 0;
                      const skuImage = sku.image || findAxisValueImage(product.skuAxes, sku.propPath);
                      const label = Object.entries(sku.propPath).map(([, v]) => v).join(" · ") || "—";
                      const outOfStock = sku.stock <= 0;
                      return (
                        <tr key={sku.skuId || idx} className={`border-t border-emerald-100 align-middle ${q > 0 ? "bg-emerald-50/50" : ""}`}>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {skuImage && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={skuImage} alt="" className="h-9 w-9 rounded border border-border/50 object-contain bg-white flex-shrink-0" />
                              )}
                              <span className="truncate" title={label}>{label}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right font-mono whitespace-nowrap">¥{sku.priceCny.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-muted">
                            {outOfStock ? <span className="text-red-600">หมด</span> : sku.stock.toLocaleString()}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setQtyBySku((prev) => ({ ...prev, [idx]: Math.max(0, (prev[idx] ?? 0) - 1) }))}
                                disabled={adding || q <= 0}
                                className="rounded-md border border-border bg-white w-7 h-7 text-sm hover:bg-surface-alt disabled:opacity-40 leading-none"
                                aria-label="ลด"
                              >−</button>
                              <input
                                type="number"
                                min={0}
                                max={MAX_ORDER_QTY}
                                value={q}
                                onChange={(e) => {
                                  const n = Number(e.target.value) || 0;
                                  setQtyBySku((prev) => ({ ...prev, [idx]: clampOrderQty(n, 1, true) }));
                                  setFlash(null);
                                }}
                                disabled={adding || outOfStock}
                                className={`${INPUT_CLS} text-center font-mono w-16 h-7 py-0`}
                              />
                              <button
                                type="button"
                                onClick={() => setQtyBySku((prev) => ({ ...prev, [idx]: clampOrderQty((prev[idx] ?? 0) + 1, 1, true) }))}
                                disabled={adding || outOfStock}
                                className="rounded-md border border-border bg-white w-7 h-7 text-sm hover:bg-surface-alt disabled:opacity-40 leading-none"
                                aria-label="เพิ่ม"
                              >+</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {selectedSkuCount > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-emerald-300 bg-emerald-50 font-medium">
                        <td className="px-2 py-2 text-right" colSpan={2}>
                          รวม {selectedSkuCount} ตัวเลือก · {totalSelectedQty.toLocaleString()} ชิ้น
                        </td>
                        <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-rose-700">¥{multiPickTotalYuan.toFixed(2)}</td>
                        <td className="px-2 py-2 text-center text-[11px] text-muted">≈ ฿{multiPickPreviewThb}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ── Variant pickers (single-pick · skuMap ≤ 1 or no SKU data) ── */}
          {!isMultiPickMode && product.skuAxes && product.skuAxes.length > 0 && (
            <div className="space-y-3 border-t border-emerald-200 pt-3">
              <p className="text-xs font-medium text-muted">
                เลือกตัวเลือกสินค้า {axesIncomplete && <span className="text-red-600">(จำเป็น)</span>}
              </p>
              {product.skuAxes.map((axis) => {
                const selectedLabel = selectedVariants[axis.name];
                return (
                  <div key={axis.name}>
                    <p className="text-xs text-muted mb-1.5">
                      <strong className="text-foreground">{axis.name}</strong>
                      {selectedLabel && (
                        <span className="ml-2 text-primary-600 font-medium">: {selectedLabel}</span>
                      )}
                      <span className="ml-1.5 text-[11px]">({axis.values.length} ตัวเลือก)</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {axis.values.map((v) => {
                        const isSelected = selectedLabel === v.label;
                        const showThumb = v.isImage && v.image;
                        return (
                          <button
                            key={v.label}
                            type="button"
                            onClick={() => {
                              setSelectedVariants((prev) => {
                                // Toggle: clicking the selected chip deselects it.
                                if (prev[axis.name] === v.label) {
                                  const next = { ...prev };
                                  delete next[axis.name];
                                  return next;
                                }
                                return { ...prev, [axis.name]: v.label };
                              });
                              setFlash(null);
                            }}
                            disabled={adding}
                            title={v.label}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                              isSelected
                                ? "border-primary-500 bg-primary-50 text-primary-700 ring-2 ring-primary-500/20 font-medium"
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
                            <span className="max-w-[14rem] truncate">{v.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Qty + free-text note + Add button ─────────────────────── */}
          <div className={`grid gap-3 pt-1 border-t border-emerald-200 ${isMultiPickMode ? "" : "sm:grid-cols-3"}`}>
            {/* Qty stepper hidden in multi-pick mode (qty per SKU lives in the grid above) */}
            {!isMultiPickMode && (
              <div>
                <label htmlFor="lps_qty" className="block text-xs font-medium text-muted mb-1.5">
                  จำนวน
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={adding || qty <= 1}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
                  >
                    −
                  </button>
                  <input
                    id="lps_qty"
                    type="number"
                    min={1}
                    max={MAX_ORDER_QTY}
                    value={qty}
                    onChange={(e) => setQty(clampOrderQty(e.target.value))}
                    disabled={adding}
                    className={`${INPUT_CLS} text-center font-mono w-20`}
                  />
                  <button
                    type="button"
                    onClick={() => setQty((q) => clampOrderQty(q + 1))}
                    disabled={adding || qty >= 9999}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
            <div className={isMultiPickMode ? "" : "sm:col-span-2"}>
              <label htmlFor="lps_note" className="block text-xs font-medium text-muted mb-1.5">
                หมายเหตุเพิ่มเติม (ถ้ามี · ใช้ร่วมกันทุกตัวเลือก)
              </label>
              <input
                id="lps_note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={adding}
                maxLength={500}
                className={INPUT_CLS}
                placeholder={
                  isMultiPickMode
                    ? "เช่น สเป็คพิเศษ / หมายเหตุที่ใช้กับทุกตัวเลือกที่เลือก"
                    : product.skuAxes && product.skuAxes.length > 0
                      ? "เช่น สเป็คเพิ่ม / หมายเหตุพิเศษ (สี/ขนาดเลือกข้างบนแล้ว)"
                      : "เช่น สีดำ ไซส์ M (เว้นว่างได้)"
                }
              />
            </div>
          </div>

          {/* Add to cart */}
          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={adding || (isMultiPickMode && totalSelectedQty === 0)}
              className="rounded-lg bg-primary-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding
                ? "กำลังเพิ่ม..."
                : isMultiPickMode
                  ? `+ เพิ่มในรถเข็น (${selectedSkuCount} ตัวเลือก · ${totalSelectedQty.toLocaleString()} ชิ้น)`
                  : `+ เพิ่มในรถเข็น (× ${qty})`}
            </button>
          </div>
        </div>
      )}

      {/* Add-to-cart flash */}
      {flash?.kind === "added" && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✓ เพิ่มสินค้าเข้ารถเข็นแล้ว — <strong>{flash.title}</strong>{" "}
          {flash.id > 0 && <span className="font-mono text-[11px]">(ID #{flash.id})</span>}
        </div>
      )}
      {flash?.kind === "add_failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ {flash.message}
        </div>
      )}
    </div>
  );
}

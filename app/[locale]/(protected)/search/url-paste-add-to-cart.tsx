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

import { useState, useTransition } from "react";
import { ShoppingCart, Plus, Minus, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { addCartItem } from "@/actions/cart";

// Mirrors PROVIDERS in lib/validators/cart.ts L7 (only these 5 are
// accepted by the cart Zod schema).
type Provider = "1688" | "taobao" | "tmall" | "shop" | "nice";

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
}) {
  const minClamp = Math.max(1, minQty);
  const maxClamp = Math.max(minClamp, maxQty || 999);

  const [qty,     setQty]     = useState<number>(minClamp);
  const [color,   setColor]   = useState<string>("");
  const [size,    setSize]    = useState<string>("");
  const [details, setDetails] = useState<string>("");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [pending, startTransition] = useTransition();

  // 1) TAMIT failed → render fallback to /service-order/add (which has
  //    LinkPasteSearch + manual-entry fields). Avoid the infinite
  //    "กำลังโหลด…" skeleton — that misleads the customer.
  //
  //    `detailAvailable = false` covers the explicit-fail case
  //    (TAMIT returned ok:false). But TAMIT often returns ok:true with
  //    a partial scrape (title via fallback heuristic, price = 0,
  //    image = null) for URLs it can't fully decode (Tmall ?region=SG
  //    pages, weird scm/spm chains). Treat those as failures too —
  //    without price the customer can't even check what they're
  //    paying, so we'd be ordering at price 0.
  const hasRealPrice = priceCny > 0;
  const hasRealImage = !!mainImage;
  if (!detailAvailable || !hasRealPrice || !hasRealImage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 text-base">
              ดึงรายละเอียดสินค้าจากลิงก์นี้ไม่สำเร็จ
            </p>
            <p className="text-sm text-amber-800">
              ระบบยังเปิดดูร้าน {shopName || "นี้"} ไม่ได้ · กรอกข้อมูลสินค้าเองได้ที่หน้า &ldquo;เพิ่มสินค้าในรถเข็น&rdquo;
            </p>
          </div>
        </div>
        <Link
          href="/service-order/add"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-base font-semibold px-5 py-3 min-h-[44px] w-full md:w-auto transition-colors"
        >
          <ShoppingCart className="h-5 w-5" />
          เปิดหน้าเพิ่มสินค้า (กรอกเอง)
        </Link>
        {url && (
          <p className="text-xs text-amber-800 break-all">
            ลิงก์เดิมที่คุณวาง: <code className="bg-amber-100 px-1 rounded">{url}</code>
          </p>
        )}
      </div>
    );
  }

  // 2) Detail loaded but somehow blank — defensive skeleton.
  const isReady = priceCny > 0 && title.trim().length > 0;

  function adjQty(delta: number) {
    setQty((q) => {
      const next = q + delta;
      if (next < minClamp) return minClamp;
      if (next > maxClamp) return maxClamp;
      return next;
    });
  }

  function onSubmit() {
    if (!isReady) {
      setError("ข้อมูลสินค้ายังโหลดไม่ครบ · รอสักครู่");
      return;
    }
    setError(null); setSuccess(false);
    startTransition(async () => {
      const res = await addCartItem({
        provider,
        shop_name:  shopName || "pacred",
        url:        url || undefined,
        title:      title || undefined,
        image_path: mainImage ?? undefined,
        color:      color.trim() || undefined,
        size:       size.trim() || undefined,
        price_cny:  priceCny,
        amount:     qty,
        details:    details.trim() || undefined,
      });
      if (res.ok) {
        setSuccess(true);
        // Clear form so customer can paste another URL without stale qty
        setQty(minClamp); setColor(""); setSize(""); setDetails("");
        setTimeout(() => setSuccess(false), 4000);
      } else {
        // Translate the few error codes the customer cares about.
        const msg =
          res.error === "cart cap reached (151 items)"
            ? "ตะกร้าเต็มแล้ว (151 ชิ้น) · ลบรายการบางตัวออกก่อน"
            : res.error === "not_signed_in"
              ? "เซสชั่นหมดอายุ · เข้าสู่ระบบใหม่"
              : `ใส่ตะกร้าไม่สำเร็จ: ${res.error}`;
        setError(msg);
      }
    });
  }

  const lineTotalThb = priceThb * qty;

  return (
    <div className="space-y-3">
      {/* Color / size / details — legacy customer cart parity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-sm text-muted block mb-1">สี (ถ้ามี)</span>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="เช่น แดง · ดำ"
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted block mb-1">ไซส์ (ถ้ามี)</span>
          <input
            type="text"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="เช่น M · L · 38"
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm text-muted block mb-1">รายละเอียดเพิ่มเติม (ถ้ามี)</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="คำสั่งพิเศษ · สิ่งที่อยากให้ admin รู้"
          maxLength={2000}
          rows={2}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        />
      </label>

      {/* qty stepper + total */}
      <div className="rounded-xl border border-border bg-surface-alt/50 dark:bg-surface-alt/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-semibold text-foreground">จำนวน</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => adjQty(-1)}
              disabled={pending || qty <= minClamp}
              aria-label="ลดจำนวน"
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
              aria-label="เพิ่มจำนวน"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white dark:bg-surface text-foreground hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between text-sm">
          <span className="text-muted">ราคารวม</span>
          <span>
            <b className="text-red-600 text-lg">{lineTotalThb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            {" "}฿
            <span className="text-xs text-muted">
              ({priceCny.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}¥ × {qty} × {rsDefault}฿/¥)
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
            ใส่ตะกร้าเรียบร้อย ·{" "}
            <Link href="/cart" className="underline font-semibold">ไปดูตะกร้า</Link>
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
        {pending ? "กำลังใส่ตะกร้า…" : !isReady ? "กำลังโหลดข้อมูลสินค้า…" : "หยิบใส่รถเข็น"}
      </button>
    </div>
  );
}

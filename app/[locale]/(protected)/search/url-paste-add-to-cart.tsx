"use client";

/**
 * MODE-A add-to-cart client island for the /search URL-paste screen.
 *
 * Closes a dead-button gap: the legacy MODE-A product card
 * (`search/page.tsx` `UrlPasteMode`) rendered a `<form method="POST"
 * action="">` with a "หยิบใส่รถเข็น" submit button and NO handler — the
 * page is a Server Component, so clicking did nothing (the legacy jQuery
 * `$.ajax` → cart.php that the form relied on was never ported).
 *
 * The product detail is ALREADY fetched server-side
 * (`convertProductUrlDetail` → passed as `detail` into UrlPasteMode), so
 * this island just reads the derived props + a qty (+ optional note) and
 * calls the wired `addCartItem` server action — reusing the exact
 * onAddToCart logic + qty-stepper proven on /service-order/add
 * (link-paste-search.tsx). It preserves the legacy MODE-A price/qty/total
 * block; only the inert form is swapped for this working island.
 *
 * ── Mobile-first per AGENTS.md §6 + docs/conventions.md §11 ────
 *   - qty stepper buttons + CTA are ≥ 44px tall
 *   - body text ≥ 16px on the controls
 *   - layout stays single-column on phones; CTA thumb-reachable at the
 *     bottom of the card
 */

import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { addCartItem } from "@/actions/cart";
import type { Provider } from "@/lib/validators/cart";

type UrlPasteAddToCartProps = {
  /** Cart provider — ChinaProductDetail.provider ("1688"|"taobao"|"tmall")
   *  is a strict subset of the cart PROVIDERS enum, so it passes through. */
  provider: Provider;
  title: string;
  /** Already https-upgraded main image URL (may be undefined → no image). */
  imageUrl?: string;
  shopName?: string;
  /** Unit price in CNY (promo price preferred over base, computed by caller). */
  priceCny: number;
  /** The product source URL (the pasted link). */
  sourceUrl: string;
  /** Live yuan exchange rate (tb_settings.rsdefault) for the ฿ conversion. */
  rsDefault: number;
  /** Minimum order quantity, if the upstream provided one (legacy `#minnum`). */
  minOrder?: number;
};

function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncate(s: string, n: number): string {
  const chars = Array.from(s ?? "");
  if (chars.length <= n) return s;
  return chars.slice(0, n).join("") + "...";
}

export function UrlPasteAddToCart({
  provider,
  title,
  shopName,
  priceCny,
  sourceUrl,
  rsDefault,
  minOrder,
}: UrlPasteAddToCartProps) {
  const minQty = minOrder && minOrder > 0 ? minOrder : 1;
  const [qty, setQty] = useState(minQty);
  const [note, setNote] = useState("");
  const [adding, startAdd] = useTransition();
  // Post-add flash (sticky until the next add attempt).
  const [flash, setFlash] = useState<
    | { kind: "added" }
    | { kind: "cart_full"; message: string }
    | { kind: "add_failed"; message: string }
    | null
  >(null);

  const totalCny = priceCny * qty;
  const totalThb = totalCny * rsDefault;

  function onAddToCart() {
    setFlash(null);
    startAdd(async () => {
      const r = await addCartItem({
        provider,
        shop_name: shopName || "pacred",
        url: sourceUrl,
        title,
        // The MODE-A card has no SKU axis grid yet (the full picker lives at
        // /service-order/add); a free-text note carries สี/ขนาด/รุ่น instead.
        color: undefined,
        size: undefined,
        price_cny: priceCny,
        amount: qty,
        details: note.trim() || undefined,
      });
      if (r.ok) {
        setFlash({ kind: "added" });
        setQty(minQty);
        setNote("");
      } else {
        const isCartFull = /cart cap reached/i.test(r.error);
        setFlash(
          isCartFull
            ? {
                kind: "cart_full",
                message:
                  "ตะกร้าเต็มแล้ว (สูงสุด 151 รายการ) กรุณาชำระเงิน หรือลบรายการก่อน",
              }
            : { kind: "add_failed", message: r.error || "เพิ่มไม่สำเร็จ" },
        );
      }
    });
  }

  return (
    <div>
      {/* Flash banner — post-add toast or error */}
      {flash && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-3 px-4 py-3 rounded-lg text-[14px] font-medium ${
            flash.kind === "added"
              ? "bg-green-50 text-green-800 border border-green-200"
              : flash.kind === "cart_full"
              ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {flash.kind === "added" ? (
            <span>
              เพิ่มลงตะกร้าแล้ว:{" "}
              <span className="font-semibold">{truncate(title, 60)}</span> ·{" "}
              <Link
                href="/cart"
                className="underline underline-offset-2 hover:text-green-900"
              >
                ไปที่ตะกร้า
              </Link>
            </span>
          ) : (
            <span>{flash.message}</span>
          )}
        </div>
      )}

      {/* Price / qty / total block — preserves the legacy MODE-A
          `.border-total-product` card, with a working qty stepper + CTA. */}
      <div
        className="border-total-product pay-c rounded-xl border border-border bg-surface-alt/50 dark:bg-surface-alt/30 p-3"
        style={{ zIndex: 99 }}
      >
        <div className="grid grid-cols-12 items-center gap-y-3">
          {/* ราคารวม */}
          <div className="col-span-4 md:col-span-6 text-right">
            <h4 className="text-base font-semibold text-foreground">ราคารวม</h4>
          </div>
          <div className="col-span-8 md:col-span-6 text-left md:text-right notranslate text-sm">
            <span id="CHNTotal">{numberFormat2(totalCny)}</span>¥
            <span>
              {" "}
              x {rsDefault}฿/¥ ={" "}
              <b id="THBtotal" className="text-red-600">
                {numberFormat2(totalThb)}
              </b>{" "}
              ฿
            </span>
          </div>

          {/* จำนวน + stepper */}
          <div className="col-span-4 md:col-span-6 text-right">
            <h4 className="text-base font-semibold text-foreground">จำนวน</h4>
            {minOrder && minOrder > 1 ? (
              <b className="text-xs text-red-600">
                {" "}
                (ขั้นต่ำ {minOrder} ชิ้น)
              </b>
            ) : null}
          </div>
          <div className="col-span-8 md:col-span-6 flex md:justify-end">
            <div className="flex items-stretch border border-gray-300 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setQty(Math.max(minQty, qty - 1))}
                disabled={adding || qty <= minQty}
                aria-label="ลดจำนวน"
                className="w-[44px] h-[44px] text-[20px] font-bold text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition"
              >
                -
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={minQty}
                max={9999}
                value={qty}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= minQty) setQty(Math.min(9999, n));
                  else if (e.target.value === "") setQty(minQty);
                }}
                disabled={adding}
                aria-label="จำนวน"
                className="w-[64px] text-center text-[16px] border-x border-gray-300 outline-none focus:bg-red-50 disabled:bg-gray-50"
              />
              <button
                type="button"
                onClick={() => setQty(Math.min(9999, qty + 1))}
                disabled={adding}
                aria-label="เพิ่มจำนวน"
                className="w-[44px] h-[44px] text-[20px] font-bold text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition"
              >
                +
              </button>
            </div>
          </div>

          {/* หมายเหตุ (สี / ขนาด / รุ่น) */}
          <div className="col-span-12">
            <label
              htmlFor="urlpaste-note"
              className="block text-[14px] font-medium text-foreground mb-1"
            >
              หมายเหตุ <span className="text-muted">(สี / ขนาด / รุ่น)</span>
            </label>
            <input
              id="urlpaste-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น สีดำ ขนาด M"
              maxLength={200}
              disabled={adding}
              className="w-full h-[44px] px-3 text-[16px] rounded-lg border border-border bg-white dark:bg-surface focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition disabled:bg-gray-50"
            />
          </div>

          {/* หยิบใส่รถเข็น — the real CTA */}
          <div className="col-span-12 text-left md:text-right">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={adding || priceCny <= 0}
              className="btn-main inline-flex items-center justify-center gap-1.5 h-[44px] rounded-full bg-red-600 hover:bg-red-700 text-white text-[16px] font-semibold px-6 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
              {adding ? "กำลังเพิ่ม..." : "หยิบใส่รถเข็น"}
            </button>
            {priceCny <= 0 && (
              <p className="mt-2 text-[13px] text-muted">
                ราคายังไม่พร้อม —{" "}
                <Link
                  href="/cart"
                  className="text-red-600 underline underline-offset-2 hover:text-red-700"
                >
                  ไปที่ตะกร้าเพื่อกรอกเอง
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

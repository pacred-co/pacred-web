"use client";

/**
 * Admin link-paste product search panel — top of /admin/service-orders/cart/add.
 *
 * Wave 23 P2 #16 (2026-05-27 ภูม flag) — cherry-pick of dave-pacred
 * commit `356edcb` (เดฟ customer-side link-paste) adapted for admin:
 *   - calls `searchProductByUrlAdmin` (withAdmin auth) instead of
 *     customer `searchProductByUrl` (member_code-required)
 *   - calls `adminAddItemToCart` instead of customer `addCartItem`
 *   - accepts `userid` (cart-owner PR<n>) + `myAdminId` (fallback)
 *     props from the parent server component
 *
 * Flow:
 *   1. Admin pastes 1688/Taobao/Tmall URL → click ค้นหา
 *   2. Server action fetches via TAMIT → returns product card
 *      (image · title · ¥ price · shop name)
 *   3. Admin adjusts qty + note → click "+ เพิ่มในรถเข็น"
 *   4. `adminAddItemToCart` inserts into tb_cart for the chosen userid
 *   5. On TAMIT failure → red notice + admin uses the manual form below
 *
 * Provider mapping (TAMIT → tb_cart.cprovider enum):
 *   - "1688"  → "1"
 *   - "taobao" → "2"
 *   - "tmall"  → "3"
 *
 * Mobile-first per AGENTS.md §6: inputs ≥ 44px high · body text ≥ 16px ·
 * single-column on <md · primary CTA thumb-reachable.
 */

import { useState, useTransition } from "react";
import {
  searchProductByUrlAdmin,
  type AdminProductSearchOk,
} from "@/actions/admin/product-search";
import { adminAddItemToCart } from "@/actions/admin/cart";
import { ADMIN_CART_PROVIDERS } from "@/lib/validators/admin-cart";

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

export function AdminLinkPasteSearch({ initialUserId, myAdminId, rsDefault }: Props) {
  // Form state
  const [userid, setUserid]   = useState(initialUserId);
  const [url, setUrl]         = useState("");
  const [product, setProduct] = useState<AdminProductSearchOk | null>(null);
  const [qty, setQty]         = useState(1);
  const [note, setNote]       = useState("");

  // Async state
  const [searching, startSearch] = useTransition();
  const [adding, startAdd]       = useTransition();
  const [searchErr, setSearchErr]= useState<string | null>(null);
  const [flash, setFlash]        = useState<
    | { kind: "added"; title: string; id: number }
    | { kind: "add_failed"; message: string }
    | null
  >(null);

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    setSearchErr(null);
    setFlash(null);
    setProduct(null);
    setQty(1);
    setNote("");
    startSearch(async () => {
      const r = await searchProductByUrlAdmin(u);
      // Discriminated union narrowing — check `ok` first so TS narrows the rest.
      if (r.ok) {
        if (r.data) setProduct(r.data);
        else setSearchErr("ค้นหาสำเร็จแต่ไม่มีข้อมูลสินค้า");
      } else {
        // `message` field on admin action carries Thai-ready text (set by the
        // unsupported_host / invalid_url branches above the withAdmin wrap);
        // fallback to `error` string from the withAdmin error path.
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
    setFlash(null);
    startAdd(async () => {
      const r = await adminAddItemToCart({
        userid: owner,
        item: {
          curl:      product.sourceUrl,
          cdetails:  note.trim() || product.title,
          ctitle:    product.title,
          cnameshop: product.shopName || "pcs",
          cprovider: mapProvider(product.provider),
          cimages:   product.imageUrl || "",
          cprice:    product.promoPriceCny ?? product.priceCny,
          camount:   qty,
          ccolor:    "",
          csize:     "",
        },
      });
      if (r.ok) {
        setFlash({ kind: "added", title: product.title, id: r.data?.id ?? 0 });
        // Reset for next add — keep userid + url field intact so admin
        // can paste another product for the same customer.
        setQty(1);
        setNote("");
      } else {
        setFlash({ kind: "add_failed", message: r.error || "เพิ่มสินค้าไม่สำเร็จ" });
      }
    });
  }

  const displayPrice = product?.promoPriceCny ?? product?.priceCny ?? 0;
  const previewThb = product ? (displayPrice * rsDefault).toFixed(2) : "—";

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
          ระบบจะดึงรูป · ชื่อสินค้า · ราคา ¥ จาก marketplace มาให้อัตโนมัติ
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-start gap-4 flex-wrap">
            {/* Image */}
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title}
                className="h-32 w-32 rounded-lg object-contain bg-white border border-border flex-shrink-0"
              />
            ) : (
              <div className="h-32 w-32 rounded-lg bg-surface-alt border border-border flex items-center justify-center text-4xl text-muted flex-shrink-0">
                📦
              </div>
            )}

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
                <span className="inline-block rounded-full bg-white border border-border px-2 py-0.5 font-mono text-[10px] uppercase">
                  {product.provider}
                </span>
                {product.shopName && (
                  <span className="text-xs">ร้าน: <strong>{product.shopName}</strong></span>
                )}
                {product.productId && (
                  <span className="text-[10px] font-mono text-muted">#{product.productId}</span>
                )}
              </div>
              <div className="text-lg font-mono font-semibold text-red-700">
                ¥{displayPrice.toFixed(2)}
                {product.promoPriceCny != null && product.promoPriceCny < product.priceCny && (
                  <span className="ml-2 text-xs text-muted line-through font-normal">
                    ¥{product.priceCny.toFixed(2)}
                  </span>
                )}
                <span className="ml-2 text-xs text-muted font-normal">
                  ≈ ฿{previewThb} <span className="text-[10px]">(เรท {rsDefault.toFixed(2)})</span>
                </span>
              </div>
            </div>
          </div>

          {/* Qty + note */}
          <div className="grid sm:grid-cols-3 gap-3 pt-1">
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
                  max={9999}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(9999, Number(e.target.value) || 1)))}
                  disabled={adding}
                  className={`${INPUT_CLS} text-center font-mono w-20`}
                />
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(9999, q + 1))}
                  disabled={adding || qty >= 9999}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="lps_note" className="block text-xs font-medium text-muted mb-1.5">
                หมายเหตุ (สี · ขนาด · ตัวเลือก SKU · etc.)
              </label>
              <input
                id="lps_note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={adding}
                maxLength={500}
                className={INPUT_CLS}
                placeholder="สีดำ ไซส์ M (เว้นว่างได้ — จะใช้ชื่อสินค้าแทน)"
              />
            </div>
          </div>

          {/* Add to cart */}
          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={onAddToCart}
              disabled={adding}
              className="rounded-lg bg-primary-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? "กำลังเพิ่ม..." : `+ เพิ่มในรถเข็น (× ${qty})`}
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

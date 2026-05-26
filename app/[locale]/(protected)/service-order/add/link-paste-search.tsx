"use client";

/**
 * Link-paste product search panel — sits at the top of /service-order/add.
 *
 * Closes the D1 fidelity gap called out in
 * `docs/research/d1-fidelity-customer.md` §4: legacy `shops.php` /
 * `cart/add/` led with a "paste a Taobao/1688/Tmall link" search box,
 * the iconic PCS workflow. Pacred had no inline equivalent — only the
 * NavBar SearchBar (which doesn't submit anywhere) and the
 * `/search?url=` route (whose URL-paste MODE A is still a SKELETON;
 * see app/[locale]/(protected)/search/page.tsx L51-67 FLAGGED note).
 *
 * V1 scope (this file):
 *   - Paste a URL → searchProductByUrl() (server action)
 *   - Render fetched product (image + title + ¥ + ฿)
 *   - Qty stepper + "เพิ่มในตะกร้า" → addCartItem() (existing action)
 *   - On TAMIT failure → show "ระบบค้นหาไม่พร้อม" notice + tell the
 *     user to gather the order via the cart manually (existing flow)
 *
 * Out of scope for V1 (flagged in the report):
 *   - Image upload search (legacy `cart/add/` had a camera-icon input
 *     wired to Laonet `lib/china-search/laonet.ts`). The action
 *     `searchByImage` exists but the UI surface is deferred.
 *   - SKU axis grid (color/size pickers). Legacy URL-paste landed in
 *     a multi-variant table; V1 ships a single-row add to ship the
 *     ship-blocker minimum, then a follow-up adds the axis grid.
 *
 * ── Mobile-first per AGENTS.md §6 + docs/conventions.md §11 ────
 *   - All input + button heights ≥ 44px
 *   - Body text ≥ 16px
 *   - Single-column layout on < md, side-by-side from md+
 *   - Primary CTA always thumb-reachable (bottom of card)
 */

import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  searchProductByUrl,
  type ProductSearchResult,
  type ProductSearchOk,
} from "@/actions/product-search";
import { addCartItem } from "@/actions/cart";

type LinkPasteSearchProps = {
  /** Live yuan exchange rate (tb_settings.rsdefault). Used to display
   *  ฿ conversion next to the ¥ price. Server-loaded so it matches the
   *  page chrome's rate. Defaults to 5.0 if unset (legacy posture). */
  rsDefault: number;
};

export function LinkPasteSearch({ rsDefault }: LinkPasteSearchProps) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ProductSearchResult | null>(null);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  // Per-product UI state — reset when result changes
  const [qty, setQty] = useState(1);
  const [addNote, setAddNote] = useState("");
  // Post-add flash state (sticky for ~5s; user can clear by re-searching).
  const [flash, setFlash] = useState<
    | { kind: "added"; title: string }
    | { kind: "cart_full"; message: string }
    | { kind: "add_failed"; message: string }
    | null
  >(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim()) return;
    setFlash(null);
    startSearch(async () => {
      const r = await searchProductByUrl(url.trim());
      setResult(r);
      // Reset per-product state on each new search
      setQty(1);
      setAddNote("");
    });
  }

  function onAddToCart(product: ProductSearchOk["product"]) {
    setFlash(null);
    startAdd(async () => {
      const r = await addCartItem({
        provider: product.provider,
        shop_name: product.shopName || "pacred",
        url: product.sourceUrl,
        title: product.title,
        image_path: product.imageUrl,
        // V1: color/size not collected (no SKU axis grid yet — see
        // file-level "Out of scope" note). User can edit on /cart.
        color: undefined,
        size: undefined,
        price_cny: product.promoPriceCny ?? product.priceCny,
        amount: qty,
        details: addNote.trim() || undefined,
      });
      if (r.ok) {
        setFlash({ kind: "added", title: product.title });
        // Reset qty so consecutive adds start at 1 again. Keep the
        // result visible so the user can change qty and add again.
        setQty(1);
        setAddNote("");
      } else {
        // The 151-cap trigger raises a postgres error with the literal
        // phrase "cart cap reached (151 items)" — surface a friendlier
        // message when we detect it.
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 sm:p-6 mb-4">
      <div className="flex items-center gap-2 mb-3">
        {/* shopping-search icon — inline svg keeps the bundle small */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-600 shrink-0"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 leading-tight">
          วางลิ้งสินค้า 1688 / Taobao / Tmall เพื่อค้นหา
        </h3>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="url"
          name="paste-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://detail.1688.com/offer/... หรือ https://item.taobao.com/..."
          required
          disabled={searching}
          aria-label="วางลิ้งสินค้า"
          className="flex-1 min-w-0 h-[44px] px-4 text-[16px] rounded-lg border border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition disabled:bg-gray-50 disabled:text-gray-500"
        />
        <button
          type="submit"
          disabled={searching || !url.trim()}
          className="h-[44px] px-6 text-[16px] font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {searching ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </form>

      {/* Flash banner — post-add toast or error */}
      {flash && (
        <div
          role="status"
          aria-live="polite"
          className={`mt-3 px-4 py-3 rounded-lg text-[14px] font-medium ${
            flash.kind === "added"
              ? "bg-green-50 text-green-800 border border-green-200"
              : flash.kind === "cart_full"
              ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {flash.kind === "added" && (
            <span>
              เพิ่มลงตะกร้าแล้ว:{" "}
              <span className="font-semibold">{truncate(flash.title, 60)}</span>{" "}
              ·{" "}
              <Link
                href="/cart"
                className="underline underline-offset-2 hover:text-green-900"
              >
                ไปที่ตะกร้า
              </Link>
            </span>
          )}
          {flash.kind !== "added" && <span>{flash.message}</span>}
        </div>
      )}

      {/* Result panel — only after a search returns */}
      {result && !result.ok && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-start gap-2 text-gray-700">
            <span className="text-xl leading-none" aria-hidden="true">!</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900 mb-1">
                {result.message ??
                  "ระบบค้นหาไม่พร้อม กรุณากรอกรายการสินค้าด้วยตนเอง"}
              </p>
              <p className="text-[14px] text-gray-600">
                หรือไปที่{" "}
                <Link
                  href="/cart"
                  className="text-red-600 underline underline-offset-2 hover:text-red-700"
                >
                  หน้าตะกร้า
                </Link>{" "}
                เพื่อเริ่มสั่งซื้อด้วยตนเอง
              </p>
            </div>
          </div>
        </div>
      )}

      {result && result.ok && (
        <ProductResultCard
          product={result.product}
          rsDefault={rsDefault}
          qty={qty}
          setQty={setQty}
          addNote={addNote}
          setAddNote={setAddNote}
          adding={adding}
          onAdd={() => onAddToCart(result.product)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ProductResultCard — the fetched product preview + add-to-cart UI
// ────────────────────────────────────────────────────────────
function ProductResultCard({
  product,
  rsDefault,
  qty,
  setQty,
  addNote,
  setAddNote,
  adding,
  onAdd,
}: {
  product: ProductSearchOk["product"];
  rsDefault: number;
  qty: number;
  setQty: (n: number) => void;
  addNote: string;
  setAddNote: (s: string) => void;
  adding: boolean;
  onAdd: () => void;
}) {
  const unitCny = product.promoPriceCny ?? product.priceCny;
  const totalCny = unitCny * qty;
  const totalThb = totalCny * rsDefault;
  const PROVIDER_LOGO: Record<string, string> = {
    "1688":   "/legacy/pcs/shops/1688-logo.png",
    "taobao": "/legacy/pcs/shops/taobao-logo.png",
    "tmall":  "/legacy/pcs/shops/tmall-logo.png",
  };

  return (
    <div className="mt-4 p-4 sm:p-5 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Image — fixed aspect-square so layout doesn't jump */}
        <div className="w-full sm:w-40 shrink-0">
          <div className="aspect-square w-full bg-white border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center">
            {product.imageUrl ? (
              // Plain <img> by design — TAMIT serves images from
              // arbitrary CDN hosts (alicdn / various). next/image needs
              // a domain allow-list; CSP already permits https:.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.title}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="text-gray-400 text-[14px] p-4 text-center">
                ไม่มีรูปสินค้า
              </div>
            )}
          </div>
        </div>

        {/* Detail + qty + add-to-cart */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-2">
            {PROVIDER_LOGO[product.provider] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={PROVIDER_LOGO[product.provider]}
                alt={product.provider}
                className="h-5 sm:h-6 shrink-0 mt-0.5"
              />
            )}
            <h4 className="text-[16px] sm:text-[17px] font-medium text-gray-900 leading-snug break-words">
              {product.title}
            </h4>
          </div>

          {product.shopName && (
            <p className="text-[14px] text-gray-600 mb-2">
              ร้านค้า:{" "}
              <span className="font-medium text-gray-800">{product.shopName}</span>
            </p>
          )}

          <p className="text-[14px] text-gray-600 mb-3">
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 underline underline-offset-2 break-all"
            >
              ดูสินค้าต้นทาง
            </a>
          </p>

          {/* Price */}
          <div className="mb-3 p-3 bg-white border border-gray-200 rounded-md">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[14px] text-gray-600">ราคา/ชิ้น:</span>
              <span className="text-[18px] font-bold text-red-600">
                ¥{numberFormat2(unitCny)}
              </span>
              {product.promoPriceCny != null &&
                product.promoPriceCny < product.priceCny && (
                  <span className="text-[13px] text-gray-400 line-through">
                    ¥{numberFormat2(product.priceCny)}
                  </span>
                )}
              <span className="text-[14px] text-gray-500">
                ≈ ฿{numberFormat2(unitCny * rsDefault)} (เรท {rsDefault.toFixed(2)}฿/¥)
              </span>
            </div>
          </div>

          {/* Qty + note + CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 items-start">
            <div>
              <label
                htmlFor="paste-qty"
                className="block text-[14px] font-medium text-gray-700 mb-1"
              >
                จำนวน
              </label>
              <div className="flex items-stretch border border-gray-300 rounded-lg overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={adding || qty <= 1}
                  aria-label="ลดจำนวน"
                  className="w-[44px] h-[44px] text-[20px] font-bold text-gray-700 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition"
                >
                  -
                </button>
                <input
                  id="paste-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={9999}
                  value={qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (Number.isFinite(n) && n > 0) setQty(Math.min(9999, n));
                    else if (e.target.value === "") setQty(1);
                  }}
                  disabled={adding}
                  className="w-[60px] text-center text-[16px] border-x border-gray-300 outline-none focus:bg-red-50 disabled:bg-gray-50"
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
            <div>
              <label
                htmlFor="paste-note"
                className="block text-[14px] font-medium text-gray-700 mb-1"
              >
                หมายเหตุ <span className="text-gray-400">(สี / ขนาด / รุ่น)</span>
              </label>
              <input
                id="paste-note"
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="เช่น สีดำ ขนาด M"
                maxLength={200}
                disabled={adding}
                className="w-full h-[44px] px-3 text-[16px] rounded-lg border border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition disabled:bg-gray-50"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-gray-200">
            <div className="text-[14px] text-gray-700">
              รวม:{" "}
              <span className="font-bold text-red-600 text-[16px]">
                ¥{numberFormat2(totalCny)}
              </span>{" "}
              <span className="text-gray-500">
                (≈ ฿{numberFormat2(totalThb)})
              </span>
            </div>
            <button
              type="button"
              onClick={onAdd}
              disabled={adding}
              className="h-[44px] px-5 text-[16px] font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
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
              {adding ? "กำลังเพิ่ม..." : "เพิ่มในตะกร้า"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers — kept inline (no shared util needed; matches existing
// `numberFormat2` pattern in service-order/add/page.tsx)
// ────────────────────────────────────────────────────────────
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

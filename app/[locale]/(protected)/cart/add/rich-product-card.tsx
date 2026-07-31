"use client";

/**
 * `<RichProductCard>` — the FULL product-detail card for a verified link on
 * `/cart/add` (owner 2026-07-31 "กดค้นแล้วดึง API มาโชว์เป็นแบบในภาพ").
 *
 * It renders the product HEADER (image gallery + title + ¥/฿ price + shop) and
 * hands the interactive part (SKU/variant grid + qty + price calc + หยิบใส่รถเข็น)
 * to the PROVEN `<UrlPasteAddToCart>` island already used on `/search` — so the
 * money path (addCartItem → tb_cart) is 100% reused, not re-implemented.
 *
 * Data comes from the un-stripped `searchProductByUrl` action (which now returns
 * skuAxes/skuMap/images/basePrice — see actions/product-search.ts). One card per
 * verified link; the multi-link paste flow maps its ok-results to these cards.
 */

import { UrlPasteAddToCart } from "../../search/url-paste-add-to-cart";
import type { ProductSearchOk } from "@/actions/product-search";
import { MAX_ORDER_QTY } from "@/lib/validators/order-qty";

type Product = ProductSearchOk["product"];

// TAMIT/CDN sometimes return http:// — the strict CSP drops those → broken image.
// China CDNs serve the same asset over https, so the upgrade is safe (same fix
// as /search/page.tsx).
const toHttps = (u?: string): string | undefined =>
  u ? u.replace(/^http:\/\//i, "https://") : u;

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RichProductCard({
  product: p,
  rsDefault,
  fxRates,
}: {
  product: Product;
  rsDefault: number;
  fxRates: Record<string, number>;
}) {
  const priceCny = p.promoPriceCny ?? p.priceCny;
  const priceThb = priceCny * rsDefault;
  const mainImage = toHttps(p.mainImage ?? p.imageUrl) ?? null;
  const thumbs = (p.images ?? [])
    .slice(0, 3)
    .map((u) => toHttps(u))
    .filter((u): u is string => !!u);

  return (
    <div className="rounded-2xl border border-border bg-white p-3 md:p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[176px_minmax(0,1fr)]">
        {/* ── Gallery ── */}
        <div>
          {mainImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainImage}
              alt={p.title}
              className="aspect-square w-full rounded-xl border border-border bg-white object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-alt text-3xl">
              📦
            </div>
          )}
          {thumbs.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {thumbs.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={u}
                  alt=""
                  className="aspect-square w-full rounded-lg border border-border bg-white object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Header info: source · title · price · shop ── */}
        <div className="min-w-0">
          <a
            href={p.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-primary-700 hover:underline"
          >
            {p.provider.toUpperCase()} · เปิดลิงก์ต้นทาง ↗
          </a>
          <h3 className="mt-1 line-clamp-2 text-[15px] font-bold text-foreground">{p.title}</h3>

          <div className="mt-2 inline-flex flex-wrap items-baseline gap-x-2 rounded-lg bg-red-600 px-3 py-1.5 text-white">
            <span className="text-[12px]">ราคาสินค้า</span>
            <span className="text-lg font-extrabold">¥{fmt2(priceCny)}</span>
            <span className="text-[12px] opacity-85">≈ ฿{fmt2(priceThb)}</span>
          </div>

          {p.shopName && (
            <p className="mt-1.5 text-[12px] text-muted">
              ร้านค้า: <span className="font-semibold text-foreground">{p.shopName}</span>
            </p>
          )}
        </div>
      </div>

      {/* ── Interactive: SKU/variant grid + qty + คำนวณราคา + หยิบใส่รถเข็น (reused island) ── */}
      <div className="mt-3 border-t border-border pt-3">
        <UrlPasteAddToCart
          url={p.sourceUrl}
          provider={p.provider}
          title={p.title}
          shopName={p.shopName ?? ""}
          mainImage={mainImage}
          priceCny={priceCny}
          priceThb={priceThb}
          rsDefault={rsDefault}
          fxRates={fxRates}
          minQty={1}
          maxQty={MAX_ORDER_QTY}
          detailAvailable
          skuAxes={p.skuAxes}
          skuMap={p.skuMap}
          basePriceCny={p.basePriceCny}
          promoPriceCny={p.promoPriceCny}
        />
      </div>
    </div>
  );
}

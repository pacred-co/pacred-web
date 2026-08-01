"use client";

/**
 * `<RichProductCard>` — the FULL product-detail card for a verified link on
 * `/cart/add` (owner 2026-07-31 "กดค้นแล้วดึง API มาโชว์เป็นแบบในภาพ" → the
 * polished "กรอกข้อมูลสินค้าเอง" mockup: a big image gallery with a thumbnail
 * carousel + arrows + collapse, variant image swatches, and a sticky bottom
 * price bar with the red หยิบใส่รถเข็น CTA).
 *
 * It owns the presentation (gallery header) and hands the interactive part
 * (SKU/variant swatches + qty + price calc + หยิบใส่รถเข็น) to the PROVEN
 * `<UrlPasteAddToCart richLayout>` island already used on `/search` — so the
 * money path (addCartItem → tb_cart) is 100% reused, only the presentation
 * changes.
 *
 * Data comes from the un-stripped `searchProductByUrl` action (which returns
 * skuAxes/skuMap/images/basePrice — see actions/product-search.ts). One card
 * per verified link; the multi-link review flow maps its ok-results to cards.
 */

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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

  // Full gallery = main image + every extra image, https-upgraded + deduped.
  const gallery = useMemo(() => {
    const all = [mainImage, ...(p.images ?? []).map((u) => toHttps(u))];
    return Array.from(new Set(all.filter((u): u is string => !!u)));
  }, [mainImage, p.images]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);

  const active = gallery[Math.min(activeIdx, Math.max(0, gallery.length - 1))] ?? mainImage;
  const step = (delta: number) => {
    if (gallery.length === 0) return;
    setActiveIdx((i) => (i + delta + gallery.length) % gallery.length);
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-3 md:p-4">
      <div className={galleryOpen ? "grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]" : "grid grid-cols-1 gap-4"}>
        {/* ── Gallery ── */}
        {galleryOpen ? (
          <div>
            <div className="relative">
              {/* collapse toggle (screenshot 1 "|◁") */}
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                title="ย่อรูปสินค้า"
                aria-label="ย่อรูปสินค้า"
                className="absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white/90 text-muted shadow-sm backdrop-blur hover:text-primary-600"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
              {active ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active}
                  alt={p.title}
                  className="aspect-square w-full rounded-xl border border-border bg-white object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-surface-alt text-3xl">
                  📦
                </div>
              )}
            </div>

            {/* thumbnail carousel with ‹ › arrows */}
            {gallery.length > 1 && (
              <div className="mt-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    step(-1);
                    stripRef.current?.scrollBy({ left: -120, behavior: "smooth" });
                  }}
                  aria-label="รูปก่อนหน้า"
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted hover:text-primary-600"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div ref={stripRef} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-smooth">
                  {gallery.map((u, i) => (
                    <button
                      key={u + i}
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      aria-label={`รูปที่ ${i + 1}`}
                      className={`aspect-square w-14 flex-shrink-0 overflow-hidden rounded-lg border bg-white transition ${
                        i === activeIdx ? "border-red-500 ring-2 ring-red-500/20" : "border-border hover:border-red-300"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    step(1);
                    stripRef.current?.scrollBy({ left: 120, behavior: "smooth" });
                  }}
                  aria-label="รูปถัดไป"
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted hover:text-primary-600"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          // Collapsed: a thin expand button so the variant panel gets full width.
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-muted hover:text-primary-600"
          >
            <PanelLeftOpen className="h-4 w-4" /> แสดงรูปสินค้า
          </button>
        )}

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

      {/* ── Interactive: variant swatches + qty + คำนวณราคา + sticky หยิบใส่รถเข็น
          (reused island · full card width so the sticky bar spans the card) ── */}
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
          richLayout
        />
      </div>
    </div>
  );
}

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
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  const optionCount = p.skuMap?.length ?? 0;
  const stockTotal = p.stockTotal ?? 0;

  // Full gallery = main image + every extra image, https-upgraded + deduped.
  const gallery = useMemo(() => {
    const all = [mainImage, ...(p.images ?? []).map((u) => toHttps(u))];
    return Array.from(new Set(all.filter((u): u is string => !!u)));
  }, [mainImage, p.images]);

  const [activeIdx, setActiveIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const active = gallery[Math.min(activeIdx, Math.max(0, gallery.length - 1))] ?? mainImage;
  const step = (delta: number) => {
    if (gallery.length === 0) return;
    setActiveIdx((i) => (i + delta + gallery.length) % gallery.length);
  };

  return (
    // rounded-tl-none: the รายการที่ N tab strip attaches to this corner, and it
    // supplies the curve. Leaving the card's own radius here drew a SECOND curve
    // 1px away, which read as a seam (owner 2026-08-03 "ขอบ … มันแปลกๆ").
    <div className="rounded-2xl rounded-tl-none border border-border bg-white p-3 md:p-4">
      {/* 300px photo — the option table needs ~540px and the card is capped at
          1200px, so a wider photo column clipped the row's delete button. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* ── Gallery ── */}
        {
          <div>
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
                <div ref={stripRef} className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto scroll-smooth">
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
        }

        {/* ── Header info: source · title · meta strip · price block ──
            Shapes owner's 2026-08-03 mockup: the shop / option-count / stock
            facts sit on ONE divider-separated line (marketplace "rating row"
            position), and the price gets a tinted block instead of a solid
            red banner. ── */}
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[16px] font-bold leading-snug text-foreground">
            {p.title}
          </h3>

          {/* Shop · option count · stock · source link all on ONE line (owner
              2026-08-03 "ย้าย เปิดลิงก์ต้นทาง ไปไว้แถวเดียวกัน") — the link had its
              own line above the title and cost a row for one short label. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
            {p.shopName && (
              <span>
                ร้านค้า <b className="font-semibold text-foreground">{p.shopName}</b>
              </span>
            )}
            {optionCount > 0 && (
              <>
                {p.shopName && <span aria-hidden className="h-3 w-px bg-border" />}
                <span>
                  <b className="font-semibold text-foreground">{optionCount}</b> ตัวเลือก
                </span>
              </>
            )}
            {stockTotal > 0 && (
              <>
                <span aria-hidden className="h-3 w-px bg-border" />
                <span>
                  คงเหลือ <b className="font-semibold text-foreground">{stockTotal.toLocaleString()}</b> ชิ้น
                </span>
              </>
            )}
            <span aria-hidden className="h-3 w-px bg-border" />
            <a
              href={p.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary-700 hover:underline"
            >
              {p.provider.toUpperCase()} · เปิดลิงก์ต้นทาง ↗
            </a>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-primary-50 px-4 py-3">
            <span className="text-2xl font-extrabold leading-none text-primary-600">
              ¥{fmt2(priceCny)}
            </span>
            <span className="text-[13px] text-muted">≈ ฿{fmt2(priceThb)}</span>
            <span className="ml-auto text-[11.5px] text-muted">เรท {rsDefault} บาท/¥</span>
          </div>

          {/* ── Interactive: option picker + qty + คำนวณราคา + หยิบใส่รถเข็น ──
              Sits INSIDE the right column, directly under the price — the
              marketplace shape owner asked for 2026-08-03 ("ยกขึ้นมาหน่อย"),
              so the whole buying decision reads top-to-bottom beside the photo
              instead of starting below the fold. Money path is the reused
              island; only its position changed. ── */}
          <div className="mt-4">
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
      </div>
    </div>
  );
}

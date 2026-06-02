"use client";

/**
 * Reverse-image / camera "find-similar" search panel — P1-30.
 *
 * Wires the EXISTING image-search backend (`POST /api/china-search/image`
 * → `lib/china-search` `searchByImage` → Laonet adapter) that the
 * Pacred `/search` page previously ignored. Faithful to the legacy
 * `member/include/pages/search/searchIMG.php` / `searchIMG2.php` flow:
 * the customer uploads a product photo (or snaps one with the phone
 * camera via `capture="environment"`) → reverse-search China
 * marketplaces (1688 via Laonet) → render the result cards in the SAME
 * grid layout the text/keyword search uses.
 *
 * Contract of the API route (app/api/china-search/image/route.ts):
 *   - POST multipart/form-data, single field `image` (a Blob/File).
 *   - 5 MB cap (mirrors the route's own pre-check).
 *   - Returns the shared `ChinaSearchResult` JSON:
 *       { available: true,  hits: ChinaSearchHit[], page, has_more }
 *       { available: false, reason, message? }
 *
 * Each hit links to `/search?url=<hit.url>` — the same MODE-A URL-paste
 * landing the text-search grid links to, so "click a similar product"
 * flows straight into the product-detail card. We reuse the page's
 * `rsDefault` (CNY→THB rate) so prices render identically to the rest
 * of the page (฿ = price_cny × rsDefault).
 *
 * Mobile-first: the upload control is a full-width 44px+ tap target;
 * `capture="environment"` opens the rear camera on phones. The result
 * grid is 2-up on mobile, 3/4-up on larger screens — same breakpoints
 * as the keyword grid in page.tsx.
 */

import { useEffect, useRef, useState } from "react";

type Hit = {
  provider: "1688" | "taobao" | "tmall";
  product_id?: string;
  title: string;
  url: string;
  image_url?: string;
  price_cny?: number;
  shop_name?: string;
};

type ApiResult =
  | { available: true; hits: Hit[]; page: number; has_more: boolean }
  | { available: false; reason: string; message?: string };

// PHP number_format($n, 2) — mirror the page's money formatter.
function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// searchIMG.php L100-135 — truncate the product title.
function countText(text: string, num: number): string {
  const chars = Array.from(text ?? "");
  if (chars.length >= num) return chars.slice(0, num).join("") + "...";
  return text ?? "";
}

export function SearchImagePanel({
  rsDefault,
  highlight = false,
}: {
  rsDefault: number;
  highlight?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // M-5: arrived via the search-bar camera button (?img=1) → draw the eye to
  // the panel + scroll it into view. (A programmatic file-picker open here
  // would be blocked — no user gesture survives the navigation — so we
  // highlight the "เลือก / ถ่ายรูป" button for the customer to tap instead.)
  // Pulse starts ON from the prop (no synchronous setState in the effect body —
  // react-hooks/set-state-in-effect); the effect only scrolls + fades it off.
  const [pulse, setPulse] = useState(highlight);
  useEffect(() => {
    if (!highlight) return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setPulse(false), 2400);
    return () => clearTimeout(t);
  }, [highlight]);

  async function handleFile(file: File) {
    // Mirror the API route's 5 MB cap + give a friendly message early.
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("ไฟล์รูปใหญ่เกินไป (สูงสุด 5 MB)");
      return;
    }
    setErrorMsg(null);
    setHits(null);
    setLoading(true);

    // Local preview (revoke the previous object URL to avoid a leak).
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/china-search/image", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ApiResult;
      if (json.available) {
        setHits(json.hits);
        if (json.hits.length === 0) {
          // searchIMG.php L185-187 — empty → "ค้นหาอีกครั้ง" state.
          setErrorMsg("ไม่พบสินค้าที่คล้ายกัน กรุณาลองรูปอื่น");
        }
      } else {
        setHits([]);
        setErrorMsg(
          json.reason === "not_authorized"
            ? "กรุณาเข้าสู่ระบบก่อนค้นหาด้วยรูปภาพ"
            : json.reason === "image_too_large"
              ? "ไฟล์รูปใหญ่เกินไป (สูงสุด 5 MB)"
              : json.reason === "no_image"
                ? "กรุณาเลือกไฟล์รูปภาพ"
                : "ค้นหาด้วยรูปภาพไม่สำเร็จ กรุณาลองใหม่",
        );
      }
    } catch {
      setHits([]);
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`mt-3 scroll-mt-24 rounded-2xl border bg-white dark:bg-surface shadow-sm overflow-hidden transition-all duration-500 ${
        pulse
          ? "border-red-400 ring-2 ring-red-300 ring-offset-2"
          : "border-border"
      }`}
    >
      <div className="p-3 md:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm md:text-base font-bold text-foreground">
              ค้นหาด้วยรูปภาพ
            </h4>
            <p className="text-[11px] md:text-xs text-muted mt-0.5">
              อัปโหลดรูปสินค้า หรือถ่ายรูป เพื่อค้นหาสินค้าที่คล้ายกันจากจีน
            </p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 min-h-[44px] text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังค้นหา…" : "เลือก / ถ่ายรูป"}
          </button>
          {/* capture="environment" → opens the rear camera on phones,
              falls back to file picker on desktop. */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              // reset so the same file can be re-picked.
              e.target.value = "";
            }}
          />
        </div>

        {previewUrl && (
          <div className="mt-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="รูปที่ค้นหา"
              className="w-16 h-16 object-cover rounded-lg border border-border"
            />
            <span className="text-xs text-muted">รูปที่ใช้ค้นหา</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 text-center text-sm text-red-600">{errorMsg}</div>
        )}
      </div>

      {/* Result grid — same breakpoints + card style as the keyword grid
          in page.tsx (grid-cols-2 / sm:3 / lg:4). */}
      {hits && hits.length > 0 && (
        <div className="px-3 pb-3 md:px-4 md:pb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {hits.map((hit, idx) => {
              const priceThb = (hit.price_cny ?? 0) * rsDefault;
              return (
                <div key={hit.product_id ?? `${hit.url}-${idx}`} className="item-product">
                  <a
                    href={`/search?url=${encodeURIComponent(hit.url)}`}
                    className="group block rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hit.image_url ?? ""}
                        className="pImages aspect-square object-cover w-full"
                        alt=""
                      />
                      <div className="jss text-pre absolute top-1.5 left-1.5 rounded-md bg-red-600 text-white text-[10px] font-medium px-1.5 py-0.5">
                        พรีออเดอร์
                      </div>
                      <div className="absolute top-1.5 right-1.5 rounded-md bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5">
                        {hit.provider}
                      </div>
                    </div>
                    <div className="p-2 text-center">
                      <h5 className="name-product text-xs md:text-sm text-foreground line-clamp-2 min-h-[2.5rem]">
                        {countText(hit.title ?? "", 28)}
                      </h5>
                      {hit.price_cny != null && (
                        <span className="block mt-1 text-red-600 font-semibold text-sm">
                          ราคา : {fmt2(priceThb)}฿
                        </span>
                      )}
                      <span className="block mt-1 text-[11px] text-sky-600 group-hover:underline">
                        ค้นหาสินค้าที่คล้ายกัน
                      </span>
                    </div>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

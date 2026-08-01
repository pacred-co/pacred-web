"use client";

/**
 * `/cart/add/review` — the destination page after "ค้นหาและตรวจสอบสินค้า"
 * (owner 2026-07-31 "กดแล้วไปหน้าใหม่ · โหลด skeleton แบบ shopee · ดึง api ลงมา").
 *
 * `/cart/add` stashes the pasted links in sessionStorage then navigates here.
 * This client island reads them, shows a Shopee-style skeleton per item while
 * `searchProductByUrl` resolves each one, then renders the FULL rich detail
 * (<RichProductCard> = gallery + SKU/variant grid + qty + price + หยิบใส่รถเข็น).
 *
 * Multiple links → tabs ("รายการที่ 1/2 …") with a live status dot; "+ เพิ่มรายการ"
 * goes back to /cart/add to paste more. Money path is 100% REUSED (the card's
 * <UrlPasteAddToCart> island → addCartItem → tb_cart).
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { AlertTriangle, Plus, ArrowLeft } from "lucide-react";
import { searchProductByUrl, type ProductSearchOk } from "@/actions/product-search";
import { RichProductCard } from "../rich-product-card";

const STORAGE_KEY = "pacred_cart_add_links";

type Item =
  | { url: string; status: "loading" }
  | { url: string; status: "ok"; product: ProductSearchOk["product"] }
  | { url: string; status: "fail"; message: string };

export function ReviewClient({
  rsDefault,
  fxRates,
}: {
  rsDefault: number;
  fxRates: Record<string, number>;
}) {
  const [items, setItems] = useState<Item[] | null>(null); // null = still reading storage
  const [active, setActive] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard React 18 StrictMode double-invoke
    started.current = true;

    let links: string[] = [];
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      links = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      links = [];
    }
    links = links.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean).slice(0, 20);

    // Client-only init from sessionStorage AFTER mount — the server + first client
    // render show the null skeleton, so there's no hydration mismatch.
    setItems(links.length === 0 ? [] : links.map((url) => ({ url, status: "loading" as const })));

    if (links.length === 0) return;

    // Fetch each in parallel; patch that slot as it resolves (skeleton → card).
    links.forEach((url, i) => {
      searchProductByUrl(url)
        .then((res) => {
          setItems((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[i] = res.ok
              ? { url, status: "ok", product: res.product }
              : { url, status: "fail", message: res.message ?? "ไม่พบข้อมูลสินค้าจากลิงก์นี้ กรุณากรอกรายการสินค้าด้วยตนเอง" };
            return next;
          });
        })
        .catch(() => {
          setItems((prev) => {
            if (!prev) return prev;
            const next = [...prev];
            next[i] = { url, status: "fail", message: "ระบบค้นหาไม่พร้อม กรุณาลองใหม่อีกครั้ง" };
            return next;
          });
        });
    });
  }, []);

  // Reading storage → show a single skeleton.
  if (items === null) {
    return <SkeletonCard />;
  }

  // No links (direct visit / expired).
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center">
        <p className="text-[15px] font-bold text-foreground">ยังไม่มีลิงก์สินค้า</p>
        <p className="mt-1 text-[13px] text-muted">กลับไปวางลิงก์ที่หน้าเพิ่มสินค้าก่อนครับ</p>
        <Link
          href="/cart/add"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> กลับไปเพิ่มลิงก์
        </Link>
      </div>
    );
  }

  const cur = items[active] ?? items[0];

  return (
    <div className="space-y-3">
      <Link
        href="/cart/add"
        className="inline-flex items-center gap-1 text-[12.5px] font-bold text-muted hover:text-primary-600"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปแก้ไขลิงก์
      </Link>

      {/* Tabs — รายการที่ 1/2 … (2-line pill: เลข+จุดสถานะ / คำอธิบายสถานะ) + เพิ่มรายการ.
          สถานะ: กำลังโหลด (เหลือง) · ไม่พบ (แดง) · กำลังกรอก = แท็บที่เปิดอยู่ (แดง) ·
          ยังไม่ครบ = แท็บอื่นที่โหลดเสร็จแต่ยังไม่ได้เปิดทำ (เทา). */}
      <div className="flex flex-wrap items-stretch gap-2">
        {items.map((it, i) => {
          const isActive = i === active;
          const sub =
            it.status === "loading"
              ? "กำลังโหลด…"
              : it.status === "fail"
                ? "ไม่พบสินค้า"
                : isActive
                  ? "กำลังกรอก"
                  : "ยังไม่ครบ";
          const dotCls =
            it.status === "loading"
              ? "animate-pulse bg-amber-400"
              : it.status === "fail"
                ? "bg-red-500"
                : isActive
                  ? "bg-red-500"
                  : "bg-slate-300";
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`inline-flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-1.5 text-left transition ${
                isActive
                  ? "border-red-500 bg-red-50 ring-2 ring-red-500/15"
                  : "border-border bg-white hover:border-red-200"
              }`}
            >
              <span
                className={`flex items-center gap-1.5 text-[12.5px] font-bold ${
                  isActive ? "text-primary-700" : "text-foreground"
                }`}
              >
                รายการที่ {i + 1}
                <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
              </span>
              <span className="text-[11px] font-medium text-muted">{sub}</span>
            </button>
          );
        })}
        <Link
          href="/cart/add"
          className="inline-flex items-center justify-center gap-1 self-stretch rounded-2xl border border-red-400 px-3.5 py-1.5 text-[12.5px] font-bold text-primary-600 transition hover:bg-red-50"
        >
          <Plus className="h-3.5 w-3.5" /> เพิ่มรายการ
        </Link>
      </div>

      {/* Active item — skeleton → rich card / error */}
      {cur.status === "loading" ? (
        <SkeletonCard />
      ) : cur.status === "fail" ? (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">ตรวจไม่พบสินค้า</p>
            <p className="mt-0.5 break-all text-[11.5px] text-red-700/80">{cur.url}</p>
            <p className="text-[12px]">{cur.message}</p>
          </div>
        </div>
      ) : (
        <RichProductCard product={cur.product} rsDefault={rsDefault} fxRates={fxRates} />
      )}
    </div>
  );
}

/** Shopee-style shimmer skeleton — mirrors <RichProductCard>'s layout. */
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-white p-3 md:p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
        {/* gallery */}
        <div>
          <div className="aspect-square w-full rounded-xl bg-gray-200" />
          <div className="mt-2 flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 w-14 shrink-0 rounded-lg bg-gray-200" />
            ))}
          </div>
        </div>
        {/* header info */}
        <div className="min-w-0 space-y-3">
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-200" />
          <div className="h-9 w-44 rounded-lg bg-gray-200" />
          <div className="h-3 w-32 rounded bg-gray-200" />
        </div>
      </div>
      {/* variant grid + cta */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-gray-200" />
          ))}
        </div>
        <div className="mt-4 h-11 w-full rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

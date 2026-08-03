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
 * opens the paste POPUP and appends new tabs in place (owner 2026-08-03 "กดเพิ่ม
 * ให้เป็น pop up") — it used to navigate back to /cart/add, which discarded the
 * review session. Money path is 100% REUSED (the card's <UrlPasteAddToCart>
 * island → addCartItem → tb_cart).
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "@/i18n/navigation";
import { AlertTriangle, Plus, ArrowLeft } from "lucide-react";
import { searchProductByUrl, type ProductSearchOk } from "@/actions/product-search";
import { RichProductCard } from "../rich-product-card";
import { MAX_LINKS } from "../link-source";
import { AddLinksDialog } from "./add-links-dialog";

const STORAGE_KEY = "pacred_cart_add_links";

type Item =
  | { url: string; status: "loading" }
  | { url: string; status: "ok"; product: ProductSearchOk["product"] }
  | { url: string; status: "fail"; message: string };

/**
 * Resolve ONE link into its slot. Module-level (not a closure) so the mount
 * effect and the popup's append path provably run the identical fetch — a
 * second inline copy is how the two paths drift.
 */
function fetchIntoSlot(
  setItems: Dispatch<SetStateAction<Item[] | null>>,
  idx: number,
  url: string,
) {
  const patch = (next: Item) =>
    setItems((prev) => {
      if (!prev) return prev;
      const out = [...prev];
      out[idx] = next;
      return out;
    });

  searchProductByUrl(url)
    .then((res) =>
      patch(
        res.ok
          ? { url, status: "ok", product: res.product }
          : {
              url,
              status: "fail",
              message: res.message ?? "ไม่พบข้อมูลสินค้าจากลิงก์นี้ กรุณากรอกรายการสินค้าด้วยตนเอง",
            },
      ),
    )
    .catch(() => patch({ url, status: "fail", message: "ระบบค้นหาไม่พร้อม กรุณาลองใหม่อีกครั้ง" }));
}

export function ReviewClient({
  rsDefault,
  fxRates,
}: {
  rsDefault: number;
  fxRates: Record<string, number>;
}) {
  const [items, setItems] = useState<Item[] | null>(null); // null = still reading storage
  const [active, setActive] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
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
    links = links.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean).slice(0, MAX_LINKS);

    // Client-only init from sessionStorage AFTER mount — the server + first client
    // render show the null skeleton, so there's no hydration mismatch.
    setItems(links.length === 0 ? [] : links.map((url) => ({ url, status: "loading" as const })));

    if (links.length === 0) return;

    // Fetch each in parallel; patch that slot as it resolves (skeleton → card).
    links.forEach((url, i) => fetchIntoSlot(setItems, i, url));
  }, []);

  /**
   * Popup handed us new links → append them as loading tabs and resolve each,
   * WITHOUT reloading the tabs already open. `items` here is the render-current
   * value (we're inside an event handler), so the start index is exact; the
   * fetches deliberately run outside the state updater, which React may invoke
   * twice under StrictMode.
   */
  function appendLinks(urls: string[]) {
    const base = items ?? [];
    const room = Math.max(0, MAX_LINKS - base.length);
    const add = urls.slice(0, room);
    if (add.length === 0) return;

    const startIdx = base.length;
    setItems([...base, ...add.map((url) => ({ url, status: "loading" as const }))]);
    add.forEach((url, k) => fetchIntoSlot(setItems, startIdx + k, url));
    setActive(startIdx); // jump to the first one just added

    // Keep storage in sync so a refresh doesn't lose the additions.
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...base.map((it) => it.url), ...add]),
      );
    } catch {
      /* private mode — the in-memory list is still correct for this visit */
    }
  }

  // Reading storage → show a single skeleton.
  if (items === null) {
    return <SkeletonCard />;
  }

  // No links (direct visit / expired) — offer the popup right here instead of
  // bouncing back to /cart/add just to paste one link (/cart/add stays linked
  // below so the full paste page keeps its entry point · §0d).
  if (items.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-white p-8 text-center">
          <p className="text-[15px] font-bold text-foreground">ยังไม่มีลิงก์สินค้า</p>
          <p className="mt-1 text-[13px] text-muted">วางลิงก์สินค้าที่ต้องการสั่งซื้อได้เลยครับ</p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> เพิ่มสินค้าเข้ารถเข็น
          </button>
          <p className="mt-3 text-[12.5px] text-muted">
            หรือ{" "}
            <Link href="/cart/add" className="font-bold text-primary-600 hover:underline">
              กลับไปหน้าเพิ่มสินค้า
            </Link>
          </p>
        </div>
        <AddLinksDialog open={addOpen} used={0} onClose={() => setAddOpen(false)} onAdd={appendLinks} />
      </>
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
      {/* mb-0 zeroes the gap the parent space-y-3 would add BELOW this row, so the
          tab strip sits flush on the card (owner 2026-08-03 "ทำให้มันติดกันหน่อย").
          NB: Tailwind v4's space-y-* spaces via margin-BOTTOM, so a negative -mb
          here would double up and overlap the card — override to 0, don't negate. */}
      <div className="mb-0 flex flex-wrap items-end gap-3">
        {/* Segmented tabs ATTACHED to the card (owner 2026-08-03 "ทำให้เชื่อมกัน ไม่ใช่
            ข้างล่างมีขอบ ข้างบนไม่มี"): ONE continuous outline wrapping tabs + card.
            The strip carries top/left/right border with the card's corner radius and
            NO bottom border, and sits 1px lower so the active tab's white fill hides
            the card's top border → that tab opens into the panel. The card's own
            top-LEFT radius is squared off (see rich-product-card) so only one curve
            is drawn. Inactive tabs keep a bottom border, so they stay "closed". */}
        <div className="inline-flex translate-y-px overflow-hidden rounded-t-2xl border border-b-0 border-border">
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
              className={`relative inline-flex flex-col items-center gap-0.5 px-5 py-2 text-center transition ${
                i > 0 ? "border-l border-border" : ""
              } ${isActive ? "bg-white" : "border-b border-border bg-surface-alt hover:bg-white"}`}
            >
              {isActive && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary-600" />
              )}
              <span
                className={`flex items-center gap-1.5 text-[12.5px] font-bold ${
                  isActive ? "text-foreground" : "text-muted"
                }`}
              >
                รายการที่ {i + 1}
                <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
              </span>
              <span className="text-[11px] font-medium text-muted">{sub}</span>
            </button>
          );
        })}
        </div>
        {/* Opens the paste popup instead of navigating to /cart/add — leaving the
            page would drop every tab back to a fresh fetch and lose the variants
            and quantities already picked (owner 2026-08-03). */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mb-1.5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-500 px-4 py-2 text-[12.5px] font-bold text-primary-600 transition hover:bg-red-50"
        >
          <Plus className="h-4 w-4" /> เพิ่มรายการ
        </button>
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

      <AddLinksDialog
        open={addOpen}
        used={items.length}
        onClose={() => setAddOpen(false)}
        onAdd={appendLinks}
      />
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

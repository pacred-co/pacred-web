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

import {
  useEffect, useMemo, useRef, useState, useTransition,
  type Dispatch, type SetStateAction,
} from "react";
import { Link } from "@/i18n/navigation";
import { AlertTriangle, Check, Info, Loader2, Pencil, Plus, ArrowLeft, ShoppingCart, X } from "lucide-react";
import { searchProductByUrl, type ProductSearchOk } from "@/actions/product-search";
import { notifyCartChanged } from "@/lib/cart-changed-event";
import { addCartItemsBulk } from "@/actions/cart";
import { uploadCartProductImage } from "@/actions/cart-manual-image";
import { RichProductCard } from "../rich-product-card";
import {
  MAX_LINKS, takeManualLinks, useStoredOriginCountry, originCountry, DEFAULT_ORIGIN,
} from "../link-source";
import {
  ManualItemForm, isManualComplete, manualItemThb, manualItemToCartRows,
  MAX_PHOTOS, newManualItem, type ManualItem,
} from "../manual/manual-item";
import { AddLinksDialog } from "./add-links-dialog";

const STORAGE_KEY = "pacred_cart_add_links";

type ItemState =
  | { status: "loading" }
  | { status: "ok"; product: ProductSearchOk["product"] }
  | { status: "fail"; message: string }
  // owner 2026-08-03 "กด ไม่มีลิงก์ แล้วเพิ่มรายการออกมาได้ต่อเลยอะ ไม่ได้ไปไหน" —
  // a typed รายการ living beside the fetched ones, same tabs, same รถเข็น ending.
  | { status: "manual"; manual: ManualItem };
/** `key` is a STABLE per-tab id — see fetchIntoSlot for why an index won't do. */
type Item = { key: number; url: string } & ItemState;

let KEY_SEQ = 1;
const newItem = (url: string): Item => ({ key: KEY_SEQ++, url, status: "loading" });
const newManualTab = (url = ""): Item => ({
  key: KEY_SEQ++, url, status: "manual", manual: newManualItem(url),
});

/**
 * Resolve ONE link into its tab. Module-level (not a closure) so the mount
 * effect and the popup's append path provably run the identical fetch — a
 * second inline copy is how the two paths drift.
 *
 * Patches by `key`, never by array index: the customer can delete a tab while a
 * sibling is still loading, and an index captured before the delete would land
 * the result on somebody else's tab (showing product A under รายการ B).
 */
function fetchIntoSlot(
  setItems: Dispatch<SetStateAction<Item[] | null>>,
  key: number,
  url: string,
) {
  const patch = (next: ItemState) =>
    setItems((prev) => (prev ? prev.map((it) => (it.key === key ? { key, url, ...next } : it)) : prev));

  searchProductByUrl(url)
    .then((res) =>
      patch(
        res.ok
          ? { status: "ok", product: res.product }
          : {
              status: "fail",
              message: res.message ?? "ไม่พบข้อมูลสินค้าจากลิงก์นี้ กรุณากรอกรายการสินค้าด้วยตนเอง",
            },
      ),
    )
    .catch(() => patch({ status: "fail", message: "ระบบค้นหาไม่พร้อม กรุณาลองใหม่อีกครั้ง" }));
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
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  /** ประเทศต้นทางที่เลือกไว้บน /cart/add — จีน (ค่าเริ่มต้น) ไม่ต้องแปะลง cdetails. */
  const reviewOrigin = useStoredOriginCountry();
  const originForRows =
    reviewOrigin === DEFAULT_ORIGIN ? undefined : originCountry(reviewOrigin).label;
  /**
   * Tabs whose contents already landed in tb_cart — the ✓ badge (owner
   * 2026-08-03 "ถ้าเพิ่มแล้ว ให้ขึ้นมุมเป็น checkmark จะได้รู้ว่าเพิ่มแล้ว").
   * With several รายการ open it is otherwise impossible to tell which ones are
   * done, and the customer either double-adds or forgets one.
   */
  const [addedKeys, setAddedKeys] = useState<Set<number>>(new Set());
  const markAdded = (key: number) => setAddedKeys((s) => new Set(s).add(key));
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  const currencyOptions = useMemo(() => {
    const keys = ["CNY", "THB", ...Object.keys(fxRates ?? {})];
    return Array.from(new Set(keys.map((k) => k.toUpperCase())));
  }, [fxRates]);

  /**
   * เพิ่ม "รายการกรอกเอง" ต่อในหน้านี้เลย ไม่เด้งไปหน้าอื่น (owner 2026-08-03
   * "กดไม่มีลิงก์ แล้วเพิ่มรายการออกมาได้ต่อเลย ไม่ได้ไปไหน" · ย้ำอีกครั้ง
   * 2026-08-04 "ให้มันเป็นรายการต่อเลย ไม่ใช่ไปโผล่หน้าอื่น อยู่หน้าเดิม").
   * ฟอร์มที่โผล่มาเป็นตัวเดียวกับหน้า /cart/add/manual (ManualItemForm + คลาส
   * pcs-item-*) จึงหน้าตาเหมือนกันทุกจุดตามที่ owner ต้องการ.
   * `urls` ว่าง = รายการเปล่า 1 อัน.
   */
  function addManualTabs(urls: string[]) {
    const base = items ?? [];
    const room = Math.max(0, MAX_LINKS - base.length);
    if (room === 0) return;
    const add = (urls.length > 0 ? urls : [""]).slice(0, room).map(newManualTab);
    setItems([...base, ...add]);
    setActive(base.length);
    setErr(null);
  }

  /** Turn a tab whose fetch failed into a typed one, keeping its position. */
  function convertToManual(key: number) {
    setItems((prev) =>
      prev
        ? prev.map((it) =>
            it.key === key ? { key, url: it.url, status: "manual", manual: newManualItem(it.url) } : it,
          )
        : prev,
    );
  }

  const patchManual = (key: number, p: Partial<ManualItem>) => {
    setItems((prev) =>
      prev
        ? prev.map((it) =>
            it.key === key && it.status === "manual" ? { ...it, manual: { ...it.manual, ...p } } : it,
          )
        : prev,
    );
    // Editing after adding means the cart no longer matches what's on screen —
    // keeping the ✓ would be a lie, so it clears until they add again.
    setAddedKeys((s) => {
      if (!s.has(key)) return s;
      const n = new Set(s);
      n.delete(key);
      return n;
    });
    setErr(null);
  };

  async function pickPhoto(key: number, file: File) {
    setUploading(key);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await uploadCartProductImage(fd);
      if (res.ok) {
        setItems((prev) => prev ? prev.map((it) => (it.key === key && it.status === "manual"
          ? { ...it, manual: { ...it.manual, images: [...it.manual.images, res.url].slice(0, MAX_PHOTOS) } } : it)) : prev);
      }
      else setErr(res.error);
    } catch {
      setErr("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploading(null);
    }
  }

  /**
   * Same ending as a fetched card: rows → tb_cart, then STAY on the page with a
   * ✓ on the tab. The with-link island behaves exactly this way (success banner,
   * no navigation) so the customer can work through several รายการ in one go —
   * jumping to /cart after the first one would strand the tabs still open.
   */
  function addManualToCart(key: number, it: ManualItem) {
    // Today only จีน can reach this page (a non-จีน pick routes straight to
    // /cart/add/manual), but the country is stamped here too so the "กรอกเอง" tab
    // can never become the one path that silently drops it.
    const rows = manualItemToCartRows(it, fxRates, originForRows);
    if (rows.length === 0) {
      setErr("กรุณาวางลิงก์ร้านค้า หรือกรอกชื่อสินค้าพร้อมราคา อย่างน้อย 1 อย่างครับ");
      return;
    }
    startTransition(async () => {
      const res = await addCartItemsBulk(rows);
      if (!res.ok) {
        setErr(res.error ?? "เพิ่มลงรถเข็นไม่สำเร็จ");
        return;
      }
      markAdded(key);
      notifyCartChanged();
      setErr(null);
    });
  }

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
    // /cart/add may have sent along links from shops we have no API for — they
    // become typed tabs beside the fetched ones, in the same list.
    const seeded = links.map(newItem);
    // /cart/add may have sent along links from shops we have no API for — they
    // become typed tabs beside the fetched ones, in the same list.
    const manual = takeManualLinks().map((u) => newManualTab(u));
    setItems([...seeded, ...manual].slice(0, MAX_LINKS));

    // Fetch each in parallel; patch that tab as it resolves (skeleton → card).
    seeded.forEach((it) => fetchIntoSlot(setItems, it.key, it.url));
  }, []);

  /**
   * Popup handed us new links → append them as loading tabs and resolve each,
   * WITHOUT reloading the tabs already open. `items` here is the render-current
   * value (we're inside an event handler), so the start index is exact; the
   * fetches deliberately run outside the state updater, which React may invoke
   * twice under StrictMode.
   */
  function appendLinks(urls: string[], leftover: string[] = []) {
    const base = items ?? [];
    const room = Math.max(0, MAX_LINKS - base.length);
    const add = urls.slice(0, room).map(newItem);
    // Links from unsupported shops become typed tabs in the SAME list, so
    // nothing is dropped and the customer never leaves the page.
    const manual = leftover.slice(0, Math.max(0, room - add.length)).map((u) => newManualTab(u));
    if (add.length === 0 && manual.length === 0) return;

    const next = [...base, ...add, ...manual];
    setItems(next);
    add.forEach((it) => fetchIntoSlot(setItems, it.key, it.url));
    setActive(base.length); // jump to the first one just added
    syncStorage(next);
  }

  /**
   * Delete a tab (owner 2026-08-03 "ให้มันกดลบได้") — a wrong link used to be
   * stuck on the page for the rest of the session. Safe mid-flight because the
   * in-flight fetches patch by `key`, not by position.
   */
  function removeItem(idx: number) {
    if (!items || items.length <= 1) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    setActive((a) => (a > idx ? a - 1 : Math.min(a, next.length - 1)));
    syncStorage(next);
  }

  /** Mirror the FETCHABLE tabs into sessionStorage so a refresh shows the same
   *  set. Typed tabs are deliberately excluded — storing their url would make a
   *  refresh resurrect them as product tabs that can never resolve. */
  function syncStorage(list: Item[]) {
    try {
      const urls = list.filter((it) => it.status !== "manual").map((it) => it.url);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
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
            ไม่มีลิงก์?{" "}
            <button
              type="button"
              onClick={() => addManualTabs([])}
              className="font-bold text-primary-600 hover:underline"
            >
              กรอกข้อมูลเอง
            </button>
            {" · "}
            <Link href="/cart/add" className="font-bold text-primary-600 hover:underline">
              กลับไปหน้าเพิ่มสินค้า
            </Link>
          </p>
        </div>
        <AddLinksDialog open={addOpen} used={0} onClose={() => setAddOpen(false)} onAdd={appendLinks} onManual={(u) => { setAddOpen(false); addManualTabs(u); }} />
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
          const manualDone = it.status === "manual" && isManualComplete(it.manual);
          const added = addedKeys.has(it.key);
          const sub = added
            ? "เพิ่มลงรถเข็นแล้ว"
            : it.status === "loading"
              ? "กำลังโหลด…"
              : it.status === "fail"
                ? "ไม่พบสินค้า"
                : it.status === "manual"
                  ? manualDone ? "กรอกเอง · ครบแล้ว" : "กรอกเอง"
                  : isActive
                    ? "กำลังกรอก"
                    : "ยังไม่ครบ";
          const dotCls = added
            ? "bg-emerald-500"
            : it.status === "loading"
              ? "animate-pulse bg-amber-400"
              : it.status === "fail"
                ? "bg-red-500"
                : it.status === "manual"
                  ? manualDone ? "bg-emerald-500" : "bg-amber-500"
                  : isActive
                    ? "bg-red-500"
                    : "bg-slate-300";
          const closable = items.length > 1;
          // The cell (not the button) carries the segmented borders + fill so the
          // ✕ can sit inside it — a <button> may not be nested in a <button>.
          return (
            <div
              key={it.key}
              className={`relative inline-flex ${i > 0 ? "border-l border-border" : ""} ${
                isActive ? "bg-white" : "border-b border-border bg-surface-alt hover:bg-white"
              }`}
            >
              {isActive && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary-600" />
              )}
              {added && (
                <span
                  aria-hidden
                  title="เพิ่มลงรถเข็นแล้ว"
                  className="absolute left-1 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              <button
                type="button"
                onClick={() => setActive(i)}
                className={`inline-flex flex-col items-center gap-0.5 py-2 text-center transition ${
                  added ? "pl-7" : "pl-5"
                } ${closable ? "pr-8" : "pr-5"}`}
              >
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
              {closable && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  aria-label={`ลบรายการที่ ${i + 1}`}
                  title="ลบรายการนี้"
                  className="absolute right-1 top-1.5 rounded-full p-1 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
        <button
          type="button"
          onClick={() => addManualTabs([])}
          className="mb-1.5 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-muted transition hover:bg-red-50 hover:text-primary-600"
        >
          <Pencil className="h-4 w-4" /> ไม่มีลิงก์? กรอกเอง
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
            <button
              type="button"
              onClick={() => convertToManual(cur.key)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-primary-700"
            >
              <Pencil className="h-4 w-4" /> กรอกข้อมูลสินค้าเอง
            </button>
          </div>
        </div>
      ) : cur.status === "manual" ? (
        <>
          {/* `@container` = ต้องมีคู่กับ @-variant ใน <ManualItemForm> ไม่งั้นฟอร์ม
              จะกลายเป็นคอลัมน์เดียวถาวรบนหน้านี้ (ดู manual-item.tsx). */}
          <div className="pcs-item-form rounded-2xl rounded-tl-none border border-border bg-white p-3 md:p-4">
            <ManualItemForm
              item={cur.manual}
              patch={(p) => patchManual(cur.key, p)}
              currencyOptions={currencyOptions}
              uploading={uploading === cur.key}
              onPickPhoto={(f) => pickPhoto(cur.key, f)}
            />
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              วางลิงก์ร้านค้า หรือกรอกชื่อสินค้า + ราคา อย่างใดอย่างหนึ่งก็เพิ่มลงรถเข็นได้เลย
            </p>
            {/* Same ending as a fetched card — one full-width หยิบใส่รถเข็น → /cart. */}
            <div className="mt-4 border-t border-border pt-3">
              {addedKeys.has(cur.key) ? (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-full bg-emerald-50 px-4 py-3 text-[14px] font-bold text-emerald-800">
                  <Check className="h-5 w-5" strokeWidth={3} />
                  เพิ่มลงรถเข็นแล้ว
                  <Link href="/cart" className="text-primary-600 underline underline-offset-2 hover:text-primary-700">
                    ไปที่รถเข็น
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => addManualToCart(cur.key, cur.manual)}
                  disabled={!isManualComplete(cur.manual) || pending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-3 text-[15px] font-extrabold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
                  {pending
                    ? "กำลังเพิ่ม…"
                    : isManualComplete(cur.manual)
                      ? "หยิบใส่รถเข็น"
                      : "กรอกข้อมูลให้ครบก่อน"}
                </button>
              )}
              <p className="mt-2 text-center text-[12.5px] text-muted">
                ยอดรวมโดยประมาณ{" "}
                <b className="text-primary-600">
                  {manualItemThb(cur.manual, fxRates, rsDefault).toLocaleString("en-US", {
                    minimumFractionDigits: 2, maximumFractionDigits: 2,
                  })}
                </b>{" "}
                บาท
              </p>
            </div>
          </div>
          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
              {err}
            </div>
          )}
        </>
      ) : (
        <RichProductCard
          product={cur.product}
          rsDefault={rsDefault}
          fxRates={fxRates}
          onAdded={() => markAdded(cur.key)}
        />
      )}

      <AddLinksDialog
        open={addOpen}
        used={items.length}
        onClose={() => setAddOpen(false)}
        onAdd={appendLinks}
        onManual={(u) => { setAddOpen(false); addManualTabs(u); }}
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

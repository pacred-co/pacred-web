"use client";

/**
 * ONE manual (no-link) รายการ — the form body + its pure money helpers.
 *
 * Extracted from `manual-entry-client.tsx` on 2026-08-03 when the owner asked
 * for the no-link form to appear as the NEXT tab inside the review page rather
 * than on its own screen ("หมายถึงกด ไม่มีลิงก์ แล้วเพิ่มรายการออกมาได้ต่อเลยอะ
 * ไม่ได้ไปไหน"). Two hosts now render the identical form:
 *
 *   1. /cart/add/manual        — the standalone "เพิ่มสินค้าด้วยตัวเอง" page
 *   2. /cart/add/review        — a "กรอกเอง" tab beside the fetched product tabs
 *
 * A forked copy would drift the moment a field is added, and — worse — the two
 * would build DIFFERENT cart rows from the same typing. The row builder and the
 * completeness/total rules live here so both hosts are provably the same.
 *
 * Money: `manualItemToCartRows` only SHAPES rows; the write is the shared
 * `addCartItemsBulk` → tb_cart, and the server re-derives ¥ from the currency.
 */

import { useRef, useState } from "react";
import { ImagePlus, Loader2, MessageCircle, Package, Plus, Trash2, X } from "lucide-react";
import { toYuanEquivalent } from "@/lib/forwarder/currency-convert";
import { MAX_ORDER_QTY } from "@/lib/validators/order-qty";
import type { CartItemBulkRow } from "@/actions/cart";
import { LINE_OA } from "@/components/seo/site";

/** tb_cart.cdetails ceiling enforced by productDetailsField() — stay under it. */
const DETAILS_MAX = 1000;
/** Photos per รายการ — all of them ride in `cimages` comma-separated ([0] = cover). */
export const MAX_PHOTOS = 5;
/** varchar(1000) on tb_cart.cimages + tb_order.cimages (probed prod 2026-08-03). */
const IMAGES_COL_MAX = 1000;

export type OptRow = { id: number; color: string; size: string; qty: string; price: string };
export type ManualItem = {
  id: number;
  title: string;
  price: string;
  currency: string;
  shopName: string;
  minQty: string;
  details: string;
  note: string;
  /** Uploaded photos — [0] is the cover that reaches tb_cart.cimages. */
  images: string[];
  /** The shop link, when the customer HAD one we just couldn't fetch. */
  url: string;
  opts: OptRow[];
};

let SEQ = 1;
export const newManualOpt = (): OptRow => ({ id: SEQ++, color: "", size: "", qty: "", price: "" });
export const newManualItem = (url = ""): ManualItem => ({
  id: SEQ++, title: "", price: "", currency: "CNY", shopName: "", minQty: "",
  details: "", note: "", images: [], url, opts: [newManualOpt()],
});

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Rows the customer actually filled in (a blank spare row is not an order). */
export function manualFilledOpts(it: ManualItem) {
  return it.opts.filter((o) => num(o.qty) > 0);
}

/**
 * Can this รายการ go in the cart? (owner 2026-08-03: "ถ้าเขาวางลิงก์ ให้กดได้เลย
 * ถ้าใส่ข้อมูลสินค้ากับราคา ก็ให้กดใส่ตะกร้าได้เลย")
 *
 * EITHER a shop link — staff open it and quote the price, which is the whole
 * point of the "ทีมงานจะเปิดดูให้" field — OR a name + price the customer already
 * knows. The แบบ/ไซซ์ table is NOT required: it used to be, so someone who just
 * wanted "1 ชิ้นตามลิงก์นี้" was stuck on a disabled button with nothing telling
 * them why.
 */
export function isManualComplete(it: ManualItem) {
  return it.url.trim() !== "" || (it.title.trim() !== "" && num(it.price) > 0);
}

/**
 * Quantity when the customer never opened the แบบ/ไซซ์ table — their stated
 * minimum if they gave one, otherwise a single piece. tb_cart.camount must be
 * ≥ 1, so this is what keeps a link-only รายการ a valid cart row.
 */
function fallbackQty(it: ManualItem) {
  return Math.max(1, Math.floor(num(it.minQty) || 1));
}
/** Price for one variant row — its own overrides the item's base price. */
export function manualRowPrice(it: ManualItem, o: OptRow) {
  return o.price.trim() !== "" ? num(o.price) : num(it.price);
}

/** Baht estimate — mirrors the server: each row converts its OWN price to ¥. */
export function manualItemThb(it: ManualItem, fxRates: Record<string, number>, rsDefault: number) {
  const filled = manualFilledOpts(it);
  // No แบบ/ไซซ์ rows → the same single fallback row the cart will receive, so the
  // estimate on screen is the one that actually gets added.
  if (filled.length === 0) {
    return toYuanEquivalent(num(it.price), it.currency, fxRates).yuan * fallbackQty(it) * rsDefault;
  }
  return (
    filled.reduce(
      (s, o) => s + toYuanEquivalent(manualRowPrice(it, o), it.currency, fxRates).yuan * num(o.qty),
      0,
    ) * rsDefault
  );
}

/** One แบบ/ไซซ์ row = one tb_cart row (the shape the SKU picker already uses). */
export function manualItemToCartRows(
  it: ManualItem,
  fxRates: Record<string, number>,
  /**
   * ประเทศต้นทางที่ลูกค้าเลือกไว้บน /cart/add — ส่งมาเฉพาะตอนที่ "ไม่ใช่จีน"
   * (owner 2026-08-04 ปลดประเทศให้กดได้): tb_cart ไม่มีคอลัมน์ประเทศ ถ้าไม่พ่วง
   * ไปกับ cdetails ทีมจัดซื้อจะไม่มีทางรู้ว่าออเดอร์นี้สั่งจากญี่ปุ่น/เกาหลี
   * = ปุ่มที่ลูกค้ากดจะกลายเป็นการเลือกลอยๆ. จีน (ค่าเริ่มต้น) ไม่ส่ง → cdetails
   * ของออเดอร์เดิมเหมือนเดิมทุกตัวอักษร.
   */
  originLabel?: string,
): CartItemBulkRow[] {
  // Fields tb_cart has no column for are folded into cdetails with a label so
  // the buying team still sees them (the legacy model has no variant sidecar).
  const extra = [
    originLabel?.trim() && `ประเทศต้นทาง: ${originLabel.trim()}`,
    it.details.trim() && `รายละเอียด: ${it.details.trim()}`,
    it.note.trim() && `หมายเหตุถึงร้าน: ${it.note.trim()}`,
    num(it.minQty) > 0 && `ขั้นต่ำ: ${num(it.minQty)} ชิ้น`,
  ].filter(Boolean).join(" · ").slice(0, DETAILS_MAX);

  // ALL photos ride in cimages, comma-separated — the legacy multi-image
  // convention (shop-order-status-lite already reads "cimages (first)"), so the
  // cover keeps working everywhere and the extras survive into tb_order instead
  // of being stuffed into the human-readable details field. Public bucket URLs
  // are ~88 chars, so five fit the varchar(1000) column with room to spare; the
  // guard below is belt-and-braces against a future longer host.
  const images: string[] = [];
  for (const u of it.images.slice(0, MAX_PHOTOS)) {
    if ([...images, u].join(",").length > IMAGES_COL_MAX) break;
    images.push(u);
  }

  const base = {
    provider: "shop" as const,
    shop_name: it.shopName.trim() || "pacred",
    title: it.title.trim() || undefined,
    url: it.url.trim() || undefined,
    image_path: images.join(",") || undefined,
    details: extra || undefined,
    input_currency: it.currency,
  };

  const filled = manualFilledOpts(it);
  // Nothing typed in the แบบ/ไซซ์ table → ONE row for the whole รายการ. Any สี/ไซซ์
  // typed without a quantity still rides along (they meant it), and a link-only
  // รายการ lands at ราคา 0 for staff to quote — which is exactly the flow the
  // "ทีมงานจะเปิดดูให้" link field promises.
  if (filled.length === 0) {
    const loose = it.opts.find((o) => o.color.trim() || o.size.trim());
    const entered = num(it.price);
    return [{
      ...base,
      color: loose?.color.trim() || undefined,
      size: loose?.size.trim() || undefined,
      price_cny: toYuanEquivalent(entered, it.currency, fxRates).yuan,
      amount: Math.min(fallbackQty(it), MAX_ORDER_QTY),
      input_price: entered,
    }];
  }

  return filled.map((o) => {
    const entered = manualRowPrice(it, o);
    return {
      ...base,
      color: o.color.trim() || undefined,
      size: o.size.trim() || undefined,
      // Preview value; the server re-derives ¥ from (input_currency, input_price).
      price_cny: toYuanEquivalent(entered, it.currency, fxRates).yuan,
      amount: Math.min(Math.floor(num(o.qty)), MAX_ORDER_QTY),
      input_price: entered,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// The form body — photo column + fields column (no tabs, no footer)
// ════════════════════════════════════════════════════════════════

export function ManualItemForm({
  item: cur,
  patch,
  currencyOptions,
  uploading,
  onPickPhoto,
}: {
  item: ManualItem;
  patch: (p: Partial<ManualItem>) => void;
  currencyOptions: string[];
  uploading: boolean;
  onPickPhoto: (f: File) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <PhotoPanel
        images={cur.images}
        uploading={uploading}
        onPick={onPickPhoto}
        onChange={(images) => patch({ images })}
      />

      <div className="min-w-0 space-y-3.5">
        <div>
          {/* owner 2026-08-03 "ทำ Badge ให้เข้าใจว่าติดต่อได้เด่นๆ กดแล้วไปไลน์" —
              this is the form people give up on, so the way out sits ON it rather
              than in a footer they never scroll to. LINE brand green so it reads
              as "chat with a human", not as another step of the form. */}
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-foreground">ข้อมูลสินค้า</p>
            <a
              href={LINE_OA.shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-sm transition hover:brightness-95"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2.4} />
              ใช้งานยาก? ให้เจ้าหน้าที่สั่งซื้อให้
            </a>
          </div>
          <input
            value={cur.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="กรอกชื่อสินค้าที่ต้องการสั่งซื้อ"
            className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>

        {/* Kept so a link we couldn't fetch still reaches the buying team —
            cartItemSchema.url carries it verbatim into tb_cart. */}
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-foreground">ลิงก์สินค้า (ถ้ามี)</label>
          <input
            type="url"
            inputMode="url"
            value={cur.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="วางลิงก์ร้านค้า ถ้ามี — ทีมงานจะเปิดดูให้"
            className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-foreground">
            ราคาต่อชิ้น <span className="text-red-600">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={cur.price}
              onChange={(e) => patch({ price: e.target.value })}
              placeholder="0.00"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <select
              value={cur.currency}
              onChange={(e) => patch({ currency: e.target.value })}
              aria-label="สกุลเงิน"
              className="h-11 shrink-0 rounded-xl border border-border bg-white px-3 text-[13.5px] font-semibold outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>{c === "CNY" ? "หยวน (CNY/RMB)" : c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── ตัวเลือกสินค้า — one row = one cart line ── */}
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-foreground">
            ตัวเลือกสินค้า{" "}
            <span className="font-medium text-muted">ไม่บังคับ — กรอกเมื่อต้องการแยกแบบหรือไซซ์</span>
          </p>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="bg-surface-alt text-[12px] font-bold text-muted">
                  <th className="px-2 py-2 text-center">แบบ / สี</th>
                  <th className="w-[22%] px-2 py-2 text-center">ไซซ์</th>
                  <th className="w-[18%] px-2 py-2 text-center">จำนวน</th>
                  <th className="w-[22%] px-2 py-2 text-center">ราคา/ชิ้น</th>
                  <th className="w-[44px] px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {cur.opts.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-1.5">
                      <input
                        value={o.color}
                        onChange={(e) => patch({ opts: cur.opts.map((x) => (x.id === o.id ? { ...x, color: e.target.value } : x)) })}
                        placeholder="เช่น สีดำ / รุ่น A"
                        className="h-9 w-full rounded-lg border border-border px-2 text-[13px] outline-none focus:border-red-500"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        value={o.size}
                        onChange={(e) => patch({ opts: cur.opts.map((x) => (x.id === o.id ? { ...x, size: e.target.value } : x)) })}
                        placeholder="เช่น XL"
                        className="h-9 w-full rounded-lg border border-border px-2 text-[13px] outline-none focus:border-red-500"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number" min="0" step="1" inputMode="numeric"
                        value={o.qty}
                        onChange={(e) => patch({ opts: cur.opts.map((x) => (x.id === o.id ? { ...x, qty: e.target.value } : x)) })}
                        placeholder="0"
                        className="h-9 w-full rounded-lg border border-border px-2 text-center text-[13px] outline-none focus:border-red-500"
                      />
                    </td>
                    <td className="p-1.5">
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={o.price}
                        onChange={(e) => patch({ opts: cur.opts.map((x) => (x.id === o.id ? { ...x, price: e.target.value } : x)) })}
                        placeholder={cur.price ? Number(cur.price).toFixed(2) : "0.00"}
                        title="เว้นว่างได้ = ใช้ราคาต่อชิ้นด้านบน"
                        className="h-9 w-full rounded-lg border border-border px-2 text-right text-[13px] outline-none focus:border-red-500"
                      />
                    </td>
                    <td className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          patch({ opts: cur.opts.length <= 1 ? [newManualOpt()] : cur.opts.filter((x) => x.id !== o.id) })
                        }
                        aria-label="ลบแถวนี้"
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => patch({ opts: [...cur.opts, newManualOpt()] })}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-red-300 py-2 text-[12.5px] font-bold text-primary-600 hover:bg-red-50"
            >
              <Plus className="h-4 w-4" /> เพิ่มแบบ / ไซซ์
            </button>
            <span className="text-[11.5px] text-muted">เพิ่มได้หลายแบบ หลายไซซ์ในสินค้าเดียว</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-foreground">ชื่อร้านค้า (ถ้ามี)</label>
            <input
              value={cur.shopName}
              onChange={(e) => patch({ shopName: e.target.value })}
              placeholder="กรอกชื่อร้านค้าหรือผู้ขาย"
              className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-bold text-foreground">จำนวนขั้นต่ำ (ถ้ามี)</label>
            <input
              type="number" min="0" step="1" inputMode="numeric"
              value={cur.minQty}
              onChange={(e) => patch({ minQty: e.target.value })}
              placeholder="0"
              className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-foreground">รายละเอียดสินค้า</label>
          <textarea
            value={cur.details}
            onChange={(e) => patch({ details: e.target.value })}
            rows={2}
            placeholder="ระบุขนาด วัสดุ รุ่น หรือรายละเอียดที่ต้องการ"
            className="w-full rounded-xl border border-border p-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-bold text-foreground">หมายเหตุถึงร้านค้า</label>
          <textarea
            value={cur.note}
            onChange={(e) => patch({ note: e.target.value })}
            rows={2}
            placeholder="เช่น ต้องการคละสี ติดโลโก้ หรือแพ็กแยก"
            className="w-full rounded-xl border border-border p-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>
    </div>
  );
}

// ── Photo panel — cover preview + thumbnail strip ───────────────────
// owner 2026-08-03 "ทำให้อัปไฟล์ภาพได้หลายภาพหน่อย และ ปรับให้มันแสดงผลให้ดีกว่านี้":
// the old single-slot version STRETCHED to the height of the fields column, so an
// empty รายการ showed a huge blank dashed box. It is now self-start with a square
// cover + a 5-slot strip, and the first photo is the cover (click a thumb to
// promote it) — which is the one that reaches tb_cart.cimages.
function PhotoPanel({
  images, uploading, onPick, onChange,
}: {
  images: string[];
  uploading: boolean;
  onPick: (f: File) => void;
  onChange: (images: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const full = images.length >= MAX_PHOTOS;
  const pickFiles = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).slice(0, MAX_PHOTOS - images.length).forEach(onPick);
  };

  return (
    <div className="self-start">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { pickFiles(e.target.files); e.target.value = ""; }}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pickFiles(e.dataTransfer.files); }}
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl text-center transition ${
          images[0]
            ? "border border-border bg-white"
            : `border-2 border-dashed p-4 ${drag ? "border-red-500 bg-red-50/60" : "border-red-200 bg-white"}`
        }`}
      >
        {images[0] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[0]} alt="รูปสินค้า" className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white">
              รูปหลัก
            </span>
            <button
              type="button"
              onClick={() => onChange(images.slice(1))}
              aria-label="ลบรูปหลัก"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div>
            <span className="mx-auto mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-primary-500">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Package className="h-6 w-6" />}
            </span>
            <p className="text-[14px] font-bold text-foreground">
              {uploading ? "กำลังอัปโหลด…" : "อัปโหลดรูปสินค้า"}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">ลากรูปมาวาง หรือเลือกจากอุปกรณ์</p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-primary-500 px-5 py-2.5 text-[13px] font-bold text-primary-600 transition hover:bg-red-50 disabled:opacity-40"
            >
              <ImagePlus className="h-4 w-4" /> เลือกรูปสินค้า
            </button>
          </div>
        )}
      </div>

      {/* Slot strip — filled thumbs first, then one "+" while there is room. */}
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const src = images[i];
          if (src) {
            return (
              <div key={src + i} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([src, ...images.filter((_, k) => k !== i)])}
                    title="ตั้งเป็นรูปหลัก"
                    className="absolute inset-0 bg-black/0 transition group-hover:bg-black/30"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, k) => k !== i))}
                  aria-label={`ลบรูปที่ ${i + 1}`}
                  className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          }
          const isNext = i === images.length;
          return (
            <button
              key={"slot" + i}
              type="button"
              disabled={!isNext || full || uploading}
              onClick={() => inputRef.current?.click()}
              aria-label="เพิ่มรูป"
              className={`flex aspect-square items-center justify-center rounded-lg border border-dashed transition ${
                isNext && !uploading
                  ? "border-red-300 text-primary-500 hover:bg-red-50"
                  : "border-border text-gray-300"
              }`}
            >
              {isNext && uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[11.5px] text-muted">
        {images.length > 0 ? `${images.length}/${MAX_PHOTOS} รูป · ` : ""}JPG, PNG ไม่เกิน 10 MB
      </p>
      {images.length > 1 && (
        <p className="mt-1 text-center text-[11px] text-muted">กดรูปเล็กเพื่อตั้งเป็นรูปหลัก</p>
      )}
    </div>
  );
}

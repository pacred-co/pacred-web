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
import { ImagePlus, Loader2, Package, Plus, Trash2, X } from "lucide-react";
import { toYuanEquivalent } from "@/lib/forwarder/currency-convert";
import { MAX_ORDER_QTY } from "@/lib/validators/order-qty";
import type { CartItemBulkRow } from "@/actions/cart";

/** tb_cart.cdetails ceiling enforced by productDetailsField() — stay under it. */
const DETAILS_MAX = 1000;

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
  imageUrl: string;
  /** The shop link, when the customer HAD one we just couldn't fetch. */
  url: string;
  opts: OptRow[];
};

let SEQ = 1;
export const newManualOpt = (): OptRow => ({ id: SEQ++, color: "", size: "", qty: "", price: "" });
export const newManualItem = (url = ""): ManualItem => ({
  id: SEQ++, title: "", price: "", currency: "CNY", shopName: "", minQty: "",
  details: "", note: "", imageUrl: "", url, opts: [newManualOpt()],
});

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Rows the customer actually filled in (a blank spare row is not an order). */
export function manualFilledOpts(it: ManualItem) {
  return it.opts.filter((o) => num(o.qty) > 0);
}
/** The mockup's own rule: ชื่อสินค้า + ราคา + ตัวเลือกอย่างน้อย 1 รายการ. */
export function isManualComplete(it: ManualItem) {
  return it.title.trim() !== "" && num(it.price) > 0 && manualFilledOpts(it).length > 0;
}
/** Price for one variant row — its own overrides the item's base price. */
export function manualRowPrice(it: ManualItem, o: OptRow) {
  return o.price.trim() !== "" ? num(o.price) : num(it.price);
}

/** Baht estimate — mirrors the server: each row converts its OWN price to ¥. */
export function manualItemThb(it: ManualItem, fxRates: Record<string, number>, rsDefault: number) {
  return (
    manualFilledOpts(it).reduce(
      (s, o) => s + toYuanEquivalent(manualRowPrice(it, o), it.currency, fxRates).yuan * num(o.qty),
      0,
    ) * rsDefault
  );
}

/** One แบบ/ไซซ์ row = one tb_cart row (the shape the SKU picker already uses). */
export function manualItemToCartRows(
  it: ManualItem,
  fxRates: Record<string, number>,
): CartItemBulkRow[] {
  // Fields tb_cart has no column for are folded into cdetails with a label so
  // the buying team still sees them (the legacy model has no variant sidecar).
  const extra = [
    it.details.trim() && `รายละเอียด: ${it.details.trim()}`,
    it.note.trim() && `หมายเหตุถึงร้าน: ${it.note.trim()}`,
    num(it.minQty) > 0 && `ขั้นต่ำ: ${num(it.minQty)} ชิ้น`,
  ].filter(Boolean).join(" · ").slice(0, DETAILS_MAX);

  return manualFilledOpts(it).map((o) => {
    const entered = manualRowPrice(it, o);
    return {
      provider: "shop" as const,
      shop_name: it.shopName.trim() || "pacred",
      title: it.title.trim(),
      url: it.url.trim() || undefined,
      image_path: it.imageUrl || undefined,
      color: o.color.trim() || undefined,
      size: o.size.trim() || undefined,
      // Preview value; the server re-derives ¥ from (input_currency, input_price).
      price_cny: toYuanEquivalent(entered, it.currency, fxRates).yuan,
      amount: Math.min(Math.floor(num(o.qty)), MAX_ORDER_QTY),
      details: extra || undefined,
      input_currency: it.currency,
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
        item={cur}
        uploading={uploading}
        onPick={onPickPhoto}
        onClear={() => patch({ imageUrl: "" })}
      />

      <div className="min-w-0 space-y-3.5">
        <div>
          <p className="mb-1.5 text-[13px] font-bold text-foreground">ข้อมูลสินค้า</p>
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
            <span className="font-medium text-muted">กรอกแยกแต่ละแบบหรือไซซ์ที่ต้องการ</span>
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

// ── Photo panel — dashed dropzone / preview ─────────────────────────
function PhotoPanel({
  item, uploading, onPick, onClear,
}: {
  item: ManualItem;
  uploading: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition ${
        drag ? "border-red-500 bg-red-50/60" : "border-red-200 bg-white"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = ""; // allow re-picking the same file
        }}
      />

      {item.imageUrl ? (
        <div className="w-full">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt="รูปสินค้า"
              className="aspect-square w-full rounded-xl border border-border object-cover"
            />
            <button
              type="button"
              onClick={onClear}
              aria-label="ลบรูปนี้"
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[12.5px] font-bold text-muted hover:border-red-300 hover:text-primary-600"
          >
            <ImagePlus className="h-4 w-4" /> เปลี่ยนรูป
          </button>
        </div>
      ) : (
        <>
          <span className="mb-2 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-primary-500">
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Package className="h-7 w-7" />}
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
          <p className="mt-3 text-[11.5px] text-muted">JPG, PNG ไม่เกิน 10 MB</p>
        </>
      )}
    </div>
  );
}

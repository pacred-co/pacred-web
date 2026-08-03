"use client";

/**
 * "เพิ่มสินค้าด้วยตัวเอง" — the no-link entry form (owner 2026-08-03 mockup).
 *
 * Shares the with-link review page's shell on purpose (owner: "ใช้หน้าแบบมีลิงก์
 * แหละ แต่เป็นฟอร์มเปล่า"): the same รายการที่ N segmented tabs welded to the card,
 * the same 2-column card, the same centred column width. What changes is the
 * SOURCE of the data — a photo the customer uploads plus fields they type,
 * instead of a marketplace API response.
 *
 * Money path is the SHARED `addCartItemsBulk` → tb_cart (the exact call the
 * link-paste picker makes). One แบบ/ไซซ์ row = one cart row, which is already how
 * the SKU picker folds variants, so nothing downstream needs to learn a new shape.
 * Price is entered in ANY currency and the SERVER re-derives the ¥ value from
 * customs.fx_rates — the client number below is a preview only.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  BadgeCheck, ClipboardList, ImagePlus, Info, Loader2, Package, PackageSearch,
  Plus, RotateCcw, Save, ShieldCheck, ShoppingCart, Trash2, Users, X,
} from "lucide-react";
import { addCartItemsBulk, type CartItemBulkRow } from "@/actions/cart";
import { uploadCartProductImage } from "@/actions/cart-manual-image";
import { toYuanEquivalent } from "@/lib/forwarder/currency-convert";
import { MAX_ORDER_QTY } from "@/lib/validators/order-qty";

const DRAFT_KEY = "pacred_cart_manual_draft";
const MAX_ITEMS = 20;
/** tb_cart.cdetails ceiling enforced by productDetailsField() — stay under it. */
const DETAILS_MAX = 1000;

type OptRow = { id: number; color: string; size: string; qty: string; price: string };
type Item = {
  id: number;
  title: string;
  price: string;
  currency: string;
  shopName: string;
  minQty: string;
  details: string;
  note: string;
  imageUrl: string;
  opts: OptRow[];
};

let SEQ = 1;
const newOpt = (): OptRow => ({ id: SEQ++, color: "", size: "", qty: "", price: "" });
const newItem = (): Item => ({
  id: SEQ++, title: "", price: "", currency: "CNY", shopName: "", minQty: "",
  details: "", note: "", imageUrl: "", opts: [newOpt()],
});

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rows the customer actually filled in (a blank spare row is not an order). */
function filledOpts(it: Item) {
  return it.opts.filter((o) => num(o.qty) > 0);
}
/** The mockup's own rule: ชื่อสินค้า + ราคา + ตัวเลือกอย่างน้อย 1 รายการ. */
function isComplete(it: Item) {
  return it.title.trim() !== "" && num(it.price) > 0 && filledOpts(it).length > 0;
}
/** Price for one variant row — its own overrides the item's base price. */
function rowPrice(it: Item, o: OptRow) {
  return o.price.trim() !== "" ? num(o.price) : num(it.price);
}

export function ManualEntryClient({
  rsDefault,
  fxRates,
}: {
  rsDefault: number;
  fxRates: Record<string, number>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currencyOptions = useMemo(() => {
    const keys = ["CNY", "THB", ...Object.keys(fxRates ?? {})];
    return Array.from(new Set(keys.map((k) => k.toUpperCase())));
  }, [fxRates]);

  // ── Draft (localStorage) — "บันทึกฉบับร่าง" in the mockup. There is no draft
  //    table in this system, and inventing one would put half-typed rows into the
  //    money tables; the browser keeps them until the customer is ready to add.
  //    Restore is OFFERED, not applied: a draft appearing by itself would
  //    silently overwrite a form the customer just started typing, and the
  //    read happens on the client only (no SSR/hydration divergence).
  const [hasDraft, setHasDraft] = useState(false);
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    let found = false;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const parsed = raw ? (JSON.parse(raw) as Item[]) : null;
      found = Array.isArray(parsed) && parsed.length > 0;
    } catch {
      found = false; // corrupt draft — start clean rather than block the page
    }
    setHasDraft(found);
  }, []);

  function restoreDraft() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "[]") as Item[];
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      // Re-key ids so the running SEQ can never collide with a restored one.
      setItems(parsed.slice(0, MAX_ITEMS).map((it) => ({
        ...newItem(), ...it, id: SEQ++,
        opts: (it.opts?.length ? it.opts : [newOpt()]).map((o) => ({ ...newOpt(), ...o, id: SEQ++ })),
      })));
      setActive(0);
      setHasDraft(false);
      setDraftNote("กู้ฉบับร่างที่บันทึกไว้แล้ว");
    } catch {
      setErr("ฉบับร่างเสียหาย เปิดกู้คืนไม่ได้");
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(items));
      setDraftNote("บันทึกฉบับร่างแล้ว — กลับมากรอกต่อได้ในเครื่องนี้");
      setHasDraft(false);
      setErr(null);
    } catch {
      setErr("บันทึกฉบับร่างไม่สำเร็จ (พื้นที่เก็บของเบราว์เซอร์เต็ม)");
    }
  }

  // ── Item / row editing ────────────────────────────────────────────
  const patch = (id: number, p: Partial<Item>) => {
    setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...p } : it)));
    setErr(null);
    setDraftNote(null);
  };
  const patchOpt = (itemId: number, optId: number, p: Partial<OptRow>) =>
    setItems((xs) =>
      xs.map((it) =>
        it.id === itemId
          ? { ...it, opts: it.opts.map((o) => (o.id === optId ? { ...o, ...p } : o)) }
          : it,
      ),
    );

  function addItem() {
    if (items.length >= MAX_ITEMS) return;
    setItems((xs) => [...xs, newItem()]);
    setActive(items.length);
    setErr(null);
  }
  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems((xs) => xs.filter((_, i) => i !== idx));
    setActive((a) => (a >= idx && a > 0 ? a - 1 : a));
  }

  // ── Photo ─────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState<number | null>(null);
  async function pickPhoto(itemId: number, file: File) {
    setUploading(itemId);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await uploadCartProductImage(fd);
      if (res.ok) patch(itemId, { imageUrl: res.url });
      else setErr(res.error);
    } catch {
      setErr("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploading(null);
    }
  }

  // ── Totals — mirrors the server: each row converts its OWN price to ¥. ──
  const totalThb = useMemo(
    () =>
      items.reduce(
        (sum, it) =>
          sum +
          filledOpts(it).reduce(
            (s, o) =>
              s + toYuanEquivalent(rowPrice(it, o), it.currency, fxRates).yuan * num(o.qty),
            0,
          ),
        0,
      ) * rsDefault,
    [items, fxRates, rsDefault],
  );
  const readyCount = items.filter(isComplete).length;

  // ── Submit → cart ─────────────────────────────────────────────────
  function submit() {
    const ready = items.filter(isComplete);
    if (ready.length === 0) {
      setErr("กรุณากรอกชื่อสินค้า ราคา และตัวเลือกอย่างน้อย 1 รายการก่อนครับ");
      return;
    }
    const rows: CartItemBulkRow[] = [];
    for (const it of ready) {
      // Fields tb_cart has no column for are folded into cdetails with a label so
      // the buying team still sees them (the legacy model has no variant sidecar).
      const extra = [
        it.details.trim() && `รายละเอียด: ${it.details.trim()}`,
        it.note.trim() && `หมายเหตุถึงร้าน: ${it.note.trim()}`,
        num(it.minQty) > 0 && `ขั้นต่ำ: ${num(it.minQty)} ชิ้น`,
      ].filter(Boolean).join(" · ").slice(0, DETAILS_MAX);

      for (const o of filledOpts(it)) {
        const qty = Math.min(Math.floor(num(o.qty)), MAX_ORDER_QTY);
        const entered = rowPrice(it, o);
        rows.push({
          provider: "shop",
          shop_name: it.shopName.trim() || "pacred",
          title: it.title.trim(),
          image_path: it.imageUrl || undefined,
          color: o.color.trim() || undefined,
          size: o.size.trim() || undefined,
          // Preview value; the server re-derives ¥ from (input_currency, input_price).
          price_cny: toYuanEquivalent(entered, it.currency, fxRates).yuan,
          amount: qty,
          details: extra || undefined,
          input_currency: it.currency,
          input_price: entered,
        });
      }
    }
    if (rows.length === 0) {
      setErr("ยังไม่มีตัวเลือกที่ระบุจำนวน กรุณากรอกจำนวนอย่างน้อย 1 แถว");
      return;
    }
    startTransition(async () => {
      const res = await addCartItemsBulk(rows);
      if (!res.ok) {
        setErr(res.error ?? "เพิ่มลงรถเข็นไม่สำเร็จ");
        return;
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push("/cart");
    });
  }

  const cur = items[active] ?? items[0];

  // ════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* ── Page head ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground md:text-2xl">เพิ่มสินค้าด้วยตัวเอง</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">
            สำหรับสินค้าที่ไม่มีลิงก์ กรุณากรอกข้อมูลสินค้าให้ครบถ้วน
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3.5 py-2 text-[12.5px] font-bold text-primary-700">
          <ClipboardList className="h-4 w-4" /> สินค้า {items.length} รายการ
        </span>
      </div>

      {hasDraft && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <RotateCcw className="h-4 w-4 shrink-0" />
          <span className="font-medium">มีฉบับร่างที่บันทึกไว้ในเครื่องนี้</span>
          <button
            type="button"
            onClick={restoreDraft}
            className="ml-auto rounded-full bg-amber-600 px-4 py-1.5 text-[12.5px] font-bold text-white hover:bg-amber-700"
          >
            กู้คืนฉบับร่าง
          </button>
          <button
            type="button"
            onClick={() => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } setHasDraft(false); }}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-amber-800 hover:bg-amber-100"
          >
            ทิ้งฉบับร่าง
          </button>
        </div>
      )}

      {/* ── Tabs welded to the card (same idiom as /cart/add/review) ── */}
      <div className="mb-0 flex flex-wrap items-end gap-3">
        <div className="inline-flex translate-y-px overflow-hidden rounded-t-2xl border border-b-0 border-border">
          {items.map((it, i) => {
            const isActive = i === active;
            const done = isComplete(it);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setActive(i)}
                className={`relative inline-flex flex-col items-center gap-0.5 px-5 py-2 text-center transition ${
                  i > 0 ? "border-l border-border" : ""
                } ${isActive ? "bg-white" : "border-b border-border bg-surface-alt hover:bg-white"}`}
              >
                {isActive && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary-600" />}
                <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${isActive ? "text-foreground" : "text-muted"}`}>
                  รายการที่ {i + 1}
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${done ? "bg-emerald-500" : "bg-red-500"}`} />
                </span>
                <span className="text-[11px] font-medium text-muted">{done ? "ครบแล้ว" : "ยังไม่ครบ"}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= MAX_ITEMS}
          className="mb-1.5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-500 px-4 py-2 text-[12.5px] font-bold text-primary-600 transition hover:bg-red-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> เพิ่มรายการ
        </button>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => removeItem(active)}
            className="mb-1.5 ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-muted transition hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" /> ลบรายการนี้
          </button>
        )}
      </div>

      {/* ── The card ── */}
      <div className="rounded-2xl rounded-tl-none border border-border bg-white p-3 md:p-4">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
          {/* Photo */}
          <PhotoPanel
            item={cur}
            uploading={uploading === cur.id}
            onPick={(f) => pickPhoto(cur.id, f)}
            onClear={() => patch(cur.id, { imageUrl: "" })}
          />

          {/* Fields */}
          <div className="min-w-0 space-y-3.5">
            <div>
              <p className="mb-1.5 text-[13px] font-bold text-foreground">ข้อมูลสินค้า</p>
              <input
                value={cur.title}
                onChange={(e) => patch(cur.id, { title: e.target.value })}
                placeholder="กรอกชื่อสินค้าที่ต้องการสั่งซื้อ"
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
                  onChange={(e) => patch(cur.id, { price: e.target.value })}
                  placeholder="0.00"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <select
                  value={cur.currency}
                  onChange={(e) => patch(cur.id, { currency: e.target.value })}
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
                            onChange={(e) => patchOpt(cur.id, o.id, { color: e.target.value })}
                            placeholder="เช่น สีดำ / รุ่น A"
                            className="h-9 w-full rounded-lg border border-border px-2 text-[13px] outline-none focus:border-red-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            value={o.size}
                            onChange={(e) => patchOpt(cur.id, o.id, { size: e.target.value })}
                            placeholder="เช่น XL"
                            className="h-9 w-full rounded-lg border border-border px-2 text-[13px] outline-none focus:border-red-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number" min="0" step="1" inputMode="numeric"
                            value={o.qty}
                            onChange={(e) => patchOpt(cur.id, o.id, { qty: e.target.value })}
                            placeholder="0"
                            className="h-9 w-full rounded-lg border border-border px-2 text-center text-[13px] outline-none focus:border-red-500"
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number" min="0" step="0.01" inputMode="decimal"
                            value={o.price}
                            onChange={(e) => patchOpt(cur.id, o.id, { price: e.target.value })}
                            placeholder={cur.price ? Number(cur.price).toFixed(2) : "0.00"}
                            title="เว้นว่างได้ = ใช้ราคาต่อชิ้นด้านบน"
                            className="h-9 w-full rounded-lg border border-border px-2 text-right text-[13px] outline-none focus:border-red-500"
                          />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              patch(cur.id, {
                                opts: cur.opts.length <= 1 ? [newOpt()] : cur.opts.filter((x) => x.id !== o.id),
                              })
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
                  onClick={() => patch(cur.id, { opts: [...cur.opts, newOpt()] })}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-red-300 py-2 text-[12.5px] font-bold text-primary-600 hover:bg-red-50"
                >
                  <Plus className="h-4 w-4" /> เพิ่มแบบ / ไซซ์
                </button>
                <span className="text-[11.5px] text-muted">เพิ่มได้หลายแบบ หลายไซซ์ในสินค้าเดียว</span>
              </div>
            </div>

            {/* shop + min qty */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-foreground">ชื่อร้านค้า (ถ้ามี)</label>
                <input
                  value={cur.shopName}
                  onChange={(e) => patch(cur.id, { shopName: e.target.value })}
                  placeholder="กรอกชื่อร้านค้าหรือผู้ขาย"
                  className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-bold text-foreground">จำนวนขั้นต่ำ (ถ้ามี)</label>
                <input
                  type="number" min="0" step="1" inputMode="numeric"
                  value={cur.minQty}
                  onChange={(e) => patch(cur.id, { minQty: e.target.value })}
                  placeholder="0"
                  className="h-11 w-full rounded-xl border border-border px-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-bold text-foreground">รายละเอียดสินค้า</label>
              <textarea
                value={cur.details}
                onChange={(e) => patch(cur.id, { details: e.target.value })}
                rows={2}
                placeholder="ระบุขนาด วัสดุ รุ่น หรือรายละเอียดที่ต้องการ"
                className="w-full rounded-xl border border-border p-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-bold text-foreground">หมายเหตุถึงร้านค้า</label>
              <textarea
                value={cur.note}
                onChange={(e) => patch(cur.id, { note: e.target.value })}
                rows={2}
                placeholder="เช่น ต้องการคละสี ติดโลโก้ หรือแพ็กแยก"
                className="w-full rounded-xl border border-border p-3 text-[14px] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <p className="flex items-start gap-1.5 text-[12px] text-muted">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              กรอกชื่อสินค้า ราคา และเพิ่มตัวเลือกอย่างน้อย 1 รายการ
            </p>
          </div>
        </div>
      </div>

      {(err || draftNote) && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-[13px] font-medium ${
            err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {err ?? draftNote}
        </div>
      )}

      {/* ── Bottom summary bar ── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-border bg-white px-4 py-3.5">
        <div>
          <p className="text-[14px] font-bold text-foreground">ทั้งหมด {items.length} รายการ</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <span className={`inline-block h-2 w-2 rounded-full ${readyCount > 0 ? "bg-emerald-500" : "bg-red-500"}`} />
            กรอกครบแล้ว {readyCount} / {items.length}
          </p>
        </div>
        <div className="border-l border-border pl-6">
          <p className="text-[12px] text-muted">ยอดรวมโดยประมาณ</p>
          <p className="text-2xl font-extrabold leading-tight text-primary-600">
            {fmt2(totalThb)} <span className="text-[13px] font-bold text-muted">บาท</span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={readyCount === 0 || pending}
            className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-6 py-3 text-[14px] font-extrabold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            {pending ? "กำลังเพิ่ม…" : readyCount === 0 ? "กรอกข้อมูลให้ครบก่อน" : `เพิ่มลงรถเข็น ${readyCount} รายการ`}
          </button>
          <button
            type="button"
            onClick={saveDraft}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary-500 px-5 py-3 text-[13.5px] font-bold text-primary-600 transition hover:bg-red-50"
          >
            <Save className="h-4 w-4" /> บันทึกฉบับร่าง
          </button>
        </div>
      </div>

      {/* ── Trust strip ── */}
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 pt-1 text-[12.5px] text-muted">
        {[
          { icon: <ShieldCheck className="h-4 w-4 text-primary-600" />, label: "สั่งซื้อจากจีน สั่งได้โดยตรงในที่เดียว" },
          { icon: <BadgeCheck className="h-4 w-4" />, label: "ตรวจสอบก่อนชำระ" },
          { icon: <Users className="h-4 w-4" />, label: "มีทีมงานช่วยเหลือ" },
          { icon: <PackageSearch className="h-4 w-4" />, label: "ติดตามสถานะได้" },
        ].map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5">
            {x.icon} {x.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Photo panel — dashed dropzone / preview ─────────────────────────
function PhotoPanel({
  item, uploading, onPick, onClear,
}: {
  item: Item;
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

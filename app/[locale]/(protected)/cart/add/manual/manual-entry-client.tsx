"use client";

/**
 * "เพิ่มสินค้าด้วยตัวเอง" — the standalone no-link page (owner 2026-08-03 mockup).
 *
 * Shares the with-link review page's shell on purpose (owner: "ใช้หน้าแบบมีลิงก์
 * แหละ แต่เป็นฟอร์มเปล่า"): the same รายการที่ N segmented tabs welded to the card,
 * the same 2-column card, the same centred column width. What changes is the
 * SOURCE of the data — a photo the customer uploads plus fields they type,
 * instead of a marketplace API response.
 *
 * The per-รายการ form + its money helpers live in ./manual-item so the review
 * page can host the SAME form as a "กรอกเอง" tab. This file owns only the page
 * chrome: tabs · totals · submit. Both flows END THE SAME WAY — เพิ่มลงรถเข็น →
 * /cart (owner 2026-08-03 "ปลายทาง คือ ไปหน้าใส่ตระกร้า เหมือนกันกับมีลิงก์เลย").
 *
 * Money path is the SHARED `addCartItemsBulk` → tb_cart (the exact call the
 * link-paste picker makes). Price is entered in ANY currency and the SERVER
 * re-derives the ¥ value — the client number below is a preview only.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft, BadgeCheck, Info, Loader2, PackageSearch, Plus,
  Check, MessageCircle, ShieldCheck, ShoppingCart, Users, X,
} from "lucide-react";
import { notifyCartChanged } from "@/lib/cart-changed-event";
import { addCartItemsBulk, type CartItemBulkRow } from "@/actions/cart";
import { uploadCartProductImage } from "@/actions/cart-manual-image";
import { LINE_OA } from "@/components/seo/site";
import {
  takeManualLinks, useStoredOriginCountry, originCountry, DEFAULT_ORIGIN,
} from "../link-source";
import {
  ManualItemForm, isManualComplete, manualItemThb, manualItemToCartRows,
  MAX_PHOTOS, newManualItem, type ManualItem,
} from "./manual-item";

const MAX_ITEMS = 20;

const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ManualEntryClient({
  rsDefault,
  fxRates,
}: {
  rsDefault: number;
  fxRates: Record<string, number>;
}) {
  const [items, setItems] = useState<ManualItem[]>([newManualItem()]);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  /**
   * รายการ already in tb_cart — the ✓ badge (owner 2026-08-03 "ถ้าเพิ่มแล้ว
   * ให้ขึ้นมุมเป็น checkmark จะได้รู้ว่าเพิ่มแล้ว"). Clears the moment that
   * รายการ is edited, so the ✓ never claims something the cart does not hold.
   */
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  const currencyOptions = useMemo(() => {
    const keys = ["CNY", "THB", ...Object.keys(fxRates ?? {})];
    return Array.from(new Set(keys.map((k) => k.toUpperCase())));
  }, [fxRates]);

  // Links handed over from /cart/add because we have no API for that shop
  // (owner 2026-08-03) — one รายการ each, link already filled so the customer
  // never re-copies it. Consumed, so a refresh won't re-add them.
  const probed = useRef(false);
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    const carried = takeManualLinks();
    setItems((prev) => (carried.length > 0 ? carried.map((u) => newManualItem(u)) : prev));
  }, []);

  // ประเทศต้นทางที่เลือกไว้บน /cart/add (owner 2026-08-04) — read-not-consume, so a
  // refresh of this form keeps it. Rides into tb_cart.cdetails when it is not จีน.
  const origin = useStoredOriginCountry();
  const country = originCountry(origin);
  const originForRows = origin === DEFAULT_ORIGIN ? undefined : country.label;

  // ── Item editing ──────────────────────────────────────────────────
  const patch = (id: number, p: Partial<ManualItem>) => {
    setItems((xs) => xs.map((it) => (it.id === id ? { ...it, ...p } : it)));
    setAddedIds((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setErr(null);
  };

  function addItem() {
    if (items.length >= MAX_ITEMS) return;
    setItems((xs) => [...xs, newManualItem()]);
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
      if (res.ok) setItems((xs) => xs.map((it) => (it.id === itemId ? { ...it, images: [...it.images, res.url].slice(0, MAX_PHOTOS) } : it)));
      else setErr(res.error);
    } catch {
      setErr("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setUploading(null);
    }
  }

  // ── Add ONE รายการ → cart ─────────────────────────────────────────
  // Per-รายการ, exactly like the review page tab (owner 2026-08-03 "ให้เหลือแค่
  // ปุ่มแดงอันเดียว แล้วยกไปไว้ในกรอบเดียวกัน"): the button lives INSIDE the card it
  // belongs to, so what it adds is the รายการ on screen — the old bottom bar
  // added every complete tab at once, which is not what a button under one form
  // reads as.
  function addToCart(it: ManualItem) {
    if (!isManualComplete(it)) {
      setErr("กรุณาวางลิงก์ร้านค้า หรือกรอกชื่อสินค้าพร้อมราคา อย่างน้อย 1 อย่างครับ");
      return;
    }
    const rows: CartItemBulkRow[] = manualItemToCartRows(it, fxRates, originForRows);
    startTransition(async () => {
      const res = await addCartItemsBulk(rows);
      if (!res.ok) {
        setErr(res.error ?? "เพิ่มลงรถเข็นไม่สำเร็จ");
        return;
      }
      notifyCartChanged();
      setAddedIds((prev) => new Set(prev).add(it.id));
      setErr(null);
    });
  }

  const cur = items[active] ?? items[0];

  // ════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* ── Page head ──
          ลิงก์ย้อนกลับอยู่ "แถวเดียวกัน" กับหัวข้อ (owner 2026-08-04 "เอามาอยู่แถว
          เดียวกันกับหัว เพิ่มสินค้าด้วยตนเอง แล้วขยับทั้งหน้าขึ้นไป") — เดิมกินบรรทัด
          ของตัวเองแล้วดันทั้งหน้าลงมา ~28px. ยังเป็นทางกลับไปหน้าวางลิงก์เหมือนเดิม
          (owner 2026-08-03 "ทำให้มีปุ่มกลับไปหน้าเพิ่มลิงก์หน่อย") ไม่ได้หายไปไหน. */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">เพิ่มสินค้าด้วยตัวเอง</h1>
          {/* ประเทศที่เลือกไว้หน้าก่อน — โชว์ให้ลูกค้าเห็นว่าติดมาด้วยจริง (ไม่ใช่กดแล้วหาย)
              และค่านี้จะไปอยู่ในรายละเอียดสินค้าให้ทีมจัดซื้อเห็นด้วย. */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-[12px] font-bold text-foreground">
            <span className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/legacy/pcs/assets/fonts/flag-icon-css/flags/1x1/${country.code}.svg`} alt="" className="h-full w-full object-cover" />
            </span>
            สั่งจาก{country.label}
          </span>
          </div>
          {/* ทางกลับไปหน้าวางลิงก์ — ชิดขวาสุดของแถวหัวข้อ (owner 2026-08-04
              "เอาไปไว้ด้านขวา เอาเพิ่มสินค้าด้วยตัวเองไปอยู่ซ้ายเหมือนเดิม") */}
          <Link
            href="/cart/add"
            className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-bold text-muted hover:text-primary-600"
          >
            <ArrowLeft className="h-4 w-4" /> กลับไปหน้าเพิ่มลิงก์สินค้า
          </Link>
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          สำหรับสินค้าที่ไม่มีลิงก์ กรุณากรอกข้อมูลสินค้าให้ครบถ้วน
        </p>
      </div>

      {/* ── Tabs welded to the card (same idiom as /cart/add/review) ── */}
      <div className="mb-0 flex flex-wrap items-end gap-3">
        <div className="inline-flex translate-y-px overflow-hidden rounded-t-2xl border border-b-0 border-border">
          {items.map((it, i) => {
            const isActive = i === active;
            const done = isManualComplete(it);
            const added = addedIds.has(it.id);
            const closable = items.length > 1;
            // Same cell shape as /cart/add/review (owner 2026-08-03 "อยากได้
            // กากบาทลบได้เลย เหมือนกับฟอร์มมีลิงก์") — the cell carries the
            // borders + fill so the ✕ can live inside it; a <button> may not be
            // nested in a <button>.
            return (
              <div
                key={it.id}
                className={`relative inline-flex ${i > 0 ? "border-l border-border" : ""} ${
                  isActive ? "bg-white" : "border-b border-border bg-surface-alt hover:bg-white"
                }`}
              >
                {isActive && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary-600" />}
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
                  <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${isActive ? "text-foreground" : "text-muted"}`}>
                    รายการที่ {i + 1}
                    <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${added || done ? "bg-emerald-500" : "bg-red-500"}`} />
                  </span>
                  <span className="text-[11px] font-medium text-muted">
                    {added ? "เพิ่มลงรถเข็นแล้ว" : done ? "ครบแล้ว" : "ยังไม่ครบ"}
                  </span>
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
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= MAX_ITEMS}
          className="mb-1.5 inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary-500 px-4 py-2 text-[12.5px] font-bold text-primary-600 transition hover:bg-red-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> เพิ่มรายการ
        </button>

        {/* ป้ายไลน์กลับมาแล้ว แต่ย้ายมาปักมุมขวาบนของการ์ด (owner 2026-08-04
            "เอา badge เขียว ... กลับมา แปะไว้มุมขวาบนเลย จะได้สวยพอดีๆ") — เดิมอยู่
            เหนือช่อง "ข้อมูลสินค้า" ในฟอร์ม ทำให้แถวหัวข้อสูงกว่าช่องข้างๆ สองคอลัมน์
            เลยไม่เท่ากัน. ml-auto = ดันไปสุดขวาของแถวแท็บ. */}
        <a
          href={LINE_OA.shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1.5 ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-3.5 py-2 text-[12px] font-bold text-white shadow-sm transition hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.4} />
          ใช้งานยาก? ให้เจ้าหน้าที่สั่งซื้อให้
        </a>
      </div>

      {/* ── The card — form + its own หยิบใส่รถเข็น (one red button, inside) ──
          `@container` = ให้ <ManualItemForm> จัดคอลัมน์ตามความกว้าง "การ์ดใบนี้"
          ไม่ใช่ความกว้างจอ (หน้านี้มีแบนเนอร์ 400px กินที่ทางขวา). */}
      <div className="pcs-item-form rounded-2xl rounded-tl-none border border-border bg-white p-3 md:p-4">
        <ManualItemForm
          item={cur}
          patch={(p) => patch(cur.id, p)}
          currencyOptions={currencyOptions}
          uploading={uploading === cur.id}
          onPickPhoto={(f) => pickPhoto(cur.id, f)}
        />
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          วางลิงก์ร้านค้า หรือกรอกชื่อสินค้า + ราคา อย่างใดอย่างหนึ่งก็เพิ่มลงรถเข็นได้เลย
        </p>

        <div className="mt-4 border-t border-border pt-3">
          {addedIds.has(cur.id) ? (
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
              onClick={() => addToCart(cur)}
              disabled={!isManualComplete(cur) || pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 py-3 text-[15px] font-extrabold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
              {pending ? "กำลังเพิ่ม…" : isManualComplete(cur) ? "หยิบใส่รถเข็น" : "กรอกข้อมูลให้ครบก่อน"}
            </button>
          )}
          <p className="mt-2 text-center text-[12.5px] text-muted">
            ยอดรวมโดยประมาณ{" "}
            <b className="text-primary-600">{fmt2(manualItemThb(cur, fxRates, rsDefault))}</b> บาท
          </p>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">
          {err}
        </div>
      )}


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

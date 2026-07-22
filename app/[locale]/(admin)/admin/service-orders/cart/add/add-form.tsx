"use client";

/**
 * Admin add-item-to-cart form — client island.
 *
 * Wave 23 P1 #11.c (2026-05-27 ค่ำ · Agent E): Tailwind form-input
 * rewrite. Field set + Server Action signature + FormData keys are
 * UNCHANGED from the prior Bootstrap-4 island — preserves contract
 * with `adminAddItemToCart` (actions/admin/cart) + the Zod schema
 * in lib/validators/admin-cart (ADMIN_CART_PROVIDERS).
 *
 * Field set (preserved · same FormData keys):
 *   - userid     เจ้าของรถเข็น (PR<n> · เว้นว่าง = admin's own)
 *   - cURL       ลิงค์หรือชื่อสินค้า          (required)
 *   - cTitle     ชื่อย่อสินค้า                (optional)
 *   - cNameShop  ชื่อร้าน                     (default "pcs")
 *   - cProvider  ผู้ขาย (1=1688 .. 5=Nice)   (default "4" Shops)
 *   - cImages    URL รูปภาพ                  (optional)
 *   - cDetails   หมายเหตุ                     (required)
 *   - cColor     สี/แบบ                       (optional)
 *   - cSize      ขนาด                         (optional)
 *   - cPrice     ราคา ¥                       (required · > 0)
 *   - cAmount    จำนวน                        (required · >= 1)
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAddItemToCart } from "@/actions/admin/cart";
import { ADMIN_CART_PROVIDERS } from "@/lib/validators/admin-cart";
import { PRODUCT_TEXT_MAX } from "@/lib/validators/product-text";
import { toYuanEquivalent } from "@/lib/forwarder/currency-convert";

type Props = {
  /** Initial userid (cart owner) — typically from ?userid= URL param. */
  initialUserId: string;
  /** Pacred-admin's own legacy adminid (resolved server-side) — fallback
   *  if the staff forgets to fill in a customer userid. */
  myAdminId: string;
  /** customs.fx_rates (THB per 1 unit) — the price-per-piece currency
   *  selector. Non-CNY → ¥-equivalent (server re-derives on submit). */
  fxRates?: Record<string, number>;
  /** Live yuan sell rate (tb_settings.rsdefault) — for the ฿ preview. */
  rsDefault?: number;
};

// Tailwind shorthand classes for repeat use.
const LABEL_CLS = "block text-xs font-medium text-muted mb-1.5";
const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

export default function AdminAddCartForm({ initialUserId, myAdminId, fxRates, rsDefault }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Price-per-piece currency selector (controlled so the live ฿ preview
  // recomputes). Default CNY = หยวน.
  const [priceStr, setPriceStr] = useState<string>("");
  const [currency, setCurrency] = useState<string>("CNY");
  const currencyOptions = useMemo(() => {
    const keys = ["CNY", "THB", ...Object.keys(fxRates ?? {})];
    return Array.from(new Set(keys.map((k) => k.toUpperCase())));
  }, [fxRates]);
  const priceNum = Number(priceStr) || 0;
  const yuanEquiv = toYuanEquivalent(priceNum, currency, fxRates ?? {});
  const thbPreview = yuanEquiv.yuan * (rsDefault ?? 0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const fd = new FormData(e.currentTarget);
    const userid = String(fd.get("userid") ?? "").trim() || myAdminId;

    if (!userid) {
      setError("กรุณากรอกรหัสสมาชิก");
      return;
    }

    const curl     = String(fd.get("cURL") ?? "").trim();
    const cdetails = String(fd.get("cDetails") ?? "").trim();
    if (!curl || !cdetails) {
      setError("กรุณากรอกข้อมูลให้ครบ (ลิงค์/ชื่อสินค้า + หมายเหตุ)");
      return;
    }

    const cprice  = Number(fd.get("cPrice") ?? 0);
    const camount = Number(fd.get("cAmount") ?? 0);
    if (!(cprice > 0) || !(camount > 0)) {
      setError("กรุณาระบุราคาและจำนวนที่ถูกต้อง");
      return;
    }

    startTransition(async () => {
      const res = await adminAddItemToCart({
        userid,
        item: {
          curl,
          cdetails,
          ctitle:    String(fd.get("cTitle") ?? "").trim(),
          cnameshop: String(fd.get("cNameShop") ?? "").trim() || "pcs",
          cprovider: (String(fd.get("cProvider") ?? "4")) as (typeof ADMIN_CART_PROVIDERS)[number],
          cimages:   String(fd.get("cImages") ?? "").trim(),
          cprice,
          camount,
          ccolor:    String(fd.get("cColor") ?? "").trim(),
          csize:     String(fd.get("cSize") ?? "").trim(),
          // Non-CNY → server re-derives cprice = ¥-equivalent from the FX pool.
          // CNY → omitted → cprice used verbatim (byte-identical to today).
          ...(currency !== "CNY"
            ? { input_currency: currency, input_price: cprice }
            : {}),
        },
      });

      if (!res.ok) {
        setError(`เพิ่มสินค้าไม่สำเร็จ: ${res.error}`);
        return;
      }
      setSuccess(`เพิ่มสินค้าลงในรถเข็นแล้ว (ID #${res.data?.id})`);
      setTimeout(() => {
        router.push(`/admin/service-orders/cart?userID=${encodeURIComponent(userid)}`);
      }, 1500);
    });
  }

  return (
    <form method="POST" autoComplete="off" onSubmit={handleSubmit} className="space-y-5">
      {/* Cart owner */}
      <div>
        <label htmlFor="userid" className={LABEL_CLS}>
          รหัสสมาชิก (เจ้าของรถเข็น)
        </label>
        <input
          id="userid"
          name="userid"
          type="text"
          className={`${INPUT_CLS} font-mono`}
          placeholder="PR123 (เว้นว่าง = รถเข็นแอดมิน)"
          defaultValue={initialUserId}
        />
      </div>

      <hr className="border-border" />

      {/* 1. Link + shop */}
      <div className="space-y-3">
        <div>
          <label htmlFor="cURL" className={LABEL_CLS}>
            1. ลิงก์หรือชื่อสินค้า <span className="text-red-500">*</span>
          </label>
          {/* maxLength on every product-text input comes from the SAME constant
              the server validates against (lib/validators/product-text.ts) — a
              value the submit would reject must be impossible to type
              (owner 2026-07-22 · same rule as the qty ceiling). */}
          <input
            id="cURL"
            name="cURL"
            type="text"
            required
            maxLength={PRODUCT_TEXT_MAX}
            className={INPUT_CLS}
            placeholder="https://item.taobao.com/... หรือชื่อสินค้า"
          />
        </div>
        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <label htmlFor="cTitle" className={LABEL_CLS}>
              ชื่อย่อสินค้า
            </label>
            <input
              id="cTitle"
              name="cTitle"
              type="text"
              maxLength={PRODUCT_TEXT_MAX}
              className={INPUT_CLS}
              placeholder="ชื่อสินค้า (เว้นว่างได้)"
            />
          </div>
          <div className="md:col-span-4">
            <label htmlFor="cNameShop" className={LABEL_CLS}>
              ชื่อร้าน
            </label>
            <input
              id="cNameShop"
              name="cNameShop"
              type="text"
              maxLength={PRODUCT_TEXT_MAX}
              className={INPUT_CLS}
              placeholder="pcs"
              defaultValue="pcs"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="cProvider" className={LABEL_CLS}>
              ผู้ขาย
            </label>
            <select
              id="cProvider"
              name="cProvider"
              className={INPUT_CLS}
              defaultValue="4"
            >
              <option value="1">1688</option>
              <option value="2">Taobao</option>
              <option value="3">Tmall</option>
              <option value="4">Shops</option>
              <option value="5">Nice</option>
            </select>
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* 2. Image + notes */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cImages" className={LABEL_CLS}>
            2. URL รูปภาพ
          </label>
          <input
            id="cImages"
            name="cImages"
            type="url"
            maxLength={PRODUCT_TEXT_MAX}
            className={INPUT_CLS}
            placeholder="https://i.postimg.cc/xxx/yyy.jpg (เว้นว่างได้)"
          />
          {/* The free-text paste here is the origin of every broken product image
              (owner 2026-07-10): staff pasted a Google-Drive FOLDER link, which was
              stored verbatim and copied into tb_order.cimages → hcover → fcover.
              The server now rejects those (lib/validators/image-url.ts); this hint
              stops the mistake one step earlier. */}
          <p className="mt-1 text-[11px] leading-snug text-muted">
            ต้องเป็นลิงก์ <strong>ไฟล์รูปโดยตรง</strong> (คลิกขวาที่รูป → คัดลอกที่อยู่รูปภาพ) ·
            ใช้ไม่ได้: ลิงก์โฟลเดอร์ Google&nbsp;Drive, ลิงก์หน้าเว็บสินค้า,
            หรือ <code>postimg.cc/xxx</code> (ต้องเป็น <code>i.postimg.cc/…</code>)
          </p>
        </div>
        <div>
          <label htmlFor="cDetails" className={LABEL_CLS}>
            หมายเหตุ <span className="text-red-500">*</span>
          </label>
          <textarea
            id="cDetails"
            name="cDetails"
            rows={3}
            maxLength={1500}
            required
            className={INPUT_CLS}
            placeholder="รายละเอียด"
          />
        </div>
      </div>

      {/* 3. Color + size */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cColor" className={LABEL_CLS}>
            3. สี / แบบ
          </label>
          <input
            id="cColor"
            name="cColor"
            type="text"
            className={INPUT_CLS}
            placeholder="สี (เว้นว่างได้)"
          />
        </div>
        <div>
          <label htmlFor="cSize" className={LABEL_CLS}>
            ขนาด
          </label>
          <input
            id="cSize"
            name="cSize"
            type="text"
            className={INPUT_CLS}
            placeholder="ขนาด (เว้นว่างได้)"
          />
        </div>
      </div>

      {/* 4. Price + qty */}
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label htmlFor="cPrice" className={LABEL_CLS}>
            4. ราคาต่อชิ้น <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              id="cPrice"
              name="cPrice"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className={`${INPUT_CLS} text-right font-mono`}
              placeholder="0.00"
            />
            <select
              aria-label="สกุลเงิน"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${INPUT_CLS} w-auto`}
            >
              {currencyOptions.map((c) => (
                <option key={c} value={c}>{c === "CNY" ? "หยวน (CNY/RMB)" : c}</option>
              ))}
            </select>
          </div>
          {/* Transparency: original → ¥-equivalent → ฿ (×rsdefault) */}
          {priceNum > 0 && yuanEquiv.yuan > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              {currency !== "CNY" && (
                <>{priceNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency} → </>
              )}
              <b className="text-foreground">¥{yuanEquiv.yuan.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
              {rsDefault ? (
                <> → ฿{thbPreview.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
              ) : null}
            </p>
          )}
          {yuanEquiv.flagged && priceNum > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">
              ไม่พบเรตสกุลเงินนี้ — บันทึกเป็นหยวนตามที่กรอก
            </p>
          )}
        </div>
        <div>
          <label htmlFor="cAmount" className={LABEL_CLS}>
            จำนวน <span className="text-red-500">*</span>
          </label>
          <input
            id="cAmount"
            name="cAmount"
            type="number"
            min={1}
            max={10000}
            step={1}
            defaultValue={1}
            required
            className={`${INPUT_CLS} text-right font-mono`}
          />
        </div>
      </div>

      {/* Inline alerts */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="submit"
          name="addCart"
          disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-5 py-2 text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "กำลังเพิ่ม..." : "+ เพิ่มในรถเข็น"}
        </button>
      </div>
    </form>
  );
}

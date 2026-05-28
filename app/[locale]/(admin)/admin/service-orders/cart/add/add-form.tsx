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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminAddItemToCart } from "@/actions/admin/cart";
import { ADMIN_CART_PROVIDERS } from "@/lib/validators/admin-cart";

type Props = {
  /** Initial userid (cart owner) — typically from ?userid= URL param. */
  initialUserId: string;
  /** Pacred-admin's own legacy adminid (resolved server-side) — fallback
   *  if the staff forgets to fill in a customer userid. */
  myAdminId: string;
};

// Tailwind shorthand classes for repeat use.
const LABEL_CLS = "block text-xs font-medium text-muted mb-1.5";
const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500";

export default function AdminAddCartForm({ initialUserId, myAdminId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
          <input
            id="cURL"
            name="cURL"
            type="text"
            required
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
            type="text"
            className={INPUT_CLS}
            placeholder="https://... (เว้นว่างได้)"
          />
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
            4. ราคาต่อชิ้น (¥) <span className="text-red-500">*</span>
          </label>
          <input
            id="cPrice"
            name="cPrice"
            type="number"
            min="0.01"
            step="0.01"
            required
            className={`${INPUT_CLS} text-right font-mono`}
            placeholder="0.00"
          />
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

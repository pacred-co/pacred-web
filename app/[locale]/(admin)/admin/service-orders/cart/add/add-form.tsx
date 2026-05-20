"use client";

/**
 * Admin add-item-to-cart form — client island.
 *
 * Faithful 1:1 of the legacy "สั่งซื้อสินค้าแบบกำหนดเอง" form (pcs-admin/
 * search.php L311-430, the `?product=custom` branch — staff use this when
 * a 1688/Taobao URL doesn't scrape cleanly and they need to type the item
 * fields manually).
 *
 * Legacy field set (preserved here):
 *   - cURL          ลิงค์หรือชื่อสินค้า              (required)
 *   - cImages       รูปภาพ                          (file upload — staged)
 *   - cDetails      หมายเหตุ                        (required)
 *   - cColor        สี/แบบ                          (optional)
 *   - cSize         ขนาด                            (optional)
 *   - cPrice        ราคา (¥)                        (required, > 0)
 *   - cAmount       จำนวน                           (required, >= 1)
 *
 * Pacred extras (faithful intent — admins target a customer cart):
 *   - userid        รหัสสมาชิก (customer PR<n>)     (required — defaults to
 *                                                    URL search param ?userid=
 *                                                    when CS arrives from the
 *                                                    cart-viewing page)
 *
 * Not yet wired (deferred):
 *   - Image upload — the legacy moves the file to ../images/shops/<uniqid>.<ext>
 *     and stores the filename in cImages. Pacred image-pipeline is post-Phase-A
 *     (customer-images backfill is queued after the Supabase Pro upgrade per
 *     CLAUDE.md). For now the field accepts an optional image URL string
 *     (the legacy 1688/Taobao scrape path also stores a remote URL string
 *     into cImages, so the schema is honest about that).
 *   - The jQuery repeater (legacy "+" button to add multiple items in one
 *     submit) — Pacred's single-item-at-a-time API is simpler; the form
 *     can be re-submitted N times to add N items. The owner-bottleneck on
 *     this surface is rare-edge (custom-URL items, not the common scrape).
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
      // Redirect back to cart for this customer after a moment.
      setTimeout(() => {
        router.push(`/admin/service-orders/cart?userID=${encodeURIComponent(userid)}`);
      }, 1500);
    });
  }

  return (
    <form
      className="form-horizontal"
      method="POST"
      autoComplete="off"
      onSubmit={handleSubmit}
    >
      <div className="border-shops box-shadow">
        <div className="p-2 p-md-3">
          {/* Customer (cart owner) — Pacred extra */}
          <div className="form-group">
            <div className="mb-2">
              <label className="form-control-label" htmlFor="userid">
                รหัสสมาชิก (เจ้าของรถเข็น) :
              </label>
              <input
                id="userid"
                name="userid"
                type="text"
                className="form-control form-control-lg"
                placeholder="PR123 (เว้นว่าง = รถเข็นแอดมิน)"
                defaultValue={initialUserId}
              />
            </div>
          </div>

          {/* 1. URL / shop / provider */}
          <div className="form-group">
            <div className="mb-2">
              <label className="form-control-label" htmlFor="cURL">
                1. ลิงค์หรือชื่อสินค้า :
              </label>
              <input
                id="cURL"
                name="cURL"
                type="text"
                className="form-control form-control-lg"
                placeholder="ลิงค์หรือชื่อสินค้า"
                required
              />
            </div>
            <div className="row">
              <div className="col-md-6">
                <div className="mb-1">
                  <label className="form-control-label" htmlFor="cTitle">
                    ชื่อย่อสินค้า :
                  </label>
                  <input
                    id="cTitle"
                    name="cTitle"
                    type="text"
                    className="form-control"
                    placeholder="ชื่อสินค้า (เว้นว่างได้)"
                  />
                </div>
              </div>
              <div className="col-md-4">
                <div className="mb-1">
                  <label className="form-control-label" htmlFor="cNameShop">
                    ชื่อร้าน :
                  </label>
                  <input
                    id="cNameShop"
                    name="cNameShop"
                    type="text"
                    className="form-control"
                    placeholder="pcs"
                    defaultValue="pcs"
                  />
                </div>
              </div>
              <div className="col-md-2">
                <div className="mb-1">
                  <label className="form-control-label" htmlFor="cProvider">
                    ผู้ขาย :
                  </label>
                  <select
                    id="cProvider"
                    name="cProvider"
                    className="form-control"
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
          </div>

          {/* 2. Image + details */}
          <div className="form-group">
            <div className="row">
              <div className="col-md-6">
                <div className="mb-1">
                  <label className="form-control-label" htmlFor="cImages">
                    URL รูปภาพ :
                  </label>
                  <input
                    id="cImages"
                    name="cImages"
                    type="text"
                    className="form-control"
                    placeholder="https://... (เว้นว่างได้)"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="mb-1">
                  <label className="form-control-label" htmlFor="cDetails">
                    หมายเหตุ :
                  </label>
                  <textarea
                    id="cDetails"
                    name="cDetails"
                    rows={3}
                    className="form-control"
                    placeholder="รายละเอียด"
                    maxLength={1500}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Color + size */}
          <div className="form-group">
            <div className="row">
              <div className="col-md-6">
                <div className="mb-2">
                  <label className="form-control-label" htmlFor="cColor">
                    สี/แบบ :
                  </label>
                  <input
                    id="cColor"
                    name="cColor"
                    type="text"
                    className="form-control form-control-lg"
                    placeholder="สี"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="mb-2">
                  <label className="form-control-label" htmlFor="cSize">
                    ขนาด :
                  </label>
                  <input
                    id="cSize"
                    name="cSize"
                    type="text"
                    className="form-control form-control-lg"
                    placeholder="ขนาด"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Price + qty */}
          <div className="form-group">
            <div className="row">
              <div className="col-md-6">
                <div className="mb-2">
                  <label className="form-control-label" htmlFor="cPrice">
                    ราคา (¥) :
                  </label>
                  <input
                    id="cPrice"
                    name="cPrice"
                    type="number"
                    className="cPrice form-control form-control-lg text-right"
                    placeholder="0.00"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="mb-2">
                  <label className="form-control-label" htmlFor="cAmount">
                    จำนวน :
                  </label>
                  <input
                    id="cAmount"
                    name="cAmount"
                    type="number"
                    className="cAmount form-control form-control-lg text-right"
                    defaultValue={1}
                    min={1}
                    max={10000}
                    step={1}
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success mt-2" role="alert">
          {success}
        </div>
      )}

      <hr />
      <div className="border-shops box-shadow card-total">
        <div className="p-1">
          <div className="row align-items-center">
            <div className="col-md-8" />
            <div className="col-md-4 text-right">
              <button
                type="submit"
                className="btn btn-outline-danger btn-rounded"
                name="addCart"
                disabled={pending}
              >
                <i className="mdi mdi-cart-outline"></i>{" "}
                {pending ? "กำลังเพิ่ม..." : "เพิ่มในรถเข็น"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

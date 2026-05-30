"use client";

/**
 * The "แก้ไขที่อยู่" (edit address) entry — a real client-side popup, the
 * faithful counterpart to <AddAddressModal> (`./add-address-modal.tsx`).
 *
 * Legacy address.php opened the edit-address form via a jQuery AJAX modal
 * (`editAddress.php`); the first Tailwind rebuild left the per-row "แก้ไข"
 * button inert (a `data-legacy-onclick` marker). This rebuilds it with the
 * exact same modal pattern as the add popup: the amber row-action pill →
 * `useState` open → `createPortal` to <body> → backdrop / X / "ยกเลิก" /
 * Escape all close it · body-scroll-lock while open · bottom-sheet on phones,
 * centred card on `sm+`.
 *
 * The `<form action={editAddressAction}>` body is the SAME field markup as the
 * add modal (every input name/type/required/maxLength/pattern is preserved so
 * the shared field-name contract in add-address-action.ts holds), with two
 * differences: a hidden `addressId` targets the row to UPDATE, and every field
 * is pre-filled via `defaultValue` from the `address` prop. The four visible
 * location fields (district/amphoe/province/zipcode) pre-fill from the
 * tb_address columns addresssubdistrict/addressdistrict/addressprovince/
 * addresszipcode. The hidden lat/long inputs are PRE-FILLED from the row's
 * stored values so an edit preserves the existing map pin — the map-pin UI was
 * dropped, so leaving them blank would re-send "" and the action's
 * `latitudeRaw === "" ? 0` path would silently ZERO a real stored pin on every
 * edit (rows in prod carry real coordinates, e.g. 13.70/99.99). Round-tripping
 * the stored values keeps the pin intact even though it is not editable here.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin } from "lucide-react";
import { editAddressAction } from "./add-address-action";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500";
const LABEL_CLASS = "block text-xs font-medium text-muted mb-1";

export function EditAddressModal({
  address,
}: {
  address: {
    addressid: number;
    addressname: string | null;
    addresslastname: string | null;
    addresstel: string | null;
    addresstel2: string | null;
    addressno: string | null;
    addresssubdistrict: string | null;
    addressdistrict: string | null;
    addressprovince: string | null;
    addresszipcode: string | null;
    addressnote: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll + wire Escape-to-close while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Trigger — the amber "แก้ไขที่อยู่" row-action pill (same classes as the
          inert legacy button it replaces, now opening the popup). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-amber-300 px-3 py-1 text-xs font-medium text-amber-600 hover:bg-amber-50"
        title="แก้ไขข้อมูล"
      >
        แก้ไขที่อยู่
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            {/* Backdrop */}
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50"
            />

            {/* Panel — bottom-sheet on mobile, centred card on sm+ */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-address-title"
              className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-xl dark:bg-surface sm:max-w-[640px] sm:rounded-2xl"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3 dark:bg-surface md:px-5 md:py-4">
                <h2
                  id="edit-address-title"
                  className="inline-flex items-center gap-2 text-base font-bold text-foreground sm:text-lg"
                >
                  <MapPin className="h-5 w-5 shrink-0 text-primary-600" />
                  แก้ไขที่อยู่จัดส่งสินค้า
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-alt hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="overflow-y-auto px-4 py-4 sm:px-5">
                {/* editAddress.php — the legacy form POSTs an UPDATE; here it
                    submits to the editAddressAction Server Action. */}
                <form action={editAddressAction} autoComplete="off" className="space-y-3">
                  {/* The row this edit targets (editAddress.php $addressID). */}
                  <input type="hidden" name="addressId" value={address.addressid} />
                  {/* Pre-filled from the row so an edit preserves the stored map
                      pin (blank would zero it — see header comment). */}
                  <input
                    type="hidden"
                    name="latitude"
                    id="latitude"
                    defaultValue={address.latitude ?? ""}
                  />
                  <input
                    type="hidden"
                    name="longitude"
                    id="longitude"
                    defaultValue={address.longitude ?? ""}
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressName">
                        ชื่อจริง
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressName"
                        name="addressName"
                        type="text"
                        defaultValue={address.addressname ?? ""}
                        placeholder="ชื่อจริง"
                        maxLength={200}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressLastname">
                        นามสกุล
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressLastname"
                        name="addressLastname"
                        type="text"
                        defaultValue={address.addresslastname ?? ""}
                        placeholder="นามสกุล"
                        maxLength={200}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressTel">
                        เบอร์โทรศัพท์ (สำหรับแจ้งส่งพัสดุ)
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressTel"
                        name="addressTel"
                        type="tel"
                        pattern="\d*"
                        defaultValue={address.addresstel ?? ""}
                        placeholder="เบอร์โทร"
                        minLength={10}
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="addressTel2">
                        เบอร์โทรศัพท์สำรอง (ไม่จำเป็น)
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="addressTel2"
                        name="addressTel2"
                        type="tel"
                        pattern="\d*"
                        defaultValue={address.addresstel2 ?? ""}
                        placeholder="เบอร์โทร"
                        minLength={10}
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL_CLASS} htmlFor="addressNo">
                      ทึ่อยู่{" "}
                      <span className="text-red-600">ชื่อหมู่บ้านและหมู่ที่*</span>
                    </label>
                    <input
                      className={INPUT_CLASS}
                      id="addressNo"
                      name="addressNo"
                      type="text"
                      defaultValue={address.addressno ?? ""}
                      placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่*"
                      maxLength={200}
                      required
                    />
                    <p className="mt-1 text-xs text-muted">
                      กรุณากรอกบ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่
                    </p>
                  </div>

                  {/* The 4 location fields — visible + required so the save
                      action's required-field guard passes. Pre-filled from the
                      tb_address subdistrict/district/province/zipcode columns. */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS} htmlFor="district">
                        ตำบล/แขวง
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="district"
                        name="district"
                        type="text"
                        defaultValue={address.addresssubdistrict ?? ""}
                        placeholder="ตำบล/แขวง"
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="amphoe">
                        อำเภอ/เขต
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="amphoe"
                        name="amphoe"
                        type="text"
                        defaultValue={address.addressdistrict ?? ""}
                        placeholder="อำเภอ/เขต"
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="province">
                        จังหวัด
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="province"
                        name="province"
                        type="text"
                        defaultValue={address.addressprovince ?? ""}
                        placeholder="จังหวัด"
                        required
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS} htmlFor="zipcode">
                        รหัสไปรษณีย์
                      </label>
                      <input
                        className={INPUT_CLASS}
                        id="zipcode"
                        name="zipcode"
                        type="text"
                        pattern="\d*"
                        defaultValue={address.addresszipcode ?? ""}
                        placeholder="รหัสไปรษณีย์"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className={LABEL_CLASS} htmlFor="addressNote">
                      หมายเหตุ (ไม่จำเป็น)
                    </label>
                    <textarea
                      className={INPUT_CLASS}
                      id="addressNote"
                      name="addressNote"
                      rows={3}
                      defaultValue={address.addressnote ?? ""}
                      placeholder="หมายเหตุ"
                      maxLength={500}
                    ></textarea>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt dark:bg-surface"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      name="edit"
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
                    >
                      บันทึก
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

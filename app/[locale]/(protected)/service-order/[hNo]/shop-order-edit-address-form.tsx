"use client";

/**
 * Inline "แก้ไข ที่อยู่จัดส่ง" form on the CUSTOMER shop-order detail page.
 *
 * Faithful port of shops.php L1692-1759 (the `update_hAddress` inline form),
 * styled as the Pacred mirror of `ServiceImportEditAddressForm` (the forwarder
 * twin). Server Action: updateLegacyShopOrderAddress (shops.php L1512-1551) —
 * copies the picked tb_address row onto the order; refused for PCS pickup.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { updateLegacyShopOrderAddress } from "@/actions/service-order-legacy";

type AddressOption = {
  addressid: number | string;
  label: string;
  isMain: boolean;
};

type Props = {
  hNo: string;
  options: AddressOption[];
  isEditable: boolean;
  /** True when hShipBy === 'PCS' (warehouse pickup) → address is locked. */
  warehousePickup: boolean;
};

export function ShopOrderEditAddressForm({
  hNo,
  options,
  isEditable,
  warehousePickup,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // shops.php L1545 — warehouse pickup blocks the address change entirely.
  if (!isEditable || warehousePickup) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    startTransition(async () => {
      const res = await updateLegacyShopOrderAddress(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span id="text-hAddress" className="block">
      {!open && (
        <a
          href="javascript:void(0)"
          className="ml-1 text-xs font-medium text-sky-600 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          แก้ไข
        </a>
      )}
      <div id="hAddressForm" style={{ display: open ? "block" : "none" }} className="mt-2">
        <form
          className="rounded-xl border border-border bg-surface-alt/40 p-3"
          method="POST"
          action="#"
          autoComplete="off"
          onSubmit={handleSubmit}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-muted" htmlFor="addressID">
              ที่อยู่จัดส่ง
            </label>
            <Link
              href="/addresses/add"
              target="_blank"
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
            >
              เพิ่มที่อยู่ใหม่ <i className="fa fa-plus"></i>
            </Link>
          </div>
          {error && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <input type="hidden" name="hNo" value={hNo} />
          <select
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
            name="addressID"
            id="addressID"
            required
            defaultValue=""
          >
            <option value="">กรุณาเลือกที่อยู่ในการจัดส่ง</option>
            {options.map((o) => (
              <option key={o.addressid} value={o.addressid}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt active:scale-[0.98] transition-all"
              id="to-text-hAddress"
              onClick={() => setOpen(false)}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              name="update_hAddress"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-60"
              disabled={isPending}
            >
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </span>
  );
}

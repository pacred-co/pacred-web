"use client";

/**
 * Inline "แก้ไข บริษัทขนส่ง" form on the CUSTOMER shop-order detail page.
 *
 * Faithful port of shops.php L1674-1688 (the `update_hShipBy` inline form),
 * styled as the Pacred mirror of `ServiceImportEditShipByForm` (the forwarder
 * twin). Server Action: updateLegacyShopOrderShipBy (shops.php L1470-1510).
 *
 * The legacy jQuery slide-down on the "แก้ไข" link collapses to a useState
 * toggle, same as the forwarder twin.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegacyShopOrderShipBy } from "@/actions/service-order-legacy";

type ShipByOption = { code: string; label: string };

type Props = {
  hNo: string;
  currentShipBy: string;
  currentLabel: string;
  options: ShipByOption[];
  isEditable: boolean;
};

export function ShopOrderEditShipByForm({
  hNo,
  currentShipBy,
  currentLabel,
  options,
  isEditable,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = {};
    for (const [k, v] of fd.entries()) payload[k] = v;

    startTransition(async () => {
      const res = await updateLegacyShopOrderShipBy(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span className="inline">
      <span id="text-hShipBy">
        {currentLabel}{" "}
        {isEditable && !open && (
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
      </span>
      {/* shops.php L1678-1688 — the slide-down edit form. */}
      <div id="hShipByForm" style={{ display: open ? "block" : "none" }} className="mt-2">
        <form
          className="rounded-xl border border-border bg-surface-alt/40 p-3"
          method="POST"
          action="#"
          autoComplete="off"
          onSubmit={handleSubmit}
          aria-busy={isPending}
        >
          {error && (
            <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <input type="hidden" name="hNo" value={hNo} />
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="hShipBy">
            บริษัทขนส่ง
          </label>
          <select
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
            name="hShipBy"
            id="hShipBy"
            defaultValue={currentShipBy}
            required
          >
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-border bg-white dark:bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-alt active:scale-[0.98] transition-all"
              id="to-text-hShipBy"
              onClick={() => setOpen(false)}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              name="update_hShipBy"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-60"
              disabled={isPending}
            >
              บันทึก
            </button>
          </div>
          <p className="mt-2 text-xs text-red-600">
            หมายเหตุ : บริษัทขนส่งจะขึ้นอยู่กับพื้นที่ในการจัดส่ง
            ซึ่งเงื่อนไขเป็นไปตามที่บริษัทกำหนด
          </p>
        </form>
      </div>
    </span>
  );
}

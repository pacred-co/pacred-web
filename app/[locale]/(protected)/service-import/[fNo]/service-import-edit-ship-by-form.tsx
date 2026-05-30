"use client";

/**
 * Inline "แก้ไข บริษัทขนส่ง" form on the forwarder detail page.
 *
 * Faithful 1:1 with forwarder.php L1923-1936 — same Bootstrap-4 modal-
 * footer / button markup, same `name="update_fShipBy"`. The legacy
 * jQuery slide-down on the "แก้ไข" link is reproduced here as a tiny
 * useState toggle (the jQuery `.slideUp()/.slideDown()` UX collapses
 * to a simple show/hide; visually faithful given the modal context).
 *
 * Server Action: updateLegacyForwarderShipBy (forwarder.php L1586-1619
 * POST handler) — UPDATE tb_forwarder SET fshipby=… [, paymethod=…]
 * + the PCS-pickup address override.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegacyForwarderShipBy } from "@/actions/forwarder-legacy";

type ShipByOption = { code: string; label: string };

type Props = {
  forwarderId: number;
  currentFShipBy: string;
  currentLabel: string;
  options: ShipByOption[];
  isEditable: boolean;
};

export function ServiceImportEditShipByForm({
  forwarderId,
  currentFShipBy,
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
      const res = await updateLegacyForwarderShipBy(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <span id="text-fShipBy">
        {currentLabel}{" "}
        {isEditable && !open && (
          <span id="to-edit-fShipBy">
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
          </span>
        )}
      </span>
      {/* forwarder.php L1937-1948 — the slide-down edit form (initially
          display:none in the legacy). */}
      <div id="fShipByForm" style={{ display: open ? "block" : "none" }} className="mt-2">
        {currentFShipBy !== "F" ? (
          <form
            className="rounded-xl border border-border bg-surface-alt/40 p-3"
            method="POST"
            action="#"
            autoComplete="off"
            onSubmit={handleSubmit}
            aria-busy={isPending}
          >
            {isEditable ? (
              <>
                {error && (
                  <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {error}
                  </div>
                )}
                <input type="hidden" name="ID" value={forwarderId} />
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="fShipBy">
                  บริษัทขนส่ง
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  name="fShipBy"
                  id="fShipBy"
                  defaultValue={currentFShipBy}
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
                    id="to-text-fShipBy"
                    onClick={() => setOpen(false)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    name="update_fShipBy"
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
              </>
            ) : (
              <span className="inline-flex items-center rounded bg-red-600 px-2 py-1 text-sm text-white">
                ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากสินค้าถึงไทยแล้ว
                <span></span>
              </span>
            )}
          </form>
        ) : (
          <p className="text-sm text-red-600">
            สั่งสินค้าในช่วงโปรโมชันฟรี ค่าขนส่งในไทย
            ทางบริษัทขอสงวนสิทธิ์ในการเลือกบริษัทขนส่ง
          </p>
        )}
      </div>
    </>
  );
}

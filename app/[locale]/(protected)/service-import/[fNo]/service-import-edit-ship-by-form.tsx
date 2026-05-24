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
      <span id="text-fShipBy" className="">
        {currentLabel}{" "}
        {isEditable && !open && (
          <span className="" id="to-edit-fShipBy">
            <a
              href="javascript:void(0)"
              className="text-info font-10"
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
      <div id="fShipByForm" style={{ display: open ? "block" : "none" }}>
        {currentFShipBy !== "F" ? (
          <form
            className="form-horizontal d-table"
            method="POST"
            action="#"
            autoComplete="off"
            onSubmit={handleSubmit}
            aria-busy={isPending}
          >
            {isEditable ? (
              <>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                <input type="hidden" name="ID" value={forwarderId} />
                <select
                  className="form-control"
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
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-rounded"
                    id="to-text-fShipBy"
                    onClick={() => setOpen(false)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    name="update_fShipBy"
                    className="btn btn-color-main btn-rounded"
                    disabled={isPending}
                  >
                    บันทึก
                  </button>
                </div>
                <p className="text-danger font-12 pt-1">
                  หมายเหตุ : บริษัทขนส่งจะขึ้นอยู่กับพื้นที่ในการจัดส่ง
                  ซึ่งเงื่อนไขเป็นไปตามที่บริษัทกำหนด
                </p>
              </>
            ) : (
              <span className="bg-danger text-white">
                ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากสินค้าถึงไทยแล้ว
                <span></span>
              </span>
            )}
          </form>
        ) : (
          <p className="text-danger">
            สั่งสินค้าในช่วงโปรโมชันฟรี ค่าขนส่งในไทย
            ทางบริษัทขอสงวนสิทธิ์ในการเลือกบริษัทขนส่ง
          </p>
        )}
      </div>
    </>
  );
}

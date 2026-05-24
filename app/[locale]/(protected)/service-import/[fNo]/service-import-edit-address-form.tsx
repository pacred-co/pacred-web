"use client";

/**
 * Inline "แก้ไข ที่อยู่จัดส่ง" form on the forwarder detail page.
 *
 * Faithful 1:1 with forwarder.php L1953-2011 — same markup, same Thai
 * labels, same `name="update_fAddress"`. The legacy jQuery slide-down
 * is reproduced as a useState toggle.
 *
 * Server Action: updateLegacyForwarderAddress (forwarder.php L1620-1658
 * POST handler) — UPDATE tb_forwarder SET fAddress*=… copied from the
 * selected tb_address row.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { updateLegacyForwarderAddress } from "@/actions/forwarder-legacy";

type AddressOption = {
  addressid: number | string;
  label: string;
  isMain: boolean;
};

type Props = {
  forwarderId: number;
  options: AddressOption[];
  isEditable: boolean;
};

export function ServiceImportEditAddressForm({
  forwarderId,
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
      const res = await updateLegacyForwarderAddress(payload);
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
      <span id="text-fAddress">
        <span className="d-inline-block" id="to-edit-fAddress">
          {!open && (
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
          )}
        </span>
      </span>
      <div
        className=""
        id="fAddressForm"
        style={{ display: open ? "block" : "none" }}
      >
        {isEditable ? (
          <>
            <div className="float-right">
              <Link
                href="/addresses/add"
                target="_blank"
                className="text-info font-0_85rem"
              >
                เพิ่มที่อยู่ใหม่ <i className="fa fa-plus"></i>
              </Link>
            </div>
            <br />
            <form
              className="form-horizontal d-table"
              method="POST"
              action="#"
              autoComplete="off"
              onSubmit={handleSubmit}
              aria-busy={isPending}
            >
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              <input type="hidden" name="ID" value={forwarderId} />
              <select
                className="form-control"
                name="addressID"
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
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-rounded"
                  id="to-text-fAddress"
                  onClick={() => setOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  name="update_fAddress"
                  className="btn btn-color-main btn-rounded"
                  disabled={isPending}
                >
                  บันทึก
                </button>
              </div>
            </form>
          </>
        ) : (
          <span className="bg-danger text-white">
            ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากสินค้าถึงไทยแล้ว
          </span>
        )}
      </div>
    </>
  );
}

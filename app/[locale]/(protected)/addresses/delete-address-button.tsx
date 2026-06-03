"use client";

// M-1 (Wave A · 2026-06-01) — the per-row "ลบที่อยู่" button, rewired from the
// inert `data-legacy-onclick="deleteAddress(...)"` marker to the real server
// action. A confirm() guards the destructive submit; if the user cancels we
// preventDefault so deleteAddressAction never fires. Soft-delete (the action
// flips tb_address.addressstatus '1'→'0'). Dropped into both the mobile-card
// and desktop-table render paths.

import { useRef } from "react";
import { confirm } from "@/components/ui/confirm";
import { deleteAddressAction } from "./add-address-action";

export function DeleteAddressButton({ addressId }: { addressId: number }) {
  // The styled confirm() is async, so we can't synchronously preventDefault
  // based on its result. Instead we always block the first submit, ask, then
  // programmatically resubmit on "yes" — the `confirmed` ref lets that second
  // submit pass straight through (so the form `action` fires) without looping.
  const confirmed = useRef(false);
  return (
    <form
      action={deleteAddressAction}
      onSubmit={async (e) => {
        if (confirmed.current) {
          confirmed.current = false;
          return; // let the resubmit through → deleteAddressAction runs
        }
        e.preventDefault();
        const form = e.currentTarget;
        if (await confirm("ลบที่อยู่นี้ออกจากสมุดที่อยู่?")) {
          confirmed.current = true;
          form.requestSubmit();
        }
      }}
      className="inline-block"
    >
      <input type="hidden" name="addressId" value={addressId} />
      <button
        type="submit"
        className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        title="ลบข้อมูล"
      >
        ลบที่อยู่
      </button>
    </form>
  );
}

"use client";

/**
 * ✏️ แก้ที่อยู่จัดส่ง (บนใบ) — mounts the reusable <CustomerAddressPicker> for the
 * invoice customer on /admin/billing-run/[id]. onPick → adminSetBillingRunDeliveryAddress
 * (snapshots a chosen tb_address into tb_forwarder_invoice.delivery_address · DISPLAY-only
 * ship-to · touches NO amount/tax/status). The picker's "+ add" writes tb_address (reusable
 * · links the customer profile). Confirm-before-write §0f. router.refresh re-reads the doc.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { CustomerAddressPicker } from "@/components/admin/customer-address-picker";
import { adminSetBillingRunDeliveryAddress } from "@/actions/admin/billing-run";
import type { CustomerAddressRow } from "@/lib/legacy/customer-address-options";

export function BillingRunDeliveryAddressEditor({
  invoiceId,
  customerId,
  addresses,
  currentDelivery,
}: {
  invoiceId: number;
  customerId: string;
  addresses: CustomerAddressRow[];
  currentDelivery: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(addressId: number) {
    const picked = addresses.find((a) => a.addressID === addressId);
    const label = picked ? `${picked.name} ${picked.lastname} · ${picked.province} ${picked.zipcode}` : `#${addressId}`;
    if (!(await confirm(`ตั้งที่อยู่จัดส่งบนใบวางบิลเป็น ?\n\n${label}\n\n(เป็นที่อยู่จัดส่งบนเอกสารเท่านั้น · ไม่กระทบยอดเงิน/ภาษี/สถานะ)`))) return;
    setErr(null);
    startTransition(async () => {
      const res = await adminSetBillingRunDeliveryAddress(invoiceId, addressId);
      if (!res.ok) { setErr(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="text-xs text-muted mb-1">ที่อยู่จัดส่ง (บนใบวางบิล)</div>
      {currentDelivery ? (
        <div className="text-sm whitespace-pre-wrap mb-1">{currentDelivery}</div>
      ) : (
        <div className="text-sm text-muted mb-1">— ยังไม่ได้ระบุ —</div>
      )}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 mb-1">⚠ {err}</div>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-sky-600 hover:underline">
          ✏️ แก้ที่อยู่จัดส่ง (บนใบ)
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-surface-alt/40 p-2.5">
          <CustomerAddressPicker
            userid={customerId}
            addresses={addresses}
            busy={pending}
            revalidate={`/admin/billing-run/${invoiceId}`}
            applyLabel="ใช้ที่อยู่นี้บนใบวางบิล"
            onPick={onPick}
          />
          <button type="button" disabled={pending} className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50" onClick={() => { setOpen(false); setErr(null); }}>
            ปิด
          </button>
        </div>
      )}
    </div>
  );
}

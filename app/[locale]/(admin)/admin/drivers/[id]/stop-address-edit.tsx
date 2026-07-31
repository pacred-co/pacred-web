"use client";

/**
 * ✏️ แก้/เพิ่มที่อยู่จัดส่งของ "จุดส่ง" บนหน้ามอบงานคนขับ (ภูม 2026-07-31).
 *
 * กดดินสอ → กางแผง <CustomerAddressPicker> ของลูกค้าเจ้าของจุดส่ง:
 *   - เลือกที่อยู่ที่บันทึกไว้ → apply ลงทุกแถวในจุดนี้ (applyStopDeliveryAddress).
 *   - "+ เพิ่มที่อยู่ให้ลูกค้า" → เขียนเข้าสมุดที่อยู่ (adminAddCustomerAddress) →
 *     โผล่หน้าโปรไฟล์ลูกค้าเอง → auto-apply ลงจุดนี้ด้วย.
 *   - ลิงก์ "จัดการที่อยู่ในโปรไฟล์ลูกค้า" สำหรับแก้/ลบ (SOT ที่แก้จริง = โปรไฟล์).
 *
 * confirm ก่อน apply (§0f) เพราะเขียนที่อยู่ทั้งจุด (หลายแทรคกิ้ง).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Pencil, ExternalLink } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { CustomerAddressPicker } from "@/components/admin/customer-address-picker";
import { applyStopDeliveryAddress } from "@/actions/admin/driver-stop-address";
import type { CustomerAddressRow } from "@/lib/legacy/customer-address-options";

export function EditStopDeliveryAddress({
  userid,
  fids,
  batchId,
  addresses,
  itemCount,
}: {
  userid: string;
  fids: number[];
  batchId: number;
  addresses: CustomerAddressRow[];
  itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(addressId: number) {
    setErr(null);
    startTransition(async () => {
      const chosen = addresses.find((a) => a.addressID === addressId);
      const desc = chosen ? `${chosen.name} ${chosen.lastname} · ${chosen.district} ${chosen.province} ${chosen.zipcode}` : `#${addressId}`;
      if (!(await confirm(`ใช้ที่อยู่นี้กับจุดส่งนี้ทั้งหมด (${itemCount} รายการ) ?\n\n${desc}`))) return;
      const res = await applyStopDeliveryAddress({ fids, addressId, batchId });
      if (!res.ok) {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="pt-0.5">
      <button
        type="button"
        onClick={() => { setErr(null); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
      >
        <Pencil className="h-3 w-3" /> แก้/เพิ่มที่อยู่จัดส่ง
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-surface-alt/40 p-2.5 space-y-2">
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-700">⚠ {err}</div>
          )}
          <CustomerAddressPicker
            userid={userid}
            addresses={addresses}
            onPick={onPick}
            busy={pending}
            selectOnly={false}
            applyLabel={`ใช้ที่อยู่นี้กับจุดส่ง (${itemCount} รายการ)`}
            revalidate={`/admin/drivers/${batchId}`}
          />
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-[11px] text-muted">เพิ่มที่อยู่ใหม่ = บันทึกเข้าสมุดที่อยู่ลูกค้า (โผล่หน้าโปรไฟล์ด้วย)</p>
            <Link
              href={`/admin/customers/${userid}`}
              target="_blank"
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary-600 hover:underline"
            >
              จัดการที่อยู่ในโปรไฟล์ <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

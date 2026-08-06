"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateLegacyForwarderPayMethod } from "@/actions/forwarder-legacy";
import { isOwnFleetCarrier } from "@/lib/forwarder/carrier-coverage-guard";

export function ServiceImportEditPayMethodForm({
  forwarderId,
  currentPayMethod,
  carrier,
  isEditable,
}: {
  forwarderId: number;
  currentPayMethod: string | null;
  carrier: string | null;
  isEditable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<"1" | "2">(currentPayMethod === "2" ? "2" : "1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ownFleet = isOwnFleetCarrier(carrier);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateLegacyForwarderPayMethod({ ID: String(forwarderId), payMethod: value });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span className="inline-block">
      <span className={currentPayMethod === "2" ? "font-semibold text-red-600" : "font-semibold"}>
        {currentPayMethod === "2" ? "จ่ายปลายทาง (ไม่รวมค่าส่งไทยในบิล)" : "จ่ายต้นทาง"}
      </span>
      {isEditable && !open && (
        <button type="button" className="ml-2 text-xs font-medium text-sky-600 hover:underline" onClick={() => setOpen(true)}>
          แก้ไข
        </button>
      )}
      {open && (
        <span className="mt-2 block rounded-lg border border-border bg-surface-alt/40 p-3">
          <select
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value as "1" | "2")}
            disabled={pending}
          >
            <option value="1">จ่ายต้นทาง — รวมเรทขนส่งจริงในยอด</option>
            <option value="2" disabled={ownFleet}>จ่ายปลายทาง — ไม่รวมค่าส่งไทยในยอด</option>
          </select>
          {ownFleet && <small className="mt-1 block text-muted">ขนส่งของ Pacred รับชำระต้นทางเท่านั้น</small>}
          {error && <small className="mt-1 block text-red-600">{error}</small>}
          <span className="mt-2 flex justify-end gap-2">
            <button type="button" className="rounded-full border px-3 py-1.5 text-sm" onClick={() => setOpen(false)} disabled={pending}>ยกเลิก</button>
            <button type="button" className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white" onClick={save} disabled={pending}>บันทึก</button>
          </span>
        </span>
      )}
    </span>
  );
}

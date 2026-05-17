"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateDisbursement, adminDeleteDisbursement, type DisbursementKind } from "@/actions/admin/disbursements";

/**
 * U2-2: per-row controls for the AP ledger list.
 *
 * - "แก้" opens inline edit popover (kind / amount / vendor / paid_at / note)
 * - "ลบ" prompts for a reason then calls adminDeleteDisbursement (super only)
 */

const KIND_OPTIONS: Array<{ value: DisbursementKind; label: string }> = [
  { value: "freight",       label: "freight" },
  { value: "customs_duty",  label: "customs_duty" },
  { value: "handling",      label: "handling" },
  { value: "fuel",          label: "fuel" },
  { value: "storage",       label: "storage" },
  { value: "trucking",      label: "trucking" },
  { value: "other",         label: "other" },
];

export function DisbursementRowControls({
  id,
  kind,
  amountThb,
  vendorName,
  invoiceNo,
  paidAt,
  note,
}: {
  id:         string;
  kind:       string;
  amountThb:  number;
  vendorName: string;
  invoiceNo:  string | null;
  paidAt:     string | null;
  note:       string | null;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [eKind, setEKind]         = useState<DisbursementKind>(kind as DisbursementKind);
  const [eAmount, setEAmount]     = useState(String(amountThb));
  const [eVendor, setEVendor]     = useState(vendorName);
  const [eInvoice, setEInvoice]   = useState(invoiceNo ?? "");
  const [ePaidAt, setEPaidAt]     = useState(paidAt ? paidAt.slice(0, 10) : "");
  const [eNote, setENote]         = useState(note ?? "");
  const [err, setErr]             = useState<string | null>(null);

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amt = Number(eAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("amount ต้อง > 0"); return;
    }
    if (eKind === "other" && !eNote.trim()) {
      setErr("other ต้องมี note"); return;
    }

    startTransition(async () => {
      let paidAtIso: string | null | undefined = undefined;
      if (ePaidAt) {
        const dt = new Date(ePaidAt + "T00:00:00+07:00");
        if (!Number.isNaN(dt.getTime())) paidAtIso = dt.toISOString();
      } else if (paidAt && !ePaidAt) {
        // User cleared an existing date
        paidAtIso = null;
      }

      const res = await adminUpdateDisbursement({
        id,
        kind:        eKind,
        amount_thb:  amt,
        vendor_name: eVendor.trim(),
        invoice_no:  eInvoice.trim() === "" ? null : eInvoice.trim(),
        paid_at:     paidAtIso,
        note:        eNote.trim() === "" ? null : eNote.trim(),
      });
      if (res.ok) {
        setEditOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function doDelete() {
    const reason = window.prompt("เหตุผลที่ลบรายการนี้ (super only):");
    if (!reason || reason.trim().length < 3) return;
    startTransition(async () => {
      const res = await adminDeleteDisbursement({ id, reason: reason.trim() });
      if (res.ok) {
        router.refresh();
      } else {
        alert(`ลบไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditOpen((v) => !v)}
        className="text-[11px] underline text-primary-600 hover:text-primary-800"
        disabled={pending}
      >
        {editOpen ? "ปิด" : "แก้"}
      </button>
      <button
        type="button"
        onClick={doDelete}
        className="text-[11px] underline text-red-600 hover:text-red-800"
        disabled={pending}
      >
        ลบ
      </button>
      {editOpen && (
        <form
          onSubmit={saveEdit}
          className="absolute z-10 mt-8 ml-[-200px] w-72 rounded-lg border border-border bg-white dark:bg-surface p-3 shadow-xl space-y-2"
        >
          {err && <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{err}</div>}
          <label className="block text-[10px] space-y-0.5">
            <span>kind</span>
            <select
              value={eKind}
              onChange={(e) => setEKind(e.target.value as DisbursementKind)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] space-y-0.5">
            <span>amount (฿)</span>
            <input
              type="number" step="0.01" min="0"
              value={eAmount}
              onChange={(e) => setEAmount(e.target.value)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs font-mono"
            />
          </label>
          <label className="block text-[10px] space-y-0.5">
            <span>vendor</span>
            <input
              value={eVendor}
              onChange={(e) => setEVendor(e.target.value)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs"
            />
          </label>
          <label className="block text-[10px] space-y-0.5">
            <span>invoice_no</span>
            <input
              value={eInvoice}
              onChange={(e) => setEInvoice(e.target.value)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs font-mono"
            />
          </label>
          <label className="block text-[10px] space-y-0.5">
            <span>paid_at</span>
            <input
              type="date"
              value={ePaidAt}
              onChange={(e) => setEPaidAt(e.target.value)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs"
            />
          </label>
          <label className="block text-[10px] space-y-0.5">
            <span>note {eKind === "other" && <span className="text-red-700">*</span>}</span>
            <textarea
              value={eNote}
              onChange={(e) => setENote(e.target.value)}
              className="w-full rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs min-h-[40px]"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded bg-primary-500 text-white px-2 py-1 text-xs font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={pending}
              className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

"use client";

/**
 * <TaxdocDocModeEditor> — CS/Account override of the job's เอกสาร mode
 * (ใบกำกับ / ใบขน / ไม่รับเอกสาร). The mode is seeded from the order's
 * tax_doc_pref (P1) but may need correcting mid-workflow if the customer
 * changes their mind. SELECTION/ROUTING only — NEVER triggers issuance.
 *
 * Confirm-before-mutate (AGENTS.md §0f). Calls only adminSetCargoTaxdocMode.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { adminSetCargoTaxdocMode } from "@/actions/admin/cargo-taxdoc-workspace";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none",        label: "ยังไม่เลือก" },
  { value: "receipt",     label: "ไม่รับเอกสาร" },
  { value: "tax_invoice", label: "ใบกำกับภาษี (+VAT)" },
  { value: "customs",     label: "ใบขน (ในชื่อตัวเอง)" },
];

export function TaxdocDocModeEditor({
  jobId,
  docMode,
  canEdit,
}: {
  jobId: string;
  docMode: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(docMode);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  if (!canEdit) return null;

  async function onSave() {
    setErr(null);
    if (value === docMode) { setEditing(false); return; }
    const ok = await confirm(
      "เปลี่ยนโหมดเอกสารของงานนี้?\nเป็นการเลือก/route เท่านั้น · ไม่ยิงเอกสารจริง/เงิน/แจ้งเตือน · บันทึก audit.",
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminSetCargoTaxdocMode({ jobId, docMode: value });
      if (res.ok) { setEditing(false); router.refresh(); }
      else setErr(res.error);
    });
  }

  if (!editing) {
    return (
      <>
        {dialogs}
        <button type="button" onClick={() => setEditing(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary-700 hover:underline">
          <Pencil className="h-3 w-3" /> เปลี่ยนโหมดเอกสาร
        </button>
      </>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {dialogs}
      <select value={value} onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-xs">
        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" disabled={pending} onClick={onSave}
        className="rounded-md bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
        {pending ? "บันทึก…" : "บันทึก"}
      </button>
      <button type="button" disabled={pending} onClick={() => { setValue(docMode); setEditing(false); setErr(null); }}
        className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50">
        ยกเลิก
      </button>
      {err && <span className="text-[11px] text-red-600">⚠ {err}</span>}
    </span>
  );
}

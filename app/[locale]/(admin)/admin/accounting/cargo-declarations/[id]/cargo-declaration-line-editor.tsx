"use client";

/**
 * <CargoDeclarationLineEditor> — Docs's per-line edit on a CARGO ใบขนรวม:
 * the มูลค่าสำแดง (declared value) + HS code + duty rate%. P3 of the tax-invoice
 * platform.
 *
 * ⚠️ The declared value is a SENSITIVE, audited field (ADR-0016). It DEFAULTS
 * from the captured COST (mig 0158); Docs edits it DOWN per the value-engineering
 * plan. It must NEVER be auto-set from the selling price. Every save is
 * audit-logged server-side. This editor calls ONLY `setCargoDeclarationLine` —
 * it touches no money, no order status, no customer comms.
 *
 * Confirm-before-mutate (AGENTS.md §0f) via the repo's `useConfirmDialogs`.
 * Only rendered when the parent declaration is a draft AND the viewer can edit
 * (super/accounting/freight_import_doc/pricing) — the server action re-checks.
 *
 * Toggle-to-edit pattern mirrors components/admin/cargo-cost-line-editor.tsx.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { setCargoDeclarationLine } from "@/actions/admin/cargo-declarations";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const textInputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const btnSave =
  "rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50";
const btnCancel =
  "rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50";

function str(v: number | string | null | undefined): string {
  return v != null && Number(v) !== 0 ? String(v) : "";
}

export function CargoDeclarationLineEditor({
  lineId,
  declaredValueThb,
  dutyRatePct,
  hsCode,
}: {
  lineId: string;
  declaredValueThb: number | string | null;
  dutyRatePct: number | string | null;
  hsCode: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  const [declared, setDeclared] = useState<string>(str(declaredValueThb));
  const [dutyPct, setDutyPct] = useState<string>(str(dutyRatePct));
  const [hs, setHs] = useState<string>(hsCode ?? "");

  function resetDraft() {
    setDeclared(str(declaredValueThb));
    setDutyPct(str(dutyRatePct));
    setHs(hsCode ?? "");
  }

  async function onSave() {
    setErr(null);
    const ok = await confirm(
      "บันทึก มูลค่าสำแดง (ใบขน) ของรายการนี้?\n" +
        "⚠️ มูลค่าสำแดง = ค่าที่สำแดงต่อศุลกากร (ตั้งจากต้นทุน · ปรับลงตามแผน) — ห้ามใช้ราคาขาย.\n" +
        "ภายในเท่านั้น · ไม่กระทบเงิน/สถานะ/แจ้งเตือนลูกค้า · ทุกการแก้ไขถูกบันทึก audit",
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await setCargoDeclarationLine({
        lineId,
        declaredValueThb: declared,
        dutyRatePct: dutyPct,
        hsCode: hs,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  if (!editing) {
    return (
      <>
        {dialogs}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-primary-700 hover:underline"
        >
          <Pencil className="h-3 w-3" /> แก้สำแดง
        </button>
      </>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-2.5">
      {dialogs}
      {err && (
        <div className="mb-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">⚠ {err}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="space-y-0.5">
          <span className="block text-[10px] text-muted">มูลค่าสำแดง (฿)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={declared}
            onChange={(e) => setDeclared(e.target.value)}
            placeholder="0.00"
            className={inputCls}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-muted">อัตราอากร (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.001"
            inputMode="decimal"
            value={dutyPct}
            onChange={(e) => setDutyPct(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        </label>
        <label className="space-y-0.5">
          <span className="block text-[10px] text-muted">HS Code</span>
          <input
            type="text"
            maxLength={40}
            value={hs}
            onChange={(e) => setHs(e.target.value)}
            placeholder="เช่น 8471.30.20"
            className={textInputCls}
          />
        </label>
      </div>
      <p className="mt-1.5 text-[10px] text-amber-800/80">
        มูลค่าสำแดง ตั้งจากต้นทุน — ปรับลงตามแผนสำแดง · duty = สำแดง × อัตรา% · vat = (สำแดง + duty) × 7%
      </p>
      <div className="mt-1.5 flex gap-2">
        <button type="button" disabled={pending} className={btnSave} onClick={onSave}>
          {pending ? "กำลังบันทึก…" : "บันทึกสำแดง"}
        </button>
        <button
          type="button"
          disabled={pending}
          className={btnCancel}
          onClick={() => {
            resetDraft();
            setErr(null);
            setEditing(false);
          }}
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

"use client";

/**
 * <ForwarderStepRevert> — the reversible status-step controls (UNIT D · owner
 * 2026-06-19 · forwarder-collect-money-audit §#3).
 *
 * Owner: "ยกเลิก step5 → ถอยไป step4 · ทำ4เสร็จ→5→6 · ยกเลิกได้ · log หลังบ้าน".
 * Two small buttons:
 *   - "ถอยสถานะ 1 ขั้น"   → revertForwarderStep  (fstatus N → N-1)   · shown for fstatus 2-6
 *   - "ดันสถานะถัดไป"     → advanceForwarderStep (fstatus N → N+1)   · shown for fstatus 4-5
 *
 * §0f confirm-before-mutate: both buttons go through a styled confirm dialog
 * (these change the order lifecycle). The server action is the real guard
 * (money-safety + TOCTOU + RBAC) — this component is the entry point; the
 * integrator wires it into the detail page (do NOT mount it here).
 *
 * The server refuses unsafe steps with a clear Thai error (e.g. 6→5 on a paid
 * row); we surface that message inline. router.refresh() on success re-renders
 * the timeline + pills with the new status.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2, ChevronRight, AlertTriangle } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { revertForwarderStep, advanceForwarderStep } from "@/actions/admin/forwarder-step";

type Props = {
  fid: number;
  /** Current tb_forwarder.fstatus ('1'..'7' · '99'). */
  fstatus: string;
};

// Step labels (kept in-component · faithful to lib/admin/forwarder-status.ts
// FSTATUS_CFG · used only for the confirm-dialog copy).
const STEP_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

function labelOf(s: string): string {
  return STEP_LABEL[s] ?? s;
}

export function ForwarderStepRevert({ fid, fstatus }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const cur = String(fstatus ?? "").trim();
  const curInt = parseInt(cur, 10);

  // revert: only 2-6 (1→0 impossible, 7 shipped-irreversible, 99 special).
  const canRevert = Number.isInteger(curInt) && curInt >= 2 && curInt <= 6;
  // advance: only 4→5 and 5→6 (the owner's "ทำ4เสร็จ→5→6"). 6→7 = dispatch flow.
  const canAdvance = Number.isInteger(curInt) && curInt >= 4 && curInt <= 5;

  if (!canRevert && !canAdvance) return null;

  // NOTE: confirm() MUST run OUTSIDE startTransition. Awaiting the dialog inside
  // a transition makes the host's setReq a deprioritized transition update, so
  // the dialog never reliably opens → the button silently does nothing (the
  // owner-reported "ใช้ไม่ได้" 2026-06-22). Canonical pattern: await the UI
  // confirm first, then wrap ONLY the server action in startTransition.
  async function onRevert() {
    setError(null);
    const to = String(curInt - 1);
    const msg =
      `ถอยสถานะออเดอร์ #${fid} กลับ 1 ขั้น?\n\n` +
      `จาก “${labelOf(cur)}” → “${labelOf(to)}”\n\n` +
      `(ระบบจะบันทึก log หลังบ้าน · ถ้ารายการชำระเงินแล้ว ระบบจะไม่ให้ถอย)`;
    if (!(await confirm(msg))) return;
    startTransition(async () => {
      const res = await revertForwarderStep({ fid });
      if (!res.ok) {
        setError(res.error ?? "ถอยสถานะไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  async function onAdvance() {
    setError(null);
    const to = String(curInt + 1);
    const msg =
      `ดันสถานะออเดอร์ #${fid} ไปขั้นถัดไป?\n\n` +
      `จาก “${labelOf(cur)}” → “${labelOf(to)}”\n\n` +
      `(เปลี่ยนสถานะอย่างเดียว · ไม่เก็บเงิน/ไม่จัดส่ง · บันทึก log หลังบ้าน)`;
    if (!(await confirm(msg))) return;
    startTransition(async () => {
      const res = await advanceForwarderStep({ fid });
      if (!res.ok) {
        setError(res.error ?? "ดันสถานะไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canRevert && (
          <button
            type="button"
            onClick={onRevert}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-amber-950/30"
          >
            <Undo2 className="h-4 w-4" />
            {pending ? "กำลังบันทึก..." : "ถอยสถานะ 1 ขั้น"}
          </button>
        )}
        {canAdvance && (
          <button
            type="button"
            onClick={onAdvance}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "กำลังบันทึก..." : "ดันสถานะถัดไป"}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

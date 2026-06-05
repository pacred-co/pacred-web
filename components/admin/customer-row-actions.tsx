"use client";

/**
 * Per-row actions on `/admin/customers` — ดูรายละเอียด · Approve · ระงับ.
 *
 * Wave 23 P0 #3 (Task #156 · 2026-05-27 night): the red ⊘ "ระงับ" button
 * used to mutate `tb_users.userstatus → '0'` on a single bare click — Agent K
 * accidentally suspended PR10899 during yesterday's audit by misclicking.
 * We now gate BOTH Approve + ระงับ behind a confirm step:
 *   - Suspend → destructive (locks out an active customer immediately) →
 *     simple confirm dialog.
 *   - Approve → opens a PacredDialog where the admin can ALSO pick/change the
 *     assigned sales rep before confirming (owner 2026-06-05). Random round-
 *     robin stays the default; the picker lets staff hand a lead to another
 *     rep if the auto-picked one is busy. Confirm-before-mutate is preserved
 *     (the dialog IS the confirm step).
 * The "ดูรายละเอียด" eye button stays bare — it's a pure navigation, no
 * server mutation. Server-action errors are surfaced via the shared `alert()`
 * (per AGENTS.md §0c — never silent-swallow).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Eye, CheckCircle, Ban, Loader2 } from "lucide-react";
import { approveCustomer, suspendCustomer } from "@/actions/admin/customers";
import { listSalesAdmins, type SalesAdminOption } from "@/actions/admin/customer-profile";
import { useConfirmDialogs, PacredDialog, DialogFooter } from "@/components/ui/pacred-dialog";

type Props = {
  id: string;
  status: string;
  /** Current sales rep (tb_users.adminIDSale) — pre-selects the picker. */
  currentSalesRep?: string;
};

export function CustomerRowActions({ id, status, currentSalesRep }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  // Approve dialog (with sales-rep picker) state.
  const approveDialogRef = useRef<HTMLDialogElement>(null);
  const [reps, setReps] = useState<SalesAdminOption[] | null>(null);
  const [repsLoading, startReps] = useTransition();
  const [repsErr, setRepsErr] = useState<string | null>(null);
  const [selectedRep, setSelectedRep] = useState<string>(currentSalesRep ?? "");
  const [approveErr, setApproveErr] = useState<string | null>(null);

  function openApprove() {
    setApproveErr(null);
    setSelectedRep(currentSalesRep ?? "");
    approveDialogRef.current?.showModal();
    // Lazy-load the sales-rep pool the first time the dialog opens.
    if (reps === null && !repsLoading) {
      setRepsErr(null);
      startReps(async () => {
        const res = await listSalesAdmins();
        if (res.ok && res.data) setReps(res.data.rows);
        else setRepsErr(res.ok ? "ไม่พบเซลล์" : res.error);
      });
    }
  }

  function submitApprove() {
    setApproveErr(null);
    start(async () => {
      // Only send a rep override when the admin picked a DIFFERENT rep than the
      // one already on file — otherwise leave it to the server's round-robin /
      // keep-existing logic (passing the current rep would be a no-op anyway).
      const override =
        selectedRep && selectedRep !== (currentSalesRep ?? "")
          ? { salesRepId: selectedRep }
          : undefined;
      const res = await approveCustomer(id, override);
      if (!res.ok) {
        setApproveErr(`Approve ไม่สำเร็จ: ${res.error}`);
        return;
      }
      approveDialogRef.current?.close();
      router.refresh();
    });
  }

  async function handleSuspend() {
    const ok = await confirm(
      `ต้องการระงับลูกค้า ${id} จริงๆ?\n\nลูกค้าจะไม่สามารถ login เข้าระบบได้จนกว่าจะถูก Approve ใหม่.`,
    );
    if (!ok) return;
    start(async () => {
      const res = await suspendCustomer(id);
      if (!res.ok) await alert(`ระงับไม่สำเร็จ: ${res.error}`);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => router.push(`/admin/customers/${id}` as Parameters<typeof router.push>[0])}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-foreground transition-colors"
        title="ดูรายละเอียด"
      >
        <Eye className="h-4 w-4" />
      </button>

      {(status === "incomplete" || status === "suspended") && (
        <button
          type="button"
          disabled={pending}
          onClick={openApprove}
          className="flex h-7 items-center gap-1 rounded-lg bg-green-50 dark:bg-green-900/20 px-2 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50 transition-colors"
          title="Approve"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          Approve
        </button>
      )}

      {status === "active" && (
        <button
          type="button"
          disabled={pending}
          onClick={handleSuspend}
          className="flex h-7 items-center gap-1 rounded-lg bg-red-50 dark:bg-red-900/20 px-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors"
          title="ระงับ"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
          ระงับ
        </button>
      )}

      {/* Approve + sales-rep handoff dialog (confirm-before-mutate). */}
      <PacredDialog dialogRef={approveDialogRef} title={`Approve ลูกค้า ${id}`}>
        <div className="space-y-3 text-sm">
          <p className="text-gray-700">
            ลูกค้าจะกลับมาใช้งานระบบได้ทันที — ถ้าก่อนหน้านี้ถูกระงับโดยตั้งใจ การกดยืนยันจะยกเลิกการระงับนั้น.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              เซลล์ผู้ดูแล (เลือก/เปลี่ยนได้ — ค่าเริ่มต้นคือสุ่มอัตโนมัติ)
            </label>
            {repsLoading ? (
              <p className="text-xs text-muted">กำลังโหลดรายชื่อเซลล์…</p>
            ) : repsErr ? (
              <p className="text-xs text-red-700">โหลดรายชื่อเซลล์ไม่สำเร็จ: {repsErr}</p>
            ) : (
              <select
                value={selectedRep}
                disabled={pending}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— ใช้ค่าเดิม / สุ่มอัตโนมัติ —</option>
                {(reps ?? []).map((r) => (
                  <option key={r.adminID} value={r.adminID}>
                    {r.nickname ? `${r.nickname} · ` : ""}{r.name} ({r.adminID})
                  </option>
                ))}
              </select>
            )}
            {currentSalesRep ? (
              <p className="mt-1 text-[11px] text-muted">เซลล์ปัจจุบัน: <span className="font-mono">{currentSalesRep}</span></p>
            ) : null}
          </div>

          {approveErr && <p className="text-xs text-red-700">{approveErr}</p>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitApprove();
          }}
        >
          <DialogFooter
            onCancel={() => approveDialogRef.current?.close()}
            pending={pending}
            submitLabel="ยืนยัน Approve"
            pendingLabel="กำลังบันทึก..."
          />
        </form>
      </PacredDialog>

      {dialogs}
    </div>
  );
}

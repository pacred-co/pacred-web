"use client";

/**
 * <PurchaserCell> — per-order assigned purchaser (ผู้สั่งซื้อ) display + reassign
 * control (owner ④ · 2026-07-06 · mig 0241). Rendered inside the customer cell of
 * BOTH the ฝากสั่งซื้อ (/admin/service-orders) + ฝากนำเข้า (/admin/forwarders) rows.
 *
 *   - Always shows the assigned purchaser (member-code → name) or "ยังไม่มอบหมาย".
 *   - When `canReassign`, shows a "มอบหมาย/เปลี่ยนผู้สั่งซื้อ" control: a picker of
 *     ACTIVE admins + confirm-before-mutate (§0f) → assignOrderPurchaser.
 *
 * §0d — the control is inline on the row = ≤3 clicks reachable. A purchaser's
 * "งานของฉัน" needs no control — it's their auto-scoped list.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog, Loader2, Check } from "lucide-react";
import { assignOrderPurchaser } from "@/actions/admin/assign-order-purchaser";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { SalesAdminOption } from "@/actions/admin/customer-profile";

export function PurchaserCell({
  kind,
  orderNo,
  purchaserAdminId,
  purchaserName,
  canReassign,
  admins,
}: {
  kind: "shop" | "forwarder";
  /** shop → hno · forwarder → the numeric id (as string). */
  orderNo: string;
  /** The currently-assigned tb_admin.adminID · "" = ยังไม่มอบหมาย. */
  purchaserAdminId: string;
  /** Resolved display name for `purchaserAdminId` (member-code fallback). */
  purchaserName: string | null;
  /** True only for interpreter / purchaser_lead / ultra / super (server-gated too). */
  canReassign: boolean;
  /** Active admins for the picker (listActiveAdmins · empty when !canReassign). */
  admins: SalesAdminOption[];
}) {
  const router = useRouter();
  const { confirm, dialogs } = useConfirmDialogs();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(purchaserAdminId);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const currentLabel =
    purchaserAdminId && purchaserAdminId !== ""
      ? purchaserName || purchaserAdminId
      : null;

  function nameOf(adminId: string): string {
    if (!adminId) return "ยังไม่มอบหมาย";
    return admins.find((a) => a.adminID === adminId)?.name || adminId;
  }

  async function submit() {
    setErr(null);
    const isClear = choice === "";
    const msg = isClear
      ? "ยืนยันล้างผู้สั่งซื้อของออเดอร์นี้?"
      : `ยืนยันมอบหมายออเดอร์นี้ให้ผู้สั่งซื้อ: ${nameOf(choice)} ?`;
    if (!(await confirm(msg))) return;
    startTransition(async () => {
      const res = await assignOrderPurchaser({ kind, orderNo, purchaserAdminId: choice });
      if (!res.ok) {
        setErr(res.error || "มอบหมายไม่สำเร็จ");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-0.5">
      {/* Display line — always visible */}
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-muted">ผู้สั่งซื้อ:</span>
        {currentLabel ? (
          <span
            className="rounded-full border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700"
            title={`ผู้สั่งซื้อ (${purchaserAdminId})`}
          >
            {currentLabel}
          </span>
        ) : (
          <span className="text-amber-600">ยังไม่มอบหมาย</span>
        )}
        {canReassign && (
          <button
            type="button"
            onClick={() => {
              setChoice(purchaserAdminId);
              setErr(null);
              setOpen((v) => !v);
            }}
            className="inline-flex items-center gap-0.5 rounded border border-border bg-white px-1 py-0.5 text-[11px] text-primary-600 hover:bg-surface-alt"
            title="มอบหมาย / เปลี่ยนผู้สั่งซื้อ"
            aria-expanded={open}
          >
            <UserCog className="h-3 w-3" /> มอบหมาย
          </button>
        )}
      </div>

      {/* Reassign control — only when opened */}
      {canReassign && open && (
        <div className="mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-teal-200 bg-teal-50/50 p-1.5">
          <select
            aria-label="เลือกผู้สั่งซื้อ"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={pending}
            className="rounded-md border border-border bg-white px-1.5 py-1 text-[11px] dark:bg-surface"
          >
            <option value="">— ยังไม่มอบหมาย —</option>
            {admins.map((a) => (
              <option key={a.adminID} value={a.adminID}>
                {a.name}
                {a.nickname ? ` (${a.nickname})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-primary-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-40"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            บันทึก
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="rounded-md px-1.5 py-1 text-[11px] text-muted hover:text-foreground"
          >
            ยกเลิก
          </button>
          {err && <span className="w-full text-[11px] text-red-600">{err}</span>}
        </div>
      )}
      {dialogs}
    </div>
  );
}

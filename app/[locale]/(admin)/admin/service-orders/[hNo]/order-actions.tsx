"use client";

/**
 * Footer governance actions for the shop-order detail page (legacy
 * `update.php` L336-384 note form + L514-581 cancelOrder/deleteOrder
 * SweetAlert handlers + editIPC modal).
 *
 * Faithful WORKFLOW, Pacred UI. Each is an existing action:
 *   note        → adminAddOrderNote            (hnote + hnoteuser flag)
 *   cancel      → adminCancelOrder             (soft hStatus='6')
 *   hard delete → adminHardDeleteOrder         (super-only · irreversible)
 *   ipc reassign→ adminReassignOrderIpc        (adminidip · ล่ามจีน)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminAddOrderNote } from "@/actions/admin/service-orders-shop-workflow";
import {
  adminCancelOrder,
  adminHardDeleteOrder,
  adminReassignOrderIpc,
} from "@/actions/admin/service-orders-governance";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function OrderNoteForm({
  hNo,
  hnote,
  hnoteuser,
}: {
  hNo:       string;
  hnote:     string | null;
  hnoteuser: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(hnote ?? "");
  // Legacy hnoteuser: '1'=admin-only, '2'=customer+admin. Map to the action's
  // 0/1 visibility flag (1 = visible to customer).
  const [custVisible, setCustVisible] = useState(hnoteuser === "2" ? "1" : "0");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await adminAddOrderNote({
        hNo,
        hnote:     note.trim(),
        hnoteuser: custVisible === "1" ? "1" : "0",
      });
      if (res.ok) {
        setMsg("บันทึกหมายเหตุแล้ว");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSave} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">หมายเหตุ</h3>
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">ประเภทการแจ้งเตือน</span>
        <select className={inputCls} value={custVisible} onChange={(e) => setCustVisible(e.target.value)}>
          <option value="0">แอดมินเท่านั้น</option>
          <option value="1">ลูกค้าและแอดมิน</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">รายละเอียด</span>
        <span className="block text-[11px] text-red-600">
          หากแก้ไขสำเร็จแล้วให้ลบข้อความทิ้งแล้วกดบันทึก
        </span>
        <textarea
          rows={4}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
          placeholder="รายละเอียด"
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "กำลังบันทึก..." : "บันทึกหมายเหตุ"}
        </Button>
      </div>
    </form>
  );
}

export function OrderDangerZone({
  hNo,
  hstatus,
  adminIdCreate,
  superAdmin,
}: {
  hNo:           string;
  hstatus:       string;
  adminIdCreate: string | null;
  superAdmin:    boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ipcOpen, setIpcOpen] = useState(false);
  const [ipcId, setIpcId] = useState("");

  const cancelled = hstatus === "6";
  const completed = hstatus === "5";

  function onCancel() {
    if (!confirm(`ยกเลิกออเดอร์ ${hNo} ?`)) return;
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await adminCancelOrder({ h_no: hNo });
      if (res.ok) {
        setMsg(res.data?.already_cancelled ? "ออเดอร์นี้ถูกยกเลิกอยู่แล้ว" : "ยกเลิกออเดอร์แล้ว");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function onHardDelete() {
    if (!confirm(`ลบออเดอร์ ${hNo} ถาวร? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await adminHardDeleteOrder({ h_no: hNo });
      if (res.ok) {
        setMsg(`ลบถาวรแล้ว (${res.data?.deleted_lines ?? 0} รายการ) — กำลังกลับไปหน้ารายการ`);
        setTimeout(() => router.push("/admin/service-orders"), 1500);
      } else {
        setErr(res.error);
      }
    });
  }

  function onReassignIpc(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const id = ipcId.trim();
    if (!id) {
      setErr("กรอกรหัสล่ามจีน (adminID)");
      return;
    }
    startTransition(async () => {
      const res = await adminReassignOrderIpc({ h_no: hNo, admin_id_ip: id });
      if (res.ok) {
        setMsg(`เปลี่ยนล่ามจีนเป็น ${id} แล้ว`);
        setIpcOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">การจัดการออเดอร์</h3>
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {/* IPC reassign — legacy editIPC.php, only when no ล่ามจีน opened it */}
      {!adminIdCreate && (
        <div className="space-y-2">
          {!ipcOpen ? (
            <button
              type="button"
              onClick={() => setIpcOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              <UserCog className="h-3.5 w-3.5" /> แก้ไขล่ามดูแลออเดอร์
            </button>
          ) : (
            <form onSubmit={onReassignIpc} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-[11px] text-muted">รหัสล่ามจีน (adminID)</span>
                <input
                  className="rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm"
                  value={ipcId}
                  onChange={(e) => setIpcId(e.target.value)}
                  placeholder="เช่น admin_jeen"
                />
              </label>
              <button type="submit" disabled={pending} className="rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50">
                บันทึก
              </button>
              <button type="button" disabled={pending} onClick={() => setIpcOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt">
                ยกเลิก
              </button>
            </form>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending || cancelled || completed}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-40"
          title={completed ? "ออเดอร์เสร็จสมบูรณ์แล้ว" : cancelled ? "ยกเลิกแล้ว" : "ยกเลิกออเดอร์ (ย้อนกลับได้)"}
        >
          <Ban className="h-3.5 w-3.5" /> ยกเลิกการสั่งซื้อ
        </button>

        {superAdmin && (
          <button
            type="button"
            onClick={onHardDelete}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
            title="ลบถาวร (super เท่านั้น · ออเดอร์ที่ยังไม่ชำระ)"
          >
            <Trash2 className="h-3.5 w-3.5" /> ลบการสั่งซื้อถาวร
          </button>
        )}
      </div>
    </div>
  );
}

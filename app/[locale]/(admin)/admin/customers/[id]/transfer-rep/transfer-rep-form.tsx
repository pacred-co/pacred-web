"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminTransferSalesRep } from "@/actions/admin/admins";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Rep = { profile_id: string; display: string };

export function TransferRepForm({
  customerId,
  currentRepId,
  currentRepDisplay,
  reps,
}: {
  customerId:        string;
  currentRepId:      string | null;
  currentRepDisplay: string | null;
  reps:              Rep[];
}) {
  const router = useRouter();
  const [newRepId, setNewRepId] = useState<string>("");
  const [reason,   setReason]   = useState<string>("");
  const [confirm,  setConfirm]  = useState<boolean>(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState<boolean>(false);
  const [pending,  startTransition] = useTransition();

  // Filter the dropdown so admins can't "transfer to the same rep" by accident.
  const targetReps = reps.filter((r) => r.profile_id !== currentRepId);

  // Display the chosen new rep (or "ปล่อยลูกค้า" if unassigning)
  const newRep = newRepId === "" ? null : reps.find((r) => r.profile_id === newRepId) ?? null;
  const newRepLabel = newRepId === "__unassign__"
    ? "— ปล่อยลูกค้า (ไม่มีเซลล์ดูแล) —"
    : (newRep?.display ?? "—");

  function submit() {
    setError(null);
    if (!newRepId) {
      setError("กรุณาเลือกเซลล์ปลายทาง");
      return;
    }
    if (reason.trim().length < 3) {
      setError("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    if (!confirm) {
      setError("กรุณายืนยันการดำเนินการ");
      return;
    }
    startTransition(async () => {
      const res = await adminTransferSalesRep({
        customer_id:        customerId,
        new_sales_admin_id: newRepId === "__unassign__" ? null : newRepId,
        reason:             reason.trim(),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">โอนเซลล์เรียบร้อย</h2>
        <p className="text-sm text-green-700">
          ระบบส่ง notification ให้เซลล์เก่า เซลล์ใหม่ และลูกค้าแล้ว
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push(`/admin/customers/${customerId}`)}>
            กลับโปรไฟล์ลูกค้า
          </Button>
          <Button
            type="button"
            onClick={() => {
              setDone(false);
              setNewRepId("");
              setReason("");
              setConfirm(false);
            }}
          >
            โอนอีกครั้ง
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm space-y-4">
      <h2 className="font-bold text-sm">โอนลูกค้าไปยังเซลล์ใหม่</h2>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">
          เซลล์ปลายทาง <span className="text-red-600">*</span>
        </span>
        <select value={newRepId} onChange={(e) => setNewRepId(e.target.value)} className={inputCls}>
          <option value="">— เลือกเซลล์ปลายทาง —</option>
          <option value="__unassign__">— ปล่อยลูกค้า (ไม่มีเซลล์ดูแล) —</option>
          {targetReps.map((r) => (
            <option key={r.profile_id} value={r.profile_id}>
              {r.display}
            </option>
          ))}
        </select>
        {targetReps.length === 0 && (
          <span className="block text-xs text-muted">
            ไม่พบเซลล์อื่นที่ active — ต้องเพิ่ม role &quot;sales_admin&quot; ก่อน
          </span>
        )}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">
          เหตุผลในการโอน <span className="text-red-600">*</span>
        </span>
        <textarea
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={inputCls}
          placeholder="เช่น ลูกค้าขอเปลี่ยนเซลล์ / เซลล์เดิมลาออก / โอนเข้าทีมพิเศษ"
        />
        <span className="block text-xs text-muted text-right">
          {reason.length} / 500
        </span>
      </label>

      {/* Preview */}
      {newRepId && (
        <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 text-sm space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted">สรุปการโอน</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">จาก:</span>
            <span className="font-medium">{currentRepDisplay ?? "— ไม่มีเซลล์ดูแล —"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">ไป:</span>
            <span className="font-medium text-primary-700">{newRepLabel}</span>
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5" />
        <span>
          ข้าพเจ้ายืนยันการโอน — ระบบจะบันทึก audit log + ส่ง notification ให้ทุกฝ่ายที่เกี่ยวข้อง
        </span>
      </label>

      <Button
        type="button"
        onClick={submit}
        disabled={pending || !newRepId || reason.trim().length < 3 || !confirm}
        fullWidth
      >
        {pending ? "กำลังโอน..." : "โอนเซลล์"}
      </Button>
    </section>
  );
}

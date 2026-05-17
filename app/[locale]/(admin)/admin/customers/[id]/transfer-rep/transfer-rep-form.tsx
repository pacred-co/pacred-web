"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminTransferSalesRep } from "@/actions/admin/admins";
import { RepCombobox } from "./rep-combobox";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

// Phase C QoL #1: combobox replaces the dropdown. The page no longer needs
// to pre-fetch every sales-rep — staff types name/member_code/phone and
// hits `searchAdminsByQuery` for the top 10. The "ปล่อยลูกค้า (ไม่มีเซลล์
// ดูแล)" option moves to a small radio toggle, since the combobox can't
// represent "I want this to be NULL".

export function TransferRepForm({
  customerId,
  currentRepId,
  currentRepDisplay,
}: {
  customerId:        string;
  currentRepId:      string | null;
  currentRepDisplay: string | null;
}) {
  const router = useRouter();
  const [mode, setMode]       = useState<"assign" | "unassign">("assign");
  const [newRepId, setNewRepId]       = useState<string>("");
  const [newRepDisplay, setNewRepDisplay] = useState<string | null>(null);
  const [reason,   setReason]   = useState<string>("");
  const [confirm,  setConfirm]  = useState<boolean>(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState<boolean>(false);
  const [pending,  startTransition] = useTransition();

  // Exclude the current rep from the search results so admins can't
  // "transfer to the same rep" by accident.
  const excludeIds = currentRepId ? [currentRepId] : [];

  const summaryToLabel = mode === "unassign"
    ? "— ปล่อยลูกค้า (ไม่มีเซลล์ดูแล) —"
    : (newRepDisplay ?? "—");

  function submit() {
    setError(null);
    if (mode === "assign" && !newRepId) {
      setError("กรุณาเลือกเซลล์ปลายทาง (พิมพ์เพื่อค้น)");
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
        new_sales_admin_id: mode === "unassign" ? null : newRepId,
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
              setMode("assign");
              setNewRepId("");
              setNewRepDisplay(null);
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

      {/* Mode toggle: pick a new rep or unassign */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">รูปแบบการโอน</legend>
        <div className="flex flex-wrap gap-2">
          <label className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
            mode === "assign" ? "border-primary-500 bg-white" : "border-border bg-white/60"
          }`}>
            <input
              type="radio"
              name="mode"
              value="assign"
              checked={mode === "assign"}
              onChange={() => setMode("assign")}
            />
            <span>เลือกเซลล์ใหม่</span>
          </label>
          <label className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
            mode === "unassign" ? "border-primary-500 bg-white" : "border-border bg-white/60"
          }`}>
            <input
              type="radio"
              name="mode"
              value="unassign"
              checked={mode === "unassign"}
              onChange={() => { setMode("unassign"); setNewRepId(""); setNewRepDisplay(null); }}
            />
            <span>ปล่อยลูกค้า (ไม่มีเซลล์ดูแล)</span>
          </label>
        </div>
      </fieldset>

      {/* Rep combobox — only shown in assign mode */}
      {mode === "assign" && (
        <div className="space-y-1 text-sm">
          <label className="block font-medium">
            เซลล์ปลายทาง <span className="text-red-600">*</span>
          </label>
          <RepCombobox
            value={newRepId}
            onChange={(id, display) => { setNewRepId(id); setNewRepDisplay(display); }}
            excludeIds={excludeIds}
            selectedLabel={newRepDisplay}
            disabled={pending}
          />
        </div>
      )}

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
      {(mode === "unassign" || newRepId) && (
        <div className="rounded-lg border border-border bg-white dark:bg-surface p-3 text-sm space-y-1">
          <div className="text-xs uppercase tracking-wider text-muted">สรุปการโอน</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">จาก:</span>
            <span className="font-medium">{currentRepDisplay ?? "— ไม่มีเซลล์ดูแล —"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">ไป:</span>
            <span className="font-medium text-primary-700">{summaryToLabel}</span>
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
        disabled={pending || (mode === "assign" && !newRepId) || reason.trim().length < 3 || !confirm}
        fullWidth
      >
        {pending ? "กำลังโอน..." : "โอนเซลล์"}
      </Button>
    </section>
  );
}

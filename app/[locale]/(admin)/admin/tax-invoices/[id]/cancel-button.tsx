"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelTaxInvoice } from "@/actions/admin/tax-invoices";

/**
 * Admin "ยกเลิกใบกำกับภาษี" button — irreversible (RD Code 86).
 *
 * UX same shape as IssueButton (G2c) — 2-step confirmation. Difference:
 * cancellation requires a REASON (Zod min 3 chars), so the confirmation
 * panel shows a textarea before the firing button.
 *
 * After cancel:
 *   - Original PDF stays in Storage (download route re-renders with
 *     watermark for cancelled status — never deletes).
 *   - Customer can request a fresh tax invoice for the same order
 *     (G2b idempotency uses .neq("status","cancelled")).
 */

export function CancelButton({ id, status }: { id: string; status: "pending" | "issued" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function fire() {
    setErr(null);
    if (reason.trim().length < 3) {
      setErr("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await cancelTaxInvoice({ id, reason: reason.trim() });
      if (res.ok) {
        router.refresh();
        setConfirming(false);
        setReason("");
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-red-200 bg-white text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50"
        >
          ❌ ยกเลิกใบกำกับภาษี{status === "issued" ? "" : " (รอดำเนินการ)"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-300 bg-white p-4 space-y-3">
      <p className="text-sm font-bold text-red-900">⚠️ ยืนยันยกเลิกใบกำกับภาษี?</p>
      {status === "issued" ? (
        <ul className="text-xs text-red-800 list-disc pl-5 space-y-0.5">
          <li>เลขที่จะถูกประทับ &quot;CANCELLED&quot; ใน PDF (ลายน้ำทแยง)</li>
          <li>เลขที่ <span className="font-bold">ไม่นำกลับมาใช้ใหม่</span> (เลขจะมี gap ในระบบ)</li>
          <li>ลูกค้าสามารถขอใบใหม่ได้จากหน้าใบเสร็จ — จะได้เลขใหม่</li>
          <li>ระบบจะแจ้งเตือนลูกค้าทราบ</li>
        </ul>
      ) : (
        <ul className="text-xs text-red-800 list-disc pl-5 space-y-0.5">
          <li>ใบนี้ยังไม่ออกเลขที่ — การยกเลิกเป็นการปฏิเสธคำขอ</li>
          <li>ลูกค้าสามารถส่งคำขอใหม่ได้</li>
          <li>(ไม่มีการแจ้งเตือนอัตโนมัติ — แนะนำให้ติดต่อลูกค้าทาง LINE/โทรเอง)</li>
        </ul>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium">เหตุผล <span className="text-red-500">*</span></span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          placeholder="เช่น: เลขประจำตัวผู้เสียภาษีผิด · ที่อยู่ไม่ตรงกับเอกสาร · ลูกค้าขอแก้รายการ"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
        />
      </label>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "กำลังยกเลิก..." : "✓ ยืนยันยกเลิก"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setErr(null); setReason(""); }}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          กลับ
        </button>
      </div>
    </div>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed")) return `บันทึกไม่สำเร็จ: ${code}`;
  switch (code) {
    case "not_found":         return "ไม่พบใบกำกับภาษี";
    case "already_cancelled": return "ใบนี้ถูกยกเลิกแล้ว";
    default:                  return code;
  }
}

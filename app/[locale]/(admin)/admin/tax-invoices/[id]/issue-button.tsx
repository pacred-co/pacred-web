"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueTaxInvoice } from "@/actions/admin/tax-invoices";

/**
 * Admin "ออกใบกำกับภาษี" button — irreversible action.
 *
 * Two-step UX:
 *   1. Click "ออกใบกำกับภาษี" → confirmation panel appears
 *   2. Click "ยืนยันออกใบ" → fires server action
 *
 * Why two-step instead of native confirm():
 *   - Mobile-friendly (native confirm() is awkward on touch)
 *   - Bigger surface for the warning copy ("ห้ามแก้ไขภายหลัง")
 *   - Easier to disable while in-flight without flicker
 */

export function IssueButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await issueTaxInvoice({ id });
      if (res.ok) {
        // Page revalidates server-side; refresh to pick up issued state
        router.refresh();
        setConfirming(false);
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
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          📄 ออกใบกำกับภาษี
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-yellow-300 bg-white p-4 space-y-3">
      <p className="text-sm font-bold text-yellow-900">⚠️ ยืนยันออกใบกำกับภาษี?</p>
      <p className="text-xs text-yellow-800">
        ระบบจะจองเลขที่ + สร้าง PDF + lock ข้อมูล —
        <span className="font-bold"> แก้ไขภายหลังไม่ได้</span>
      </p>
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังออกใบ..." : "✓ ยืนยันออกใบ"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setErr(null); }}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function translateError(code: string): string {
  if (code.startsWith("serial_reserve_failed")) return `จองเลขที่ไม่สำเร็จ: ${code}`;
  if (code.startsWith("pdf_render_failed"))     return `สร้าง PDF ไม่สำเร็จ: ${code}`;
  if (code.startsWith("pdf_upload_failed"))     return `อัพโหลด PDF ไม่สำเร็จ: ${code}`;
  if (code.startsWith("update_failed"))         return `อัพเดทสถานะไม่สำเร็จ: ${code}`;
  switch (code) {
    case "not_found":      return "ไม่พบใบกำกับภาษี";
    case "already_issued": return "ใบนี้ออกแล้ว";
    case "cancelled":      return "ใบนี้ถูกยกเลิกแล้ว";
    case "zero_total":     return "ยอดเงินเป็น 0 — ออกใบกำกับภาษีไม่ได้";
    case "no_lines":       return "ไม่มีรายการในใบ — กรุณาเพิ่มรายการก่อน";
    default:               return code;
  }
}

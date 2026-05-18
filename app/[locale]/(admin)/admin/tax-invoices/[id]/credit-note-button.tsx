"use client";

/**
 * G2e-2 (R3) — "ออกใบลดหนี้" button.
 *
 * Renders on the admin tax invoice detail page ONLY when:
 *   - Invoice status = 'cancelled'
 *   - Invoice was previously 'issued' (has a serial_no)
 *   - No credit_note_id yet (one credit note per cancelled invoice)
 *
 * Calls actions/admin/tax-invoices.tsx:issueCreditNote → creates a NEW
 * tax_invoices row with credit_note_for_id = original.id + new serial +
 * PDF rendered with "ใบลดหนี้" header + reason banner.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import { issueCreditNote } from "@/actions/admin/tax-invoices";

interface Props {
  originalInvoiceId: string;
  originalSerial: string;
  totalThb: number;
}

export function CreditNoteButton({ originalInvoiceId, originalSerial, totalThb }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fire() {
    setErr(null);
    if (reason.trim().length < 3) {
      setErr("กรุณาระบุเหตุผลในการออกใบลดหนี้อย่างน้อย 3 ตัวอักษร");
      return;
    }
    startTransition(async () => {
      const res = await issueCreditNote({
        originalInvoiceId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setErr(translateErr(res.error));
        return;
      }
      router.refresh();
      setConfirming(false);
      setReason("");
    });
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
        >
          <FileText className="w-3.5 h-3.5" />
          📝 ออกใบลดหนี้ (Credit Note)
        </button>
        <p className="text-[10px] text-muted">
          สำหรับเคสคืนเงินจริง — ออกใบลดหนี้ทางบัญชี (ไม่ใช่แค่แก้ typo)
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
          📝 ยืนยันออกใบลดหนี้?
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
          ออกใบลดหนี้ (ใบลดหนี้ / Credit Note) เพื่อยกเลิกใบกำกับภาษีเลขที่{" "}
          <span className="font-mono font-bold">{originalSerial}</span>{" "}
          (ยอด ฿{totalThb.toLocaleString("th-TH")}) ทางบัญชีอย่างเป็นทางการ
        </p>
      </div>
      <ul className="text-[11px] text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-0.5">
        <li>ใบลดหนี้จะมี <strong>เลขที่ใหม่</strong> + อ้างอิงใบเดิม</li>
        <li>PDF จะ render หัวข้อ &quot;ใบลดหนี้ / CREDIT NOTE&quot; พร้อมเหตุผล</li>
        <li>ลูกค้าจะได้รับแจ้งเตือนทันที (เห็นในหน้าใบเสร็จ)</li>
        <li>การกระทำนี้ <strong>ออกครั้งเดียว</strong> — ออกซ้ำไม่ได้</li>
      </ul>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-amber-900 dark:text-amber-100">
          เหตุผลในการออกใบลดหนี้ <span className="text-red-500">*</span>
        </span>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
          maxLength={500}
          placeholder="เช่น: คืนเงินบางส่วน · ลูกค้าได้รับสินค้าไม่ครบ · ปรับยอดตามที่ตกลงใหม่"
          className="w-full rounded-lg border border-amber-300 bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
        <p className="text-[10px] text-muted">{reason.length} / 500 ตัวอักษร</p>
      </label>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-2 text-xs text-red-800 dark:text-red-200">
          ⚠ {err}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending || reason.trim().length < 3}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          {pending ? "กำลังออก..." : "✓ ยืนยันออกใบลดหนี้"}
        </button>
        <button
          type="button"
          onClick={() => { setConfirming(false); setErr(null); setReason(""); }}
          disabled={pending}
          className="rounded-lg border border-border bg-white dark:bg-surface px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          กลับ
        </button>
      </div>
    </div>
  );
}

function translateErr(code: string): string {
  if (code.startsWith("original_must_be_cancelled")) {
    return "ใบกำกับภาษีต้นฉบับต้องอยู่ในสถานะ 'cancelled' ก่อน — ยกเลิกใบเดิมก่อน";
  }
  if (code === "original_was_never_issued") {
    return "ใบกำกับภาษีต้นฉบับยังไม่เคย issued — ออกใบลดหนี้ไม่ได้";
  }
  if (code === "credit_note_already_issued") {
    return "ใบกำกับภาษีนี้มีใบลดหนี้แล้ว — ออกซ้ำไม่ได้";
  }
  if (code.startsWith("serial_reserve_failed")) {
    return "จองเลขที่ใหม่ไม่สำเร็จ — ลองอีกครั้ง";
  }
  if (code.startsWith("credit_note_insert_failed")) {
    return `บันทึกใบลดหนี้ไม่สำเร็จ: ${code.replace("credit_note_insert_failed:", "").trim()}`;
  }
  if (code === "not_found") return "ไม่พบใบกำกับภาษี";
  return `เกิดข้อผิดพลาด: ${code}`;
}

"use client";

/**
 * <CntPaySlipPanel> — single-container cnt-payment WITH slip image.
 *
 * Faithful port of report-cnt.php L741-808 (the `?id=<cabinet>` drill-down
 * `add` POST handler). DISTINCT from the bulk /admin/report-cnt/pay flow —
 * this pays the ONE container the admin is currently viewing and attaches a
 * bank-slip IMAGE (jpg/png), not the bulk path's PDF.
 *
 * Calls `adminCreateCntPaymentSingle` (actions/admin/cnt-payment.ts) →
 * writes tb_cnt (cntimagesslip) + tb_cnt_pay_idorco/trackingchn + tb_cnt_item.
 *
 * Rendered as a collapsible panel on the container detail page (§0d
 * reachability) — visible only to money-tier roles when the container is
 * NOT yet paid.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { adminCreateCntPaymentSingle } from "@/actions/admin/cnt-payment";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { confirm } from "@/components/ui/confirm";

export function CntPaySlipPanel({
  fCabinetNumber,
  suggestedAmount,
}: {
  fCabinetNumber: string;
  /** Container cost total — pre-fills the amount box (admin can override). */
  suggestedAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    const fd = new FormData(e.currentTarget);
    const slip = (fd.get("cntImagesSlip") as File | null) ?? null;
    if (!slip || slip.size === 0) {
      setError("กรุณาเลือกรูปสลิปการโอนเงิน");
      return;
    }
    const input = {
      cabinetNumber: fCabinetNumber,
      cntAmount:     Number(fd.get("cntAmount") ?? 0),
    };
    // §0f confirm-before-mutate (audit 2026-06-18) — files a tb_cnt payment
    // record (money path) + attaches the slip for this container.
    const ok = await confirm(
      `ยืนยันบันทึกจ่ายเงินค่าตู้ ${fCabinetNumber} · ฿${input.cntAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ?`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminCreateCntPaymentSingle(input, slip);
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setOkMsg("บันทึกรายการจ่ายเงินค่าตู้ + แนบสลิปเรียบร้อย");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
      >
        <Receipt className="h-3.5 w-3.5" />
        จ่ายเงินค่าตู้ + แนบสลิป
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-2xl border border-green-200 bg-green-50/60 dark:bg-green-900/10 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Receipt className="h-4 w-4 text-green-600" />
          จ่ายเงินค่าตู้ <span className="font-mono text-green-700">{fCabinetNumber}</span>
        </h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-foreground">
          ปิด
        </button>
      </div>
      <label className="block">
        <span className="text-xs text-muted">ยอดเงินที่จ่าย (บาท)</span>
        <input
          name="cntAmount"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={suggestedAmount > 0 ? suggestedAmount.toFixed(2) : ""}
          className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <div className="block">
        <span className="text-xs text-muted">รูปสลิปการโอนเงิน</span>
        <div className="mt-1">
          <StyledFileInput
            name="cntImagesSlip"
            accept="image/png,image/jpeg"
            required
            label="แนบสลิปการโอน (คลิกเพื่อเลือกรูป)"
            hint="รองรับไฟล์ PNG หรือ JPEG"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}
      {okMsg && (
        <div className="rounded-md border border-green-300 bg-green-100 p-2 text-xs text-green-800">{okMsg}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังบันทึก..." : "บันทึกการจ่ายเงิน"}
      </button>
    </form>
  );
}

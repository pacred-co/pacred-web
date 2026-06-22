"use client";

/**
 * B2 (2026-06-22) — shop-disbursement pay-out form. Attach the transfer slip
 * + confirm → flips the batch '1' (รอดำเนินการ) → '2' (จ่ายแล้ว) via
 * markShopDisbursementPaid. Mirrors the sales-payout pay form. §0f confirm-
 * before-mutate; styled file input; clear error/success.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markShopDisbursementPaid } from "@/actions/admin/shop-disbursement";
import { confirm } from "@/components/ui/confirm";

export function ShopDisbursementPayForm({ id, amount }: { id: number; amount: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit() {
    setErr(null);
    if (!file) {
      setErr("กรุณาแนบสลิปการโอนก่อนยืนยัน");
      return;
    }
    const ok = await confirm(
      `ยืนยันการจ่ายเงิน ฿${amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} และปิดรายการนี้เป็น "จ่ายแล้ว"?`,
    );
    if (!ok) return;
    startTransition(async () => {
      const fd = { id };
      const res = await markShopDisbursementPaid(fd, file);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
      <p className="text-sm font-bold text-emerald-800">ยืนยันจ่ายเงิน (ปิดรายการ)</p>
      <p className="text-xs text-muted">แนบสลิปการโอน แล้วกดยืนยัน — สถานะจะเปลี่ยนเป็น &quot;จ่ายแล้ว&quot;</p>
      <label className="block">
        <span className="text-xs font-medium text-foreground">หลักฐานการโอน (สลิป)</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-4 file:py-2 file:text-white file:font-medium hover:file:bg-primary-700"
        />
      </label>
      {err ? <p className="text-xs font-medium text-rose-600">⚠️ {err}</p> : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || !file}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 transition-colors"
      >
        {pending ? "กำลังบันทึก…" : "✓ ยืนยันจ่ายเงิน"}
      </button>
    </div>
  );
}

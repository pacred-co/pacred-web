"use client";

/**
 * Quote form (hstatus '1' → '2') · P0-13 Phase 1.
 *
 * Mounted in legacy-view.tsx ONLY when hstatus = '1' (รอดำเนินการ).
 * Calls `adminQuoteShopOrder` to:
 *   - UPDATE tb_header_order: hstatus='2', htotalpriceuser=…,
 *     hdatepayment=NOW+5d, hdate2=now, adminidupdate, hdateupdate
 *   - Optional: hshippingservice, hcostallth, hnote
 *   - Notify (4-CH: in-app + LINE OA + email + SMS)
 *
 * Admin types the THB price + optional shipping/cost fields + clicks
 * "ตั้งราคา + แจ้งชำระ" — customer immediately gets a payment-link
 * notification with the 5-day deadline.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminQuoteShopOrder } from "@/actions/admin/service-orders-shop-workflow";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function AdminQuoteShopOrderForm({
  hNo,
  totalCny,
  hrate,
}: {
  hNo: string;
  totalCny: number;
  hrate: number;
}) {
  const router = useRouter();
  const [thb, setThb] = useState<string>(() => {
    // Pre-fill: total CNY × rate, rounded to 2 dp. Admin can adjust before submit.
    const est = totalCny > 0 && hrate > 0 ? +(totalCny * hrate).toFixed(2) : 0;
    return est > 0 ? String(est) : "";
  });
  const [shippingService, setShippingService] = useState<string>("");
  const [costAllTh, setCostAllTh] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);

    const totalThb = Number(thb);
    if (!Number.isFinite(totalThb) || totalThb <= 0) {
      setError("กรอกยอด THB ที่ถูกต้อง (> 0)");
      return;
    }
    const shipFee = shippingService.trim().length > 0 ? Number(shippingService) : undefined;
    const costThb = costAllTh.trim().length > 0 ? Number(costAllTh) : undefined;
    if (shipFee !== undefined && (!Number.isFinite(shipFee) || shipFee < 0)) {
      setError("ค่าบริการต้องเป็นตัวเลข ≥ 0");
      return;
    }
    if (costThb !== undefined && (!Number.isFinite(costThb) || costThb < 0)) {
      setError("ต้นทุนต้องเป็นตัวเลข ≥ 0");
      return;
    }

    startTransition(async () => {
      const res = await adminQuoteShopOrder({
        hNo,
        htotalpriceuser:  totalThb,
        hshippingservice: shipFee,
        hcostallth:       costThb,
        hnote:            note.trim().length > 0 ? note : undefined,
      });
      if (res.ok) {
        const dl = res.data?.hdatepayment
          ? new Date(res.data.hdatepayment).toLocaleDateString("th-TH")
          : "+5 วัน";
        setMsg(`✅ ตั้งราคาเรียบร้อย — ลูกค้าได้รับแจ้งเตือนให้ชำระ฿${totalThb.toLocaleString()} ภายในวันที่ ${dl}`);
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/20 p-4 shadow-sm space-y-3"
    >
      <div>
        <h3 className="font-bold text-sm">ตั้งราคา + แจ้งชำระเงิน (Tab 2 · 1→2)</h3>
        <p className="text-xs text-muted mt-0.5">
          กรอกยอด THB สุทธิ — ลูกค้าจะได้รับ in-app + LINE OA + email + SMS พร้อมกำหนดชำระภายใน 5 วัน
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ยอดสุทธิ THB *</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            value={thb}
            onChange={(e) => setThb(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
          {totalCny > 0 && hrate > 0 && (
            <span className="text-[10px] text-muted">
              CNY ฿{totalCny.toLocaleString()} × {hrate} = ฿{(totalCny * hrate).toFixed(2)} (อัตราอัตโนมัติ · แก้ได้)
            </span>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ค่าบริการ THB</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={shippingService}
            onChange={(e) => setShippingService(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium">ต้นทุน THB (ภายใน · optional)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={costAllTh}
            onChange={(e) => setCostAllTh(e.target.value)}
            className={inputCls}
            placeholder="0.00"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium">หมายเหตุ (admin · optional)</span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder="หมายเหตุภายใน เช่น เหตุผลปรับราคา"
          />
        </label>
      </div>

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "กำลังบันทึก..." : "💴 ตั้งราคา + แจ้งชำระ"}
      </Button>

      <p className="text-[10px] text-muted leading-relaxed">
        ✅ UPDATE tb_header_order: hstatus=2 · htotalpriceuser · hdatepayment=NOW+5d · hdate2 · adminidupdate
        · 4-CH NOTIFY (in-app + LINE OA + email + SMS)
      </p>
    </form>
  );
}

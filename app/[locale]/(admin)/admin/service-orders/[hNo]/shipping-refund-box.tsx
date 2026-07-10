"use client";

/**
 * fix #3 (2026-07-10) — ปรับลดค่าส่งจีน (hshippingchn) + คืนเงินส่วนต่าง.
 *
 * When items are removed / the shipment shrinks, staff reduce the china
 * shipping. The reduced delta is refunded to the customer's wallet at the
 * ORDER rate (same money model as the per-item refund) and the header net
 * total recomputes so front (customer) + back (admin) agree. Staff type the
 * new ค่าส่งจีน; the money math (Δ¥ × order rate) is automatic.
 *
 * REDUCE-ONLY (a shipping increase = a re-charge, not this refund). Confirm
 * before write (§0f). Self-hides at not-paid / cancelled statuses and when
 * there is no shipping to refund. Calls `adminRefundShopOrderShipping`.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { adminRefundShopOrderShipping } from "@/actions/admin/service-orders-refund";

// roundUp(x,2) — mirror the server so the ฿ preview matches the credit.
function bahtFromCny(cnyAmount: number, hrate: number): number {
  const v = cnyAmount * hrate;
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}

export function ShippingRefundBox({
  hNo,
  hstatus,
  currentShippingChn,
  orderHrate,
}: {
  hNo: string;
  hstatus: string;
  currentShippingChn: number;
  orderHrate: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(String(currentShippingChn ?? 0));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Post-payment paid only (mirror the per-item refund server gate) + only when
  // there IS shipping to refund.
  const allowed = new Set(["3", "4", "5"]);
  if (!allowed.has(hstatus)) return null;
  if (!(currentShippingChn > 0)) return null;
  if (!(orderHrate > 0)) return null;

  const next = Number(val) || 0;
  const deltaCny = Math.round((currentShippingChn - next) * 100) / 100;
  const refundThb = bahtFromCny(Math.max(0, deltaCny), orderHrate);
  const canFire = deltaCny > 0 && reason.trim().length > 0 && next >= 0;

  function fire() {
    setErr(null);
    setOk(null);
    if (deltaCny <= 0) {
      setErr("ค่าส่งจีนใหม่ต้องน้อยกว่าเดิม (เมนูนี้ใช้ปรับลด/คืนเงิน)");
      return;
    }
    if (!reason.trim()) {
      setErr("กรุณากรอกเหตุผลคืนเงิน");
      return;
    }
    if (
      !window.confirm(
        `ยืนยันปรับลดค่าส่งจีน ¥${currentShippingChn.toLocaleString("th-TH", { minimumFractionDigits: 2 })} → ¥${next.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\nคืนเงินเข้ากระเป๋าลูกค้า ฿${refundThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await adminRefundShopOrderShipping({
        h_no: hNo,
        new_hshippingchn: next,
        reason: reason.trim(),
      });
      if (res.ok) {
        setOk(
          `คืนค่าส่งจีน ฿${res.data?.refundAmountThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })} เข้ากระเป๋าลูกค้าแล้ว · ยอดใหม่ ฿${res.data?.newWalletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
        );
        setReason("");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-50/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-200 text-amber-800">
          <Truck className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">🚚 ปรับลดค่าส่งจีน + คืนเงิน</p>
          <p className="text-[11px] text-amber-800">
            เมื่อสินค้าถูกลบ/ค่าส่งเปลี่ยน — ใส่ค่าส่งจีนใหม่ ระบบคืนส่วนต่างเข้ากระเป๋า (คิดที่เรทออเดอร์)
          </p>
        </div>
      </div>

      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
      {ok && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{ok}</div>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-[11px] text-muted">
            ค่าส่งจีนปัจจุบัน: <span className="font-mono font-semibold text-foreground">¥{currentShippingChn.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-muted">ใหม่ ¥</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              disabled={pending}
              className="w-36 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-right text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-60"
              placeholder="0.00"
            />
          </div>
        </label>
        <div className="text-xs text-muted">
          ส่วนต่าง <span className="font-mono">¥{Math.max(0, deltaCny).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          <span className="block font-semibold text-amber-700">คืน ฿{refundThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted">เหตุผล (จำเป็น · เก็บใน audit)</span>
        <input
          className="w-full rounded border px-2 py-1.5 text-xs"
          placeholder="เช่น สินค้าถูกลบ ค่าส่งจีนลดลง"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={pending}
        />
      </label>

      <button
        type="button"
        onClick={fire}
        disabled={pending || !canFire}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "กำลังคืนเงิน…" : `ยืนยันคืน ฿${refundThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
      </button>
    </section>
  );
}

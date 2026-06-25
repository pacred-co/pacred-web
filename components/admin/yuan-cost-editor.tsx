"use client";

/**
 * <YuanCostEditor> — edit the REAL yuan cost (ต้นทุนหยวนจริง) on a tb_payment row.
 *
 * owner 2026-06-25 (YUAN lane · [[cost-editable-sell-locked]]): the cost rate the
 * accountant actually paid for the yuan can differ from the auto-captured
 * hRateCostDefault, and it must be CORRECTABLE at ANY status — even after the
 * payment is approved/settled/refunded — without touching what the customer paid
 * (SELL = paythb/payrate, locked). Calls adminUpdateYuanPayment({id, cost_rate});
 * the server re-derives paythbcost (= payyuan × rate) + payprofitthb. §0f confirm.
 *
 * Render ONLY for cost-visibility roles (the [id] page already gates via
 * canViewCostProfit before mounting this).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateYuanPayment } from "@/actions/admin/yuan-payments";
import { confirm } from "@/components/ui/confirm";

const baht = (n: number | null | undefined) =>
  n == null ? "—" : `฿${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function YuanCostEditor({
  id,
  payYuan,
  payThb,
  payRateCost,
  payThbCost,
  payProfitThb,
}: {
  id: number;
  payYuan: number;
  payThb: number;
  payRateCost: number | null;
  payThbCost: number | null;
  payProfitThb: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(payRateCost != null ? String(payRateCost) : "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rateNum = Number(rate);
  const validRate = Number.isFinite(rateNum) && rateNum > 0;
  const previewCost = validRate ? Math.round(payYuan * rateNum * 100) / 100 : null;
  const previewProfit = previewCost != null ? Math.round((payThb - previewCost) * 100) / 100 : null;

  async function onSave() {
    setErr(null);
    if (!validRate) {
      setErr("ใส่เรทต้นทุน (หยวน→บาท) มากกว่า 0");
      return;
    }
    const ok = await confirm(
      `บันทึกต้นทุนหยวนจริง?\n\n` +
        `เรททุน ${rateNum} (หยวน→บาท)\n` +
        `→ ต้นทุน ${baht(previewCost)} · กำไร ${baht(previewProfit)}\n\n` +
        `แก้ได้ทุกสถานะ · ไม่กระทบยอดที่ลูกค้าจ่าย (฿${payThb.toLocaleString("th-TH")})`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminUpdateYuanPayment({ id, cost_rate: rateNum });
      if (!res.ok) {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-amber-800">ต้นทุนหยวนจริง</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
          >
            ✏️ แก้ต้นทุน
          </button>
        </div>
        <div className="mt-1 text-amber-900/80">
          เรททุน {payRateCost != null ? payRateCost : "—"} · ต้นทุน {baht(payThbCost)} · กำไร {baht(payProfitThb)}
        </div>
        <p className="mt-1 text-[11px] text-amber-700/70">แก้ได้ทุกสถานะ · ไม่กระทบยอดลูกค้า</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-2.5 text-xs">
      {err && <div className="mb-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">⚠ {err}</div>}
      <label className="block">
        <span className="font-medium text-amber-800">เรทต้นทุน (หยวน → บาท)</span>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={pending}
          autoFocus
          className="mt-1 w-full rounded border border-amber-300 px-2 py-1 text-sm disabled:opacity-50"
        />
      </label>
      <div className="mt-1.5 text-amber-900/80">
        หยวน {payYuan.toLocaleString("th-TH")} × {validRate ? rateNum : "—"} = ต้นทุน <b>{baht(previewCost)}</b> · กำไร <b>{baht(previewProfit)}</b>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !validRate}
          className="rounded bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "บันทึกต้นทุน"}
        </button>
        <button
          type="button"
          onClick={() => { setEditing(false); setRate(payRateCost != null ? String(payRateCost) : ""); setErr(null); }}
          disabled={pending}
          className="rounded border border-amber-300 px-3 py-1 text-[11px] font-medium hover:bg-amber-100 disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

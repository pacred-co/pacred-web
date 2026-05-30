"use client";

/**
 * P0-19 — Admin pay-on-behalf client form.
 * Search a customer → show wallet balance + unpaid ฝากสั่ง orders →
 * select → debit the customer's wallet for the selected orders.
 */

import { useState, useTransition } from "react";
import {
  getPayUserContext,
  adminPayOrdersOnBehalf,
  type PayUserContext,
  type PayOnBehalfResult,
} from "@/actions/admin/pay-user";

function thb(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayUserClient() {
  const [code, setCode] = useState("");
  const [ctx, setCtx] = useState<PayUserContext | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<PayOnBehalfResult | null>(null);
  const [searching, startSearch] = useTransition();
  const [paying, startPay] = useTransition();

  function search() {
    setErr(null);
    setResult(null);
    setCtx(null);
    setSelected(new Set());
    const c = code.trim();
    if (!c) { setErr("กรุณากรอกรหัสลูกค้า (เช่น PR124)"); return; }
    startSearch(async () => {
      const res = await getPayUserContext(c);
      if (res.ok) setCtx(res.data ?? null);
      else setErr(res.error);
    });
  }

  function toggle(hno: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hno)) next.delete(hno);
      else next.add(hno);
      return next;
    });
  }

  function selectAll() {
    if (!ctx) return;
    setSelected(new Set(ctx.orders.map((o) => o.hno)));
  }

  const selectedOrders = ctx?.orders.filter((o) => selected.has(o.hno)) ?? [];
  const selectedTotal = selectedOrders.reduce((s, o) => s + o.price_thb, 0);
  const insufficient = ctx ? selectedTotal > ctx.wallet_balance : false;

  function pay() {
    setErr(null);
    setResult(null);
    if (!ctx || selected.size === 0) { setErr("เลือกออเดอร์อย่างน้อย 1 รายการ"); return; }
    if (insufficient) { setErr(`ยอดเงินไม่พอ — ต้องการ ${thb(selectedTotal)} มี ${thb(ctx.wallet_balance)}`); return; }
    startPay(async () => {
      const res = await adminPayOrdersOnBehalf({ userId: ctx.user.userid, hNos: Array.from(selected) });
      if (res.ok) {
        setResult(res.data ?? null);
        // re-fetch context to reflect new balance + drop paid orders
        const fresh = await getPayUserContext(ctx.user.userid);
        if (fresh.ok) setCtx(fresh.data ?? null);
        setSelected(new Set());
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* search */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">รหัสลูกค้า</label>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="เช่น PR124"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 uppercase"
            disabled={searching}
          />
          <button
            onClick={search}
            disabled={searching}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {searching ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      {result && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-900">
            ✅ ชำระสำเร็จ {result.paid.length} รายการ · ตัดเงินรวม {thb(result.total_debited)}
          </p>
          {result.paid.length > 0 && (
            <p className="mt-1 text-green-800">ออเดอร์: {result.paid.join(", ")}</p>
          )}
          {result.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {result.skipped.map((s) => (
                <li key={s.hno}>{s.hno}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* customer + orders */}
      {ctx && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <p className="font-semibold text-gray-900">{ctx.user.name}</p>
              <p className="text-xs text-gray-500">
                {ctx.user.userid}{ctx.user.tel ? ` · ${ctx.user.tel}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">ยอดเงินในกระเป๋า</p>
              <p className="text-lg font-bold font-mono text-gray-900">{thb(ctx.wallet_balance)}</p>
            </div>
          </div>

          {ctx.orders.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">ไม่มีออเดอร์ฝากสั่งที่รอชำระเงิน</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">รายการรอชำระ ({ctx.orders.length})</p>
                <button onClick={selectAll} className="text-xs text-primary-600 hover:underline">เลือกทั้งหมด</button>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {ctx.orders.map((o) => (
                  <label key={o.hno} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.has(o.hno)}
                      onChange={() => toggle(o.hno)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-900">#{o.hno}</span>
                    {o.hdatepayment && (
                      <span className="text-xs text-gray-400">
                        ครบกำหนด {new Date(o.hdatepayment).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                      </span>
                    )}
                    <span className="text-sm font-mono font-semibold text-gray-900">{thb(o.price_thb)}</span>
                  </label>
                ))}
              </div>

              {/* total + pay */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="text-sm">
                  <span className="text-gray-500">เลือก {selected.size} รายการ · รวม </span>
                  <span className={`font-mono font-bold ${insufficient ? "text-red-600" : "text-gray-900"}`}>{thb(selectedTotal)}</span>
                  {insufficient && <span className="ml-2 text-xs text-red-600">(ยอดเงินไม่พอ)</span>}
                </div>
                <button
                  onClick={pay}
                  disabled={paying || selected.size === 0 || insufficient}
                  className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {paying ? "กำลังตัดเงิน..." : `ชำระเงินแทนลูกค้า ${selected.size ? `(${thb(selectedTotal)})` : ""}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

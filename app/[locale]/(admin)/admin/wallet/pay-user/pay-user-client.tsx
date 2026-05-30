"use client";

/**
 * P0-19 — Admin pay-on-behalf client form.
 *
 * Search a customer → show wallet balance + two payable lanes:
 *   • ฝากสั่ง orders (shop · adminPayOrdersOnBehalf · hStatus 2→3)
 *   • ฝากนำเข้า forwarders (Phase 2 · adminPayForwardersOnBehalf · fStatus 5→6)
 * Each lane has its own checkbox list + total + pay button (mirrors the
 * legacy two-form `paymentOrder` / `paymentForwarderNew` split). Both lanes
 * draw from the same wallet — each pay re-fetches the context so the balance
 * + remaining lists stay correct after a partial payment.
 *
 * Phase 3 — when the wallet can't cover the selected total, the pay button is
 * replaced by an amber slip-top-up panel (shortfall amount + slip-image input)
 * that routes to adminPayOrdersWithTopUp / adminPayForwardersWithTopUp. Those
 * write a PENDING top-up deposit + linked pay rows; the money settles when
 * accounting approves the slip at /admin/wallet/<id>.
 */

import { useState, useTransition } from "react";
import {
  getPayUserContext,
  adminPayOrdersOnBehalf,
  adminPayForwardersOnBehalf,
  adminPayOrdersWithTopUp,
  adminPayForwardersWithTopUp,
  type PayUserContext,
  type PayOnBehalfResult,
  type PayForwardersOnBehalfResult,
  type PayWithTopUpResult,
  type PayForwardersWithTopUpResult,
} from "@/actions/admin/pay-user";

function thb(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayUserClient() {
  const [code, setCode] = useState("");
  const [ctx, setCtx] = useState<PayUserContext | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();

  // shop lane
  const [selOrders, setSelOrders] = useState<Set<string>>(new Set());
  const [orderResult, setOrderResult] = useState<PayOnBehalfResult | null>(null);
  const [payingOrders, startPayOrders] = useTransition();

  // forwarder lane
  const [selFwds, setSelFwds] = useState<Set<string>>(new Set());
  const [fwdResult, setFwdResult] = useState<PayForwardersOnBehalfResult | null>(null);
  const [payingFwds, startPayFwds] = useTransition();

  // Phase 3 — slip-top-up-and-pay (insufficient balance). One slip + amount
  // per lane (the shop lane lets staff type a top-up amount; the forwarder
  // lane tops up the exact computed bill, so no amount field there).
  const [orderSlip, setOrderSlip] = useState<File | null>(null);
  const [orderTopUpAmount, setOrderTopUpAmount] = useState<string>("");
  const [orderTopUpResult, setOrderTopUpResult] = useState<PayWithTopUpResult | null>(null);
  const [fwdSlip, setFwdSlip] = useState<File | null>(null);
  const [fwdTopUpResult, setFwdTopUpResult] = useState<PayForwardersWithTopUpResult | null>(null);

  function resetAll() {
    setErr(null);
    setOrderResult(null);
    setFwdResult(null);
    setOrderTopUpResult(null);
    setFwdTopUpResult(null);
    setOrderSlip(null);
    setOrderTopUpAmount("");
    setFwdSlip(null);
    setCtx(null);
    setSelOrders(new Set());
    setSelFwds(new Set());
  }

  function search() {
    resetAll();
    const c = code.trim();
    if (!c) { setErr("กรุณากรอกรหัสลูกค้า (เช่น PR124)"); return; }
    startSearch(async () => {
      const res = await getPayUserContext(c);
      if (res.ok) setCtx(res.data ?? null);
      else setErr(res.error);
    });
  }

  async function refresh() {
    if (!ctx) return;
    const fresh = await getPayUserContext(ctx.user.userid);
    if (fresh.ok) setCtx(fresh.data ?? null);
  }

  // ── shop ──
  function toggleOrder(hno: string) {
    setSelOrders((prev) => {
      const next = new Set(prev);
      if (next.has(hno)) next.delete(hno); else next.add(hno);
      return next;
    });
  }
  const selectedOrders = ctx?.orders.filter((o) => selOrders.has(o.hno)) ?? [];
  const ordersTotal = selectedOrders.reduce((s, o) => s + o.price_thb, 0);
  const ordersInsufficient = ctx ? ordersTotal > ctx.wallet_balance : false;

  function payOrders() {
    setErr(null);
    setOrderResult(null);
    if (!ctx || selOrders.size === 0) { setErr("เลือกออเดอร์ฝากสั่งอย่างน้อย 1 รายการ"); return; }
    if (ordersInsufficient) { setErr(`ยอดเงินไม่พอ — ต้องการ ${thb(ordersTotal)} มี ${thb(ctx.wallet_balance)}`); return; }
    startPayOrders(async () => {
      const res = await adminPayOrdersOnBehalf({ userId: ctx.user.userid, hNos: Array.from(selOrders) });
      if (res.ok) {
        setOrderResult(res.data ?? null);
        setSelOrders(new Set());
        await refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // Phase 3 — shop: insufficient balance → upload slip + amount, top-up & pay.
  function payOrdersWithTopUp() {
    setErr(null);
    setOrderTopUpResult(null);
    if (!ctx || selOrders.size === 0) { setErr("เลือกออเดอร์ฝากสั่งอย่างน้อย 1 รายการ"); return; }
    if (!orderSlip) { setErr("กรุณาแนบสลิปการโอนเงิน"); return; }
    const amt = Number(orderTopUpAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr("กรุณากรอกยอดเงินที่โอน (มากกว่า 0)"); return; }
    if (amt + ctx.wallet_balance + 0.01 < ordersTotal) {
      setErr(`ยอดโอน + ยอดในกระเป๋าไม่พอ — รวม ${thb(amt + ctx.wallet_balance)} ต้องชำระ ${thb(ordersTotal)}`);
      return;
    }
    startPayOrders(async () => {
      const res = await adminPayOrdersWithTopUp(
        { userId: ctx.user.userid, hNos: Array.from(selOrders), topUpAmount: amt },
        orderSlip,
      );
      if (res.ok) {
        setOrderTopUpResult(res.data ?? null);
        setSelOrders(new Set());
        setOrderSlip(null);
        setOrderTopUpAmount("");
        await refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // ── forwarder ──
  function toggleFwd(fid: string) {
    setSelFwds((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid); else next.add(fid);
      return next;
    });
  }
  const selectedFwds = ctx?.forwarders.filter((f) => selFwds.has(f.fid)) ?? [];
  // Indicative total — the server recomputes authoritatively on the selected
  // subset (corporate 1% / PCSF first-item depend on the exact selection), so
  // the charged amount can differ by ≤1% or ฿50 from this preview.
  const fwdsTotal = selectedFwds.reduce((s, f) => s + f.price_thb, 0);
  const fwdsInsufficient = ctx ? fwdsTotal > ctx.wallet_balance : false;

  function payFwds() {
    setErr(null);
    setFwdResult(null);
    if (!ctx || selFwds.size === 0) { setErr("เลือกรายการฝากนำเข้าอย่างน้อย 1 รายการ"); return; }
    if (fwdsInsufficient) { setErr(`ยอดเงินไม่พอ — ต้องการ ${thb(fwdsTotal)} มี ${thb(ctx.wallet_balance)}`); return; }
    startPayFwds(async () => {
      const res = await adminPayForwardersOnBehalf({ userId: ctx.user.userid, fIds: Array.from(selFwds) });
      if (res.ok) {
        setFwdResult(res.data ?? null);
        setSelFwds(new Set());
        await refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // Phase 3 — forwarder: insufficient balance → upload slip, top-up the exact
  // computed bill & pay (path #1 · wallet not touched, slip covers the whole bill).
  function payFwdsWithTopUp() {
    setErr(null);
    setFwdTopUpResult(null);
    if (!ctx || selFwds.size === 0) { setErr("เลือกรายการฝากนำเข้าอย่างน้อย 1 รายการ"); return; }
    if (!fwdSlip) { setErr("กรุณาแนบสลิปการโอนเงิน"); return; }
    startPayFwds(async () => {
      const res = await adminPayForwardersWithTopUp(
        { userId: ctx.user.userid, fIds: Array.from(selFwds) },
        fwdSlip,
      );
      if (res.ok) {
        setFwdTopUpResult(res.data ?? null);
        setSelFwds(new Set());
        setFwdSlip(null);
        await refresh();
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

      {orderResult && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-900">
            ✅ ชำระฝากสั่งสำเร็จ {orderResult.paid.length} รายการ · ตัดเงินรวม {thb(orderResult.total_debited)}
          </p>
          {orderResult.paid.length > 0 && (
            <p className="mt-1 text-green-800">ออเดอร์: {orderResult.paid.join(", ")}</p>
          )}
          {orderResult.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {orderResult.skipped.map((s) => (
                <li key={s.hno}>{s.hno}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {fwdResult && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-900">
            ✅ ชำระฝากนำเข้าสำเร็จ {fwdResult.paid.length} รายการ · ตัดเงินรวม {thb(fwdResult.total_debited)}
          </p>
          {fwdResult.paid.length > 0 && (
            <p className="mt-1 text-green-800">รายการ: {fwdResult.paid.join(", ")}</p>
          )}
          {fwdResult.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {fwdResult.skipped.map((s) => (
                <li key={s.fid}>#{s.fid}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {orderTopUpResult && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm">
          <p className="font-semibold text-blue-900">
            🧾 บันทึกเติม-แล้วจ่ายฝากสั่ง {orderTopUpResult.paid.length} รายการ · เติม {thb(orderTopUpResult.topup_amount)} (รออนุมัติสลิป)
          </p>
          <p className="mt-1 text-blue-800">
            รายการเติมเงิน #{orderTopUpResult.topupWalletHsId} — ต้องให้ฝ่ายบัญชีอนุมัติสลิปก่อนจึงจะตัดเงินจริง
            {orderTopUpResult.wallet_consumed > 0 && ` · ใช้ยอดในกระเป๋าเดิม ${thb(orderTopUpResult.wallet_consumed)}`}
          </p>
          {orderTopUpResult.paid.length > 0 && (
            <p className="mt-1 text-blue-800">ออเดอร์: {orderTopUpResult.paid.join(", ")}</p>
          )}
          {orderTopUpResult.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {orderTopUpResult.skipped.map((s) => (
                <li key={s.hno}>{s.hno}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {fwdTopUpResult && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm">
          <p className="font-semibold text-blue-900">
            🧾 บันทึกเติม-แล้วจ่ายฝากนำเข้า {fwdTopUpResult.paid.length} รายการ · เติม {thb(fwdTopUpResult.topup_amount)} (รออนุมัติสลิป)
          </p>
          <p className="mt-1 text-blue-800">
            รายการเติมเงิน #{fwdTopUpResult.topupWalletHsId} — ต้องให้ฝ่ายบัญชีอนุมัติสลิปก่อนจึงจะตัดเงินจริง
          </p>
          {fwdTopUpResult.paid.length > 0 && (
            <p className="mt-1 text-blue-800">รายการ: {fwdTopUpResult.paid.join(", ")}</p>
          )}
          {fwdTopUpResult.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-800">
              {fwdTopUpResult.skipped.map((s) => (
                <li key={s.fid}>#{s.fid}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* customer header */}
      {ctx && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">{ctx.user.name}</p>
              <p className="text-xs text-gray-500">
                {ctx.user.userid}{ctx.user.tel ? ` · ${ctx.user.tel}` : ""}
                {ctx.is_corporate ? " · นิติบุคคล (ลด 1% เมื่อยอด ≥ ฿1,000)" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">ยอดเงินในกระเป๋า</p>
              <p className="text-lg font-bold font-mono text-gray-900">{thb(ctx.wallet_balance)}</p>
            </div>
          </div>
        </div>
      )}

      {/* shop orders lane */}
      {ctx && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-800">ฝากสั่ง (orders) รอชำระ ({ctx.orders.length})</p>
          {ctx.orders.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">ไม่มีออเดอร์ฝากสั่งที่รอชำระเงิน</p>
          ) : (
            <>
              <div className="flex items-center justify-end">
                <button onClick={() => setSelOrders(new Set(ctx.orders.map((o) => o.hno)))} className="text-xs text-primary-600 hover:underline">เลือกทั้งหมด</button>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {ctx.orders.map((o) => (
                  <label key={o.hno} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selOrders.has(o.hno)}
                      onChange={() => toggleOrder(o.hno)}
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="text-sm">
                  <span className="text-gray-500">เลือก {selOrders.size} รายการ · รวม </span>
                  <span className={`font-mono font-bold ${ordersInsufficient ? "text-red-600" : "text-gray-900"}`}>{thb(ordersTotal)}</span>
                  {ordersInsufficient && <span className="ml-2 text-xs text-red-600">(ยอดเงินไม่พอ)</span>}
                </div>
                {!ordersInsufficient && (
                  <button
                    onClick={payOrders}
                    disabled={payingOrders || selOrders.size === 0}
                    className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {payingOrders ? "กำลังตัดเงิน..." : `ชำระฝากสั่ง ${selOrders.size ? `(${thb(ordersTotal)})` : ""}`}
                  </button>
                )}
              </div>

              {/* Phase 3 — insufficient balance: top-up via slip + pay */}
              {ordersInsufficient && selOrders.size > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm font-medium text-amber-800">
                    ยอดเงินในกระเป๋าไม่พอ — แนบสลิปการโอนเพื่อเติมเงินแล้วชำระทันที (รออนุมัติสลิป)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">ยอดเงินที่โอน (บาท)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={orderTopUpAmount}
                        onChange={(e) => setOrderTopUpAmount(e.target.value)}
                        placeholder={Math.max(0, ordersTotal - (ctx?.wallet_balance ?? 0)).toFixed(2)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        ต้องเติมอย่างน้อย {thb(Math.max(0, ordersTotal - (ctx?.wallet_balance ?? 0)))}
                        {(ctx?.wallet_balance ?? 0) > 0 && ` (จะใช้ยอดในกระเป๋าเดิม ${thb(ctx?.wallet_balance ?? 0)} ร่วมด้วย)`}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">สลิปการโอน (รูปภาพ/PDF)</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setOrderSlip(e.target.files?.[0] ?? null)}
                        className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={payOrdersWithTopUp}
                      disabled={payingOrders || !orderSlip}
                      className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {payingOrders ? "กำลังบันทึก..." : "เติมเงิน + ชำระ (รออนุมัติสลิป)"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* forwarder lane */}
      {ctx && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-800">ฝากนำเข้า (forwarder) รอชำระ ({ctx.forwarders.length})</p>
          {ctx.forwarders.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">ไม่มีรายการฝากนำเข้าที่รอชำระเงิน</p>
          ) : (
            <>
              <div className="flex items-center justify-end">
                <button onClick={() => setSelFwds(new Set(ctx.forwarders.map((f) => f.fid)))} className="text-xs text-primary-600 hover:underline">เลือกทั้งหมด</button>
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                {ctx.forwarders.map((f) => (
                  <label key={f.fid} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selFwds.has(f.fid)}
                      onChange={() => toggleFwd(f.fid)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-900">#{f.fid}</span>
                    {f.ftracking && f.ftracking !== "-" && (
                      <span className="text-xs text-gray-400 truncate max-w-[160px]">{f.ftracking}</span>
                    )}
                    {f.is_credit && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">เครดิต</span>
                    )}
                    <span className="ml-auto text-sm font-mono font-semibold text-gray-900">{thb(f.price_thb)}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="text-sm">
                  <span className="text-gray-500">เลือก {selFwds.size} รายการ · รวม </span>
                  <span className={`font-mono font-bold ${fwdsInsufficient ? "text-red-600" : "text-gray-900"}`}>{thb(fwdsTotal)}</span>
                  {fwdsInsufficient && <span className="ml-2 text-xs text-red-600">(ยอดเงินไม่พอ)</span>}
                </div>
                {!fwdsInsufficient && (
                  <button
                    onClick={payFwds}
                    disabled={payingFwds || selFwds.size === 0}
                    className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {payingFwds ? "กำลังตัดเงิน..." : `ชำระฝากนำเข้า ${selFwds.size ? `(${thb(fwdsTotal)})` : ""}`}
                  </button>
                )}
              </div>

              {/* Phase 3 — insufficient balance: top-up the computed bill via slip + pay */}
              {fwdsInsufficient && selFwds.size > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm font-medium text-amber-800">
                    ยอดเงินในกระเป๋าไม่พอ — แนบสลิปการโอนเต็มจำนวนบิล (~{thb(fwdsTotal)}) เพื่อชำระทันที (รออนุมัติสลิป)
                  </p>
                  <p className="text-[11px] text-amber-700">
                    หมายเหตุ: ช่องทางนี้ใช้สลิปจ่ายเต็มบิล (ไม่ดึงจากกระเป๋าเงินเดิม) · ยอดจริงคำนวณจากรายการที่เลือกบนเซิร์ฟเวอร์ (อาจต่างจากตัวอย่าง ≤1% หรือ ฿50)
                  </p>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">สลิปการโอน (รูปภาพ/PDF)</label>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setFwdSlip(e.target.files?.[0] ?? null)}
                      className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={payFwdsWithTopUp}
                      disabled={payingFwds || !fwdSlip}
                      className="rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {payingFwds ? "กำลังบันทึก..." : "เติมเงิน + ชำระ (รออนุมัติสลิป)"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

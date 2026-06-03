"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { prompt } from "@/components/ui/confirm";
import {
  addInvoiceAdjustment,
  reverseInvoiceAdjustment,
  type InvoiceAdjustmentRow,
  type InvoiceAdjustmentTargetType,
} from "@/actions/admin/invoice-adjustments";

/**
 * V-A5 admin panel — manual ±amount adjustment line on any invoice.
 *
 * Mountable on:
 *   - /admin/forwarders/[fNo]                     (target_type='forwarder')
 *   - /admin/service-orders/[hNo]                 (target_type='service_order')
 *   - /admin/freight/invoices/[id]                (target_type='freight_invoice')
 *
 * Distinct from U2-4 CostAdjustmentsPanel: this one is invoice-level
 * (signed amount, no wallet auto-debit, generic to any invoice kind);
 * U2-4 is post-delivery rebill specific to forwarders (positive only,
 * with wallet-debit "mark paid" workflow).
 */

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const STATUS_BADGE: Record<string, string> = {
  active:   "bg-blue-50 text-blue-700 border-blue-200",
  reversed: "bg-gray-50 text-gray-600 border-gray-200 line-through",
};
const STATUS_LABEL: Record<string, string> = {
  active:   "มีผล",
  reversed: "ยกเลิก",
};

type Props = {
  targetType: InvoiceAdjustmentTargetType;
  targetId:   string;
  existing:   InvoiceAdjustmentRow[];
};

export function InvoiceAdjustmentsPanel({ targetType, targetId, existing }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [sign,   setSign]   = useState<"+" | "-">("+");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 5000);
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    const magnitude = Number(amount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      setErr("จำนวนเงินต้อง > 0");
      return;
    }
    if (reason.trim().length < 3) {
      setErr("กรอกเหตุผล ≥ 3 ตัว");
      return;
    }
    const signed = sign === "-" ? -magnitude : magnitude;
    startTransition(async () => {
      const res = await addInvoiceAdjustment({
        target_type: targetType,
        target_id:   targetId,
        amount_thb:  signed,
        reason:      reason.trim(),
      });
      if (res.ok) {
        flash(`บันทึก ${sign}฿${magnitude.toLocaleString()} แล้ว — ลูกค้าได้รับแจ้ง`);
        setSign("+"); setAmount(""); setReason("");
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  async function onReverse(id: string, amount: number) {
    setErr(null); setMsg(null);
    const reason = await prompt(
      `เหตุผลที่ยกเลิกรายการปรับ ${amount > 0 ? "+" : "−"}฿${Math.abs(amount).toLocaleString()} (≥3 ตัว):`,
    );
    if (!reason || reason.trim().length < 3) return;
    startTransition(async () => {
      const res = await reverseInvoiceAdjustment({ id, reason: reason.trim() });
      if (res.ok) {
        flash("ยกเลิกรายการปรับแล้ว");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  // Compute active total for the header banner. The signed sum tells
  // the admin at a glance whether the invoice is +/- adjusted.
  const activeRows  = existing.filter((r) => r.status === "active");
  const activeTotal = activeRows.reduce((sum, r) => sum + Number(r.amount_thb), 0);
  const activeAbs   = Math.abs(activeTotal);
  const activeSign  = activeTotal >= 0 ? "+" : "−";

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">ปรับยอด invoice (manual ± line)</h3>
        <span className="text-[10px] text-muted">V-A5</span>
      </div>

      {activeRows.length > 0 && (
        <p
          className={
            "rounded-lg border p-2 text-xs " +
            (activeTotal >= 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800")
          }
        >
          {activeRows.length} รายการ · สุทธิ {activeSign}฿
          {activeAbs.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </p>
      )}

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {/* Existing list — active + reversed visible for full audit trail */}
      {existing.length > 0 && (
        <ul className="space-y-2 max-h-72 overflow-auto">
          {existing.map((r) => {
            const amt = Number(r.amount_thb);
            const isSurcharge = amt > 0;
            return (
              <li key={r.id} className="rounded-lg border border-border p-2 text-xs space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className={"font-mono " + (isSurcharge ? "text-amber-700" : "text-emerald-700")}>
                        {isSurcharge ? "+" : "−"}฿
                        {Math.abs(amt).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                    <p className="text-muted mt-0.5">{r.reason}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      เพิ่มเมื่อ{" "}
                      {new Date(r.created_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                      {r.reversed_at && (
                        <>
                          {" · ยกเลิกเมื่อ "}
                          {new Date(r.reversed_at).toLocaleString("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </>
                      )}
                    </p>
                    {r.reversal_reason && (
                      <p className="text-[10px] text-muted mt-0.5">
                        เหตุผลยกเลิก: {r.reversal_reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                {r.status === "active" && (
                  <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                    <button
                      type="button"
                      onClick={() => onReverse(r.id, amt)}
                      disabled={pending}
                      className="rounded border border-red-200 text-red-600 px-2 py-1 text-[10px] hover:bg-red-50 disabled:opacity-50"
                    >
                      ยกเลิกรายการนี้
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add form (collapsed default) */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-primary-300 bg-primary-50/50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          + เพิ่มรายการปรับยอด (±)
        </button>
      ) : (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-surface-alt/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">+ รายการปรับใหม่</p>
            <button
              type="button"
              onClick={() => { setOpen(false); setErr(null); }}
              disabled={pending}
              className="text-[10px] text-muted hover:underline"
            >
              ปิด
            </button>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-2">
            <select
              value={sign}
              onChange={(e) => setSign(e.target.value as "+" | "-")}
              className={inputCls + " text-xs"}
              disabled={pending}
              aria-label="ทิศทาง"
            >
              <option value="+">+ เพิ่ม</option>
              <option value="-">− ส่วนลด</option>
            </select>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputCls + " text-xs font-mono"}
              placeholder="ยอด THB"
              inputMode="decimal"
              required
              disabled={pending}
            />
          </div>

          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls + " text-xs"}
            placeholder="เหตุผล — จำเป็น ≥ 3 ตัว (audit ตามไป)"
            required
            disabled={pending}
          />

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : "+ เพิ่ม + แจ้งลูกค้า"}
          </button>
        </form>
      )}
    </div>
  );
}

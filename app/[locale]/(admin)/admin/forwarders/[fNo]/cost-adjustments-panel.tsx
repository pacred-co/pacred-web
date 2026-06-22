"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAddForwarderCostAdjustment,
  adminMarkCostAdjustmentPaid,
  adminCancelCostAdjustment,
} from "@/actions/admin/forwarder-cost-adjustments";
import { confirm, prompt } from "@/components/ui/confirm";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const KIND_LABEL: Record<string, string> = {
  do_fee:        "ค่า D/O",
  gateway_fee:   "ค่า gateway",
  weight_rebill: "ค่าน้ำหนักเพิ่ม",
  customs_extra: "ค่าศุลกากรเพิ่ม",
  other:         "อื่นๆ",
};

const STATUS_BADGE: Record<string, string> = {
  unpaid:    "bg-amber-50 text-amber-700 border-amber-200",
  paid:      "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<string, string> = {
  unpaid:    "รอชำระ",
  paid:      "ชำระแล้ว",
  cancelled: "ยกเลิก",
};

export type CostAdjustmentRow = {
  id:           string;
  kind:         string;
  amount_thb:   number;
  note:         string | null;
  status:       string;
  created_at:   string;
  paid_at:      string | null;
  cancellation_reason: string | null;
};

type Props = {
  forwarderId: string;
  fNo:         string;
  /** Existing adjustments — passed from server component to render history. */
  existing:    CostAdjustmentRow[];
};

/** U2-4 admin panel — add new + show + manage existing cost adjustments. */
export function CostAdjustmentsPanel({ forwarderId, fNo, existing }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [kind,   setKind]   = useState("do_fee");
  const [amount, setAmount] = useState("");
  const [note,   setNote]   = useState("");

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 5000);
  }

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setErr("จำนวนเงินต้อง > 0");
      return;
    }
    startTransition(async () => {
      const res = await adminAddForwarderCostAdjustment({
        forwarder_id: forwarderId,
        kind:         kind as Parameters<typeof adminAddForwarderCostAdjustment>[0]["kind"],
        amount_thb:   amt,
        note:         note.trim() || undefined,
      });
      if (res.ok) {
        flash(`✓ เพิ่ม ${KIND_LABEL[kind]} ฿${amt.toLocaleString()} แล้ว — ลูกค้าได้รับแจ้ง`);
        setKind("do_fee"); setAmount(""); setNote("");
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  async function onMarkPaid(id: string, amount: number, allowOverdraw: boolean) {
    setErr(null); setMsg(null);
    if (allowOverdraw && !(await confirm(`รับเงินสด/นอกระบบ ฿${amount.toLocaleString()} ใช่ไหม?`))) return;
    startTransition(async () => {
      const res = await adminMarkCostAdjustmentPaid({ id, allow_overdraw: allowOverdraw });
      if (res.ok) {
        flash(`✓ บันทึกชำระแล้ว — หัก wallet ฿${amount.toLocaleString()}`);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  async function onCancel(id: string) {
    setErr(null); setMsg(null);
    const reason = await prompt("เหตุผลที่ยกเลิก (≥3 ตัว):");
    if (!reason || reason.trim().length < 3) return;
    startTransition(async () => {
      const res = await adminCancelCostAdjustment({ id, reason: reason.trim() });
      if (res.ok) {
        flash("✓ ยกเลิกแล้ว");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  const totalUnpaid = existing
    .filter((r) => r.status === "unpaid")
    .reduce((sum, r) => sum + Number(r.amount_thb), 0);

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">ค่าใช้จ่ายเพิ่มเติม (post-delivery)</h3>
        <span className="text-[11px] text-muted">U2-4</span>
      </div>

      {totalUnpaid > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          ⚠️ มีค้างชำระ ฿{totalUnpaid.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </p>
      )}

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {/* Existing list */}
      {existing.length > 0 && (
        <ul className="space-y-2 max-h-72 overflow-auto">
          {existing.map((r) => (
            <li key={r.id} className="rounded-lg border border-border p-2 text-xs space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    <span className="ml-2 font-mono text-primary-700">
                      ฿{Number(r.amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                  {r.note && <p className="text-muted text-[11px] mt-0.5">📝 {r.note}</p>}
                  <p className="text-[11px] text-muted mt-0.5">
                    เพิ่มเมื่อ {new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                    {r.paid_at && (
                      <> · ชำระเมื่อ {new Date(r.paid_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</>
                    )}
                  </p>
                  {r.cancellation_reason && (
                    <p className="text-[11px] text-muted mt-0.5">เหตุผลยกเลิก: {r.cancellation_reason}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              {r.status === "unpaid" && (
                <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                  <button
                    type="button"
                    onClick={() => onMarkPaid(r.id, Number(r.amount_thb), false)}
                    disabled={pending}
                    className="rounded bg-green-600 text-white px-2 py-1 text-[11px] hover:bg-green-700 disabled:opacity-50"
                  >
                    💰 หัก wallet
                  </button>
                  <button
                    type="button"
                    onClick={() => onMarkPaid(r.id, Number(r.amount_thb), true)}
                    disabled={pending}
                    className="rounded border border-amber-300 text-amber-700 px-2 py-1 text-[11px] hover:bg-amber-50 disabled:opacity-50"
                  >
                    💵 รับเงินสด
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancel(r.id)}
                    disabled={pending}
                    className="rounded border border-red-200 text-red-600 px-2 py-1 text-[11px] hover:bg-red-50 disabled:opacity-50"
                  >
                    ❌ ยกเลิก
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add form (collapsed default) */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-primary-300 bg-primary-50/50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          + เพิ่มค่าใช้จ่ายเพิ่ม
        </button>
      ) : (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-surface-alt/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">+ ค่าใช้จ่ายใหม่ — {fNo}</p>
            <button
              type="button"
              onClick={() => { setOpen(false); setErr(null); }}
              disabled={pending}
              className="text-[11px] text-muted hover:underline"
            >
              ปิด
            </button>
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls + " text-xs"} disabled={pending}>
              <option value="do_fee">ค่า D/O</option>
              <option value="gateway_fee">ค่า gateway</option>
              <option value="weight_rebill">ค่าน้ำหนักเพิ่ม</option>
              <option value="customs_extra">ค่าศุลกากรเพิ่ม</option>
              <option value="other">อื่นๆ</option>
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
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls + " text-xs"}
            placeholder="หมายเหตุ (optional แต่แนะนำให้ระบุเหตุผล)"
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

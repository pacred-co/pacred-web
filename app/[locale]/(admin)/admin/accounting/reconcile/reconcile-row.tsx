"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminAutoClearForwarderPayment } from "@/actions/admin/reconciliation";

const STATUS_LABEL: Record<string, string> = {
  pending_payment:  "รอชำระ",
  shipped_china:    "ออกจีน",
  in_transit:       "กลางทาง",
  arrived_thailand: "ถึงไทย",
  out_for_delivery: "จัดส่ง",
  delivered:        "สำเร็จ",
  cancelled:        "ยกเลิก",
};

type Item = {
  bucket:        "A" | "B" | "C";
  forwarder: {
    id:          string;
    f_no:        string;
    profile_id:  string;
    status:      string;
    total_price: number;
    created_at:  string;
    profile:     { member_code: string | null; first_name: string | null; last_name: string | null } | null;
  } | null;
  wallet_tx: {
    id:           string;
    reference_id: string;
    amount:       number;
    status:       string;
    created_at:   string;
  } | null;
  amount_diff: number;
  hint:        string;
};

export function ReconcileRow({ item, canAutoClear }: { item: Item; canAutoClear: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const f  = item.forwarder;
  const tx = item.wallet_tx;

  async function autoClear() {
    if (!f) return;
    if (Math.abs(item.amount_diff) > 0.01) {
      if (!(await confirm(`ยอดไม่ตรง ฿${Math.abs(item.amount_diff).toFixed(2)} — ยังจะ auto-clear?\n(แนะนำให้ตรวจมือก่อน)`))) return;
    }
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await adminAutoClearForwarderPayment({ f_no: f.f_no });
      if (res.ok && res.data) {
        setMsg(`✓ ${f.f_no}: ${res.data.from_status} → ${res.data.to_status} · ลูกค้าได้รับแจ้ง`);
        router.refresh();
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          {f ? (
            <Link href={`/admin/forwarders/${f.f_no}`} className="font-mono text-primary-600 hover:underline">
              {f.f_no}
            </Link>
          ) : (
            <span className="font-mono text-muted">{tx?.reference_id ?? "—"} (ไม่พบ forwarder)</span>
          )}
          {f?.profile && (
            <span className="ml-2 text-muted">
              · {f.profile.member_code ?? "—"} {f.profile.first_name} {f.profile.last_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {f && (
            <span className="rounded-full border bg-surface-alt px-2 py-0.5 text-[10px]">
              {STATUS_LABEL[f.status] ?? f.status}
            </span>
          )}
          {f && (
            <span className="font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          )}
          {tx && (
            <span className="font-mono text-green-700">
              tx: ฿{Math.abs(Number(tx.amount)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>

      <p className="text-muted text-[11px]">{item.hint}</p>

      {msg && <div className="rounded border border-green-200 bg-green-50 p-1.5 text-[10px] text-green-700">{msg}</div>}
      {err && <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{err}</div>}

      {canAutoClear && f && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={autoClear}
            disabled={pending}
            className="rounded-lg bg-green-600 text-white px-2.5 py-1 text-[10px] font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {pending ? "กำลัง..." : "✓ Auto-clear → ออกจีน"}
          </button>
          <Link
            href={`/admin/forwarders/${f.f_no}`}
            className="rounded-lg border border-border bg-white px-2.5 py-1 text-[10px] hover:bg-surface-alt"
          >
            ตรวจมือ →
          </Link>
        </div>
      )}
    </div>
  );
}

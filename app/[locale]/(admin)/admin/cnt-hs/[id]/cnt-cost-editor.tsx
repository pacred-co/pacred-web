"use client";

/**
 * <CntCostEditor> — W4 (2026-06-14): correct the per-parcel COST
 * (tb_forwarder.fcosttotalprice) for a PAID ค่าตู้ container, from the bill
 * page. report-cnt's cost editor locks a paid container and points staff here;
 * this is that editor (no paid-lock · cnt-scoped · money-isolated to cost).
 *
 * Financial summary mirrors legacy cnt-hs.php L779-818: ยอดเบิก vs ต้นทุนจากระบบ
 * (Σ fcosttotalprice) → ส่วนต่างที่โอนไป. §0f confirm-before-mutate.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminUpdatePaidContainerCost } from "@/actions/admin/report-cnt-cost-update";

export type CntCostRow = {
  id:              number;
  fidorco:         string | null;
  fcabinetnumber:  string;
  ftotalprice:     number;   // selling — display only
  fcosttotalprice: number;   // cost — editable
};

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CntCostEditor({ cntId, rows, cntAmount }: { cntId: number; rows: CntCostRow[]; cntAmount: number }) {
  const router = useRouter();
  const [costs, setCosts] = useState<Record<number, string>>(
    () => Object.fromEntries(rows.map((r) => [r.id, String(r.fcosttotalprice)])),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const totalCost = rows.reduce((s, r) => s + (Number(costs[r.id]) || 0), 0);
  const diff = cntAmount - totalCost;
  const dirty = rows.filter((r) => Number(costs[r.id]) !== r.fcosttotalprice && Number.isFinite(Number(costs[r.id])));

  function submit() {
    setMsg(null);
    const changed = dirty.map((r) => ({ fid: r.id, cost: Number(costs[r.id]) }))
      .filter((u) => Number.isFinite(u.cost) && u.cost >= 0);
    if (changed.length === 0) { setMsg({ ok: false, text: "ไม่มีรายการที่แก้ไข" }); return; }
    startTransition(async () => {
      const ok = await confirm(`ยืนยันปรับต้นทุน ${changed.length} รายการ ในตู้นี้ (ตู้จ่ายค่าตู้แล้ว)?`);
      if (!ok) return;
      const res = await adminUpdatePaidContainerCost({ cntId, updates: changed });
      if (res.ok) {
        setMsg({ ok: true, text: `ปรับต้นทุนสำเร็จ ${res.data?.updated ?? 0} รายการ${res.data?.failed ? ` · ล้มเหลว ${res.data.failed}` : ""}` });
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-3">
        <span className="text-sm font-semibold text-indigo-900">ปรับต้นทุนตู้ใหม่ (หลังจ่ายค่าตู้)</span>
        <span className="text-xs text-indigo-700">แก้ไขได้ {dirty.length} รายการ</span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || dirty.length === 0}
          className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-indigo-700"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกต้นทุน"}
        </button>
      </div>

      {/* Financial summary (legacy cnt-hs financial panel) */}
      <div className="grid grid-cols-3 gap-px bg-indigo-200 text-center text-xs">
        <div className="bg-white px-3 py-2">
          <div className="text-muted">ยอดเบิก (ค่าตู้)</div>
          <div className="font-mono font-semibold">฿{fmt(cntAmount)}</div>
        </div>
        <div className="bg-white px-3 py-2">
          <div className="text-muted">ต้นทุนจากระบบ (Σ)</div>
          <div className="font-mono font-semibold">฿{fmt(totalCost)}</div>
        </div>
        <div className="bg-white px-3 py-2">
          <div className="text-muted">ส่วนต่างที่โอนไป</div>
          <div className={`font-mono font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-700"}`}>฿{fmt(diff)}</div>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">F-no</th>
              <th className="px-3 py-2 text-left">ตู้</th>
              <th className="px-3 py-2 text-right">ราคาขาย</th>
              <th className="px-3 py-2 text-right">ต้นทุน (แก้ไขได้)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isDirty = Number(costs[r.id]) !== r.fcosttotalprice && Number.isFinite(Number(costs[r.id]));
              return (
                <tr key={r.id} className={`border-t border-border bg-white ${isDirty ? "ring-1 ring-inset ring-indigo-300" : ""}`}>
                  <td className="px-3 py-1.5 font-mono">{r.fidorco ?? r.id}</td>
                  <td className="px-3 py-1.5 font-mono">{r.fcabinetnumber}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-muted">฿{fmt(r.ftotalprice)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={costs[r.id] ?? ""}
                      onChange={(e) => setCosts((c) => ({ ...c, [r.id]: e.target.value }))}
                      className="w-28 rounded-md border border-border bg-white px-2 py-1 text-right font-mono text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

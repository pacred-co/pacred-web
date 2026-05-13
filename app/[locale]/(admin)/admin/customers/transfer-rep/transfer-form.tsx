"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBulkTransferSalesRep } from "@/actions/admin/admins";
import type { RepOption } from "./page";

type Customer = {
  id:             string;
  member_code:    string | null;
  name:           string;
  phone:          string | null;
  customer_group: string;
  current_rep:    RepOption | null;
  sales_admin_id: string | null;
  account_type:   "personal" | "juristic";
  created_at:     string;
};

export function TransferRepForm({ customers, reps }: { customers: Customer[]; reps: RepOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetRep, setTargetRep] = useState<string>("");      // "" = unassign, uuid = rep
  const [unassignChecked, setUnassignChecked] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done,  setDone]  = useState<{ updated: number; targetName: string } | null>(null);

  const allSelectableIds = useMemo(() => customers.map((c) => c.id), [customers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => prev.size === allSelectableIds.length ? new Set() : new Set(allSelectableIds));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) { setError("เลือกอย่างน้อย 1 ลูกค้า"); return; }
    if (!unassignChecked && !targetRep) { setError("เลือกพนักงานขายปลายทาง หรือทำเครื่องหมาย 'ย้ายออกจากเซลล์'"); return; }

    const newRepId  = unassignChecked ? null : targetRep;
    const newRep    = newRepId ? reps.find((r) => r.profile_id === newRepId) : null;
    const targetName = newRep ? newRep.display_name : "(ยกเลิกการผูกเซลล์)";

    if (!confirm(`ยืนยันย้ายลูกค้า ${selected.size} ราย ไปยัง "${targetName}"?\nการดำเนินการนี้บันทึก audit log แล้ว rollback ต้องทำด้วยมือ`)) return;

    startTransition(async () => {
      const res = await adminBulkTransferSalesRep({
        customer_ids:       Array.from(selected),
        new_sales_admin_id: newRepId,
      });
      if (res.ok && res.data) {
        setDone({ updated: res.data.updated, targetName });
        setSelected(new Set());
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">ย้ายเซลล์เรียบร้อย</h2>
        <p className="text-sm text-green-700">ย้ายลูกค้า {done.updated} ราย → {done.targetName}</p>
        <button
          type="button"
          onClick={() => { setDone(null); router.refresh(); }}
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium"
        >
          ย้ายชุดถัดไป
        </button>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted">
        ไม่พบลูกค้าตามตัวกรอง — ลองเลือกพนักงานขายปัจจุบันอื่น
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Customer table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between border-b border-border bg-surface-alt/40">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={selected.size === customers.length && customers.length > 0} onChange={toggleAll} />
            <span>เลือกทั้งหมด ({selected.size}/{customers.length})</span>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/30 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3 w-10"></th>
                <th className="px-3 py-3">รหัส</th>
                <th className="px-3 py-3">ชื่อ</th>
                <th className="px-3 py-3">เบอร์</th>
                <th className="px-3 py-3">กลุ่ม</th>
                <th className="px-3 py-3">เซลล์ปัจจุบัน</th>
                <th className="px-3 py-3">สมัครเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const isSel = selected.has(c.id);
                return (
                  <tr key={c.id} className={`border-t border-border ${isSel ? "bg-primary-50/40" : ""}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={isSel} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.member_code ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-muted text-[10px]">{c.account_type === "juristic" ? "นิติบุคคล" : "บุคคล"}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{c.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="rounded-full bg-primary-50 text-primary-700 px-2 py-0.5 border border-primary-200 text-[10px]">{c.customer_group}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.current_rep ? (
                        <div>
                          <div className="font-medium">{c.current_rep.display_name}</div>
                          {c.current_rep.member_code && <div className="font-mono text-muted text-[10px]">{c.current_rep.member_code}</div>}
                        </div>
                      ) : (
                        <span className="text-muted italic">ไม่มี</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(c.created_at).toLocaleDateString("th-TH")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="sticky bottom-0 z-10 rounded-2xl border-2 border-primary-500/40 bg-white dark:bg-surface shadow-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px] space-y-1">
            <label className="text-xs font-medium text-muted">ย้ายไปให้พนักงานขาย</label>
            <select
              value={targetRep}
              onChange={(e) => setTargetRep(e.target.value)}
              disabled={unassignChecked}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm disabled:bg-surface-alt disabled:text-muted"
            >
              <option value="">— เลือกพนักงานขาย —</option>
              {reps.map((r) => (
                <option key={r.profile_id} value={r.profile_id}>
                  {r.display_name}{r.member_code ? ` (${r.member_code})` : ""}{r.role === "super" ? " · ผู้ดูแลระบบ" : ""}
                </option>
              ))}
            </select>
          </div>
          <label className="text-sm inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={unassignChecked}
              onChange={(e) => { setUnassignChecked(e.target.checked); if (e.target.checked) setTargetRep(""); }}
            />
            <span>ย้ายออกจากเซลล์ (ลูกค้าไม่มีผู้ดูแล)</span>
          </label>
          <button
            type="submit"
            disabled={pending || selected.size === 0 || (!unassignChecked && !targetRep)}
            className="rounded-lg bg-primary-500 text-white px-5 py-2 text-sm font-bold hover:bg-primary-600 disabled:bg-surface-alt disabled:text-muted"
          >
            {pending ? "กำลังย้าย..." : `ย้ายลูกค้า ${selected.size} ราย`}
          </button>
        </div>
      </div>
    </form>
  );
}

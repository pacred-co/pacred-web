"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { bulkTransferCustomersToSalesRep } from "@/actions/admin/customer-transfer-bulk";
import type { RepOption } from "./page";

// V-G2 client form — wraps the spec'd loop-action so the user sees:
//   • a 200-row hard cap (the action validates 200; we surface this to
//     the user as a counter on the select-all toggle so they can't
//     accidentally submit 500),
//   • a mandatory reason field (logged to audit + the dual-side
//     notifications — see adminTransferSalesRep template usage),
//   • a per-row result summary banner after submit (succeeded vs failed
//     with the specific error code, e.g. "same_rep_no_change" for a
//     customer that was already under the target rep).

const MAX_SELECTION = 200;

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

type ResultSummary = {
  succeeded: string[];
  failed:    Array<{ id: string; error: string }>;
  targetName: string;
};

const ERROR_LABEL: Record<string, string> = {
  same_rep_no_change:           "ลูกค้ารายนี้อยู่กับพนักงานขายปลายทางอยู่แล้ว",
  not_your_customer:            "ลูกค้ารายนี้ไม่ได้อยู่ในความดูแลของคุณ",
  customer_not_found:           "ไม่พบลูกค้ารายนี้ (อาจถูกลบไปแล้ว)",
  target_not_active_sales_admin:"พนักงานขายปลายทางไม่ใช่เซลล์ที่เปิดใช้งาน",
  invalid_input:                "ข้อมูลไม่ถูกต้อง",
};

function customerLabel(c: Customer): string {
  return `${c.name}${c.member_code ? ` (${c.member_code})` : ""}`;
}

export function TransferBulkForm({ customers, reps }: { customers: Customer[]; reps: RepOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetRep, setTargetRep] = useState<string>("");
  const [unassignChecked, setUnassignChecked] = useState(false);
  const [note, setNote] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone]   = useState<ResultSummary | null>(null);

  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );
  const allSelectableIds = useMemo(() => customers.map((c) => c.id), [customers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size >= MAX_SELECTION) {
        setError(`เลือกได้สูงสุดครั้งละ ${MAX_SELECTION} ราย`);
        return prev;
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size > 0) return new Set();
      // Cap select-all at MAX_SELECTION; if the visible list is shorter
      // we select everything visible.
      const take = Math.min(allSelectableIds.length, MAX_SELECTION);
      if (allSelectableIds.length > MAX_SELECTION) {
        setError(`มีลูกค้า ${allSelectableIds.length} รายในรายการ — เลือกได้แค่ ${MAX_SELECTION} รายแรก`);
      }
      return new Set(allSelectableIds.slice(0, take));
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("เลือกอย่างน้อย 1 ลูกค้า");
      return;
    }
    if (selected.size > MAX_SELECTION) {
      setError(`ครั้งละไม่เกิน ${MAX_SELECTION} ราย`);
      return;
    }
    if (!unassignChecked && !targetRep) {
      setError("เลือกพนักงานขายปลายทาง หรือทำเครื่องหมาย 'ย้ายออกจากเซลล์'");
      return;
    }
    if (note.trim().length < 3) {
      setError("กรุณาระบุเหตุผลในการย้าย (อย่างน้อย 3 ตัวอักษร)");
      return;
    }

    const newRepId   = unassignChecked ? null : targetRep;
    const newRep     = newRepId ? reps.find((r) => r.profile_id === newRepId) : null;
    const targetName = newRep ? newRep.display_name : "(ยกเลิกการผูกเซลล์)";

    if (!(await confirm(
      `ยืนยันย้ายลูกค้า ${selected.size} ราย ไปยัง "${targetName}"?\n` +
      `ระบบจะส่งแจ้งเตือนให้พนักงานขายต้นทาง/ปลายทาง/ลูกค้าทุกราย + บันทึก audit log ทุก row.\n` +
      `การย้อนกลับต้องทำด้วยมือ.`,
    ))) return;

    startTransition(async () => {
      const res = await bulkTransferCustomersToSalesRep({
        customer_ids:       Array.from(selected),
        new_sales_admin_id: newRepId,
        note,
      });
      if (res.ok && res.data) {
        setDone({
          succeeded:  res.data.succeeded,
          failed:     res.data.failed,
          targetName,
        });
        setSelected(new Set());
        setNote("");
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    const allOk = done.failed.length === 0;
    return (
      <div className={`rounded-2xl border p-6 space-y-4 ${allOk ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <h2 className={`text-xl font-bold ${allOk ? "text-green-800" : "text-amber-800"}`}>
          {allOk ? "ย้ายเซลล์เรียบร้อย" : "ย้ายเซลล์เสร็จสิ้น — มีบางรายการล้มเหลว"}
        </h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-white p-3 border border-border">
            <p className="text-xs text-muted">ย้ายสำเร็จ</p>
            <p className="text-2xl font-bold text-green-700">{done.succeeded.length}</p>
            <p className="text-xs text-muted mt-1">ปลายทาง: {done.targetName}</p>
          </div>
          <div className="rounded-lg bg-white p-3 border border-border">
            <p className="text-xs text-muted">ล้มเหลว</p>
            <p className={`text-2xl font-bold ${done.failed.length === 0 ? "text-muted" : "text-red-700"}`}>{done.failed.length}</p>
            <p className="text-xs text-muted mt-1">รายการที่ไม่ได้ย้าย</p>
          </div>
        </div>

        {done.failed.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-white">
            <div className="px-4 py-2 border-b border-red-200 bg-red-50 text-xs font-semibold text-red-800">
              รายการที่ล้มเหลว ({done.failed.length})
            </div>
            <ul className="divide-y divide-border text-xs">
              {done.failed.map((f) => {
                const c = customerById.get(f.id);
                return (
                  <li key={f.id} className="px-4 py-2 flex items-center justify-between">
                    <span className="font-medium">{c ? customerLabel(c) : f.id}</span>
                    <span className="text-red-700">{ERROR_LABEL[f.error] ?? f.error}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => { setDone(null); router.refresh(); }}
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
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
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === Math.min(customers.length, MAX_SELECTION)}
              onChange={toggleAll}
            />
            <span>เลือกทั้งหมด ({selected.size}/{Math.min(customers.length, MAX_SELECTION)})</span>
          </label>
          <span className="text-xs text-muted">สูงสุด {MAX_SELECTION} ราย/ครั้ง</span>
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

      {/* Bottom action bar — sticky so it follows the scroll on long lists */}
      <div className="sticky bottom-0 z-10 rounded-2xl border-2 border-primary-500/40 bg-white dark:bg-surface shadow-lg p-4 space-y-3">
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
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">
            เหตุผลในการย้าย <span className="text-red-600">*</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น พนักงานขายเก่าลาออก / ปรับสมดุล portfolio / ลูกค้าขอเปลี่ยน"
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
          />
          <p className="text-[10px] text-muted">บันทึกเข้า audit log + แสดงในแจ้งเตือนให้พนักงานขายต้นทาง/ปลายทาง · 3-500 ตัวอักษร</p>
        </div>
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={pending || selected.size === 0 || (!unassignChecked && !targetRep) || note.trim().length < 3}
            className="rounded-lg bg-primary-500 text-white px-5 py-2 text-sm font-bold hover:bg-primary-600 disabled:bg-surface-alt disabled:text-muted"
          >
            {pending ? "กำลังย้าย..." : `ย้ายลูกค้า ${selected.size} ราย`}
          </button>
        </div>
      </div>
    </form>
  );
}

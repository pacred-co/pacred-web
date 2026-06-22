"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminSetSalesRepFlag, type StaffSalesFlagRow } from "@/actions/admin/admins";

/**
 * Self-service sales-team manager — per-row toggle of `tb_admin.adminStatusSale`.
 *
 * §0f confirm-before-mutate: every flip pops a Pacred-styled confirm dialog
 * BEFORE the server action fires. Success → inline banner + router.refresh()
 * (the established admin-actions.tsx pattern; the repo has no toast lib).
 */
export function SalesTeamManager({ initialRows }: { initialRows: StaffSalesFlagRow[] }) {
  const router = useRouter();
  // Optimistic local mirror so the switch flips instantly; reconciled by
  // router.refresh() (which re-fetches the server truth). On error we revert.
  const [rows, setRows] = useState<StaffSalesFlagRow[]>(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const salesCount = rows.filter((r) => r.isSales).length;

  async function onToggle(row: StaffSalesFlagRow) {
    setError(null);
    setMsg(null);
    const next = !row.isSales;

    const ok = await confirm(
      next
        ? `ตั้งให้ "${row.name}" เป็นเซล?\nระบบจะเริ่มสุ่มลูกค้าใหม่ให้ + แสดงในการ์ดทีมเซลบนหน้าเว็บลูกค้า`
        : `เอา "${row.name}" ออกจากทีมเซล?\nจะไม่ได้รับลูกค้าสุ่ม + ไม่แสดงในการ์ดทีมเซลอีกต่อไป (ยังทำงานในระบบได้ปกติ)`,
      {
        title: next ? "เพิ่มเข้าทีมเซล" : "เอาออกจากทีมเซล",
        confirmLabel: next ? "ตั้งเป็นเซล" : "เอาออก",
        cancelLabel: "ยกเลิก",
      },
    );
    if (!ok) return;

    // Optimistic flip.
    setRows((prev) => prev.map((r) => (r.adminID === row.adminID ? { ...r, isSales: next } : r)));
    setBusyId(row.adminID);

    startTransition(async () => {
      const res = await adminSetSalesRepFlag({ adminID: row.adminID, isSales: next });
      if (res.ok) {
        setMsg(next ? `เพิ่ม "${row.name}" เข้าทีมเซลแล้ว` : `เอา "${row.name}" ออกจากทีมเซลแล้ว`);
        setBusyId(null);
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      } else {
        // Revert the optimistic flip on failure.
        setRows((prev) => prev.map((r) => (r.adminID === row.adminID ? { ...r, isSales: row.isSales } : r)));
        setBusyId(null);
        setError(res.error);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-surface-alt/30 px-6 py-16 text-center text-sm text-muted">
        ยังไม่มีพนักงานที่เปิดใช้งาน (active) ในระบบ
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>
      )}

      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-sm">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/60 text-left text-[11px] uppercase tracking-wider text-muted font-semibold">
              <tr>
                <th className="px-4 py-3">พนักงาน</th>
                <th className="px-4 py-3">รหัส (adminID)</th>
                <th className="px-4 py-3">เบอร์</th>
                <th className="px-4 py-3 text-right">เป็นเซล (รับลูกค้าสุ่ม)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.adminID;
                return (
                  <tr key={row.adminID} className="border-t border-border hover:bg-surface-alt/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.name}</div>
                      {row.fullName !== row.name && (
                        <div className="text-[11px] text-muted">{row.fullName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{row.adminID}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.tel ? (
                        <a href={`tel:${row.tel}`} className="text-primary-600 hover:underline">{row.tel}</a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={`text-[11px] font-medium ${
                            row.isSales ? "text-primary-700" : "text-muted"
                          }`}
                        >
                          {row.isSales ? "เป็นเซล" : "ไม่ใช่เซล"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.isSales}
                          aria-label={`เป็นเซล: ${row.name}`}
                          disabled={busy}
                          onClick={() => onToggle(row)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                            row.isSales ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              row.isSales ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-surface-alt/30 px-4 py-2.5 text-xs text-muted">
          พนักงานทั้งหมด {rows.length} คน · เป็นเซล {salesCount} คน
        </div>
      </div>
    </div>
  );
}

"use client";

/**
 * Client island for /admin/withdrawal/freight-th-list.
 *
 * Renders the freight-TH withdrawal queue (freight_commission_withdrawals rows
 * resolved server-side) with:
 *   - a status filter (รอตรวจ / อนุมัติแล้ว / จ่ายแล้ว / ปฏิเสธ / ทั้งหมด)
 *   - a responsive table (md+) + stacked cards (mobile)
 *   - APPROVE / REJECT buttons that route through the EXISTING audited actions
 *     (adminApproveCommissionWithdrawal / adminRejectCommissionWithdrawal),
 *     each behind a §0f confirm dialog (useConfirmDialogs).
 *
 * 💰 The approve action is DISABLED (with a hint) while the freight-commission
 * flag is OFF (`approvalEnabled=false`) — no money moves until the owner
 * confirms the 50/50 policy + flips the flag. REJECT stays usable so an
 * accountant can clear a stray pending request even while dormant.
 *
 * No new write path — every mutation reuses a pre-existing server action.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  adminApproveCommissionWithdrawal,
  adminRejectCommissionWithdrawal,
  type CommissionWithdrawalRow,
} from "@/actions/admin/freight-commission";

type StatusFilter = "pending" | "approved" | "paid" | "rejected" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "รอตรวจ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "paid", label: "จ่ายแล้ว" },
  { key: "rejected", label: "ปฏิเสธ" },
  { key: "all", label: "ทั้งหมด" },
];

const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "รอตรวจ", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: { label: "อนุมัติแล้ว", cls: "bg-blue-100 text-blue-800 border-blue-200" },
    paid: { label: "จ่ายแล้ว", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    rejected: { label: "ปฏิเสธ", cls: "bg-red-100 text-red-700 border-red-200" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

export function FreightThWithdrawalList({
  rows,
  approvalEnabled,
}: {
  rows: CommissionWithdrawalRow[];
  approvalEnabled: boolean;
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, paid: 0, rejected: 0, all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  async function approve(row: CommissionWithdrawalRow) {
    if (!approvalEnabled) return;
    const ok = await confirm(
      `อนุมัติรายการเบิกของ ${row.earnerName}?\n` +
        `ยอดสุทธิ ฿${baht(row.netThb)} (gross ฿${baht(row.grossThb)} · หัก ณ ที่จ่าย ฿${baht(row.whtThb)})\n\n` +
        `การอนุมัติยังไม่จ่ายเงิน — ขั้นจ่ายจริง (โอน+สลิป) ทำที่หน้าค่าคอม Freight โดย super`,
    );
    if (!ok) return;
    startTransition(async () => {
      setBusyId(row.id);
      const res = await adminApproveCommissionWithdrawal({ id: row.id });
      setBusyId(null);
      if (!res.ok) {
        await alert(`อนุมัติไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  async function reject(row: CommissionWithdrawalRow) {
    const ok = await confirm(
      `ปฏิเสธรายการเบิกของ ${row.earnerName} (฿${baht(row.netThb)})?\n` +
        `รายการสะสมที่ผูกไว้จะถูกปล่อยกลับไปสถานะพร้อมเบิกอีกครั้ง`,
    );
    if (!ok) return;
    startTransition(async () => {
      setBusyId(row.id);
      const res = await adminRejectCommissionWithdrawal({
        id: row.id,
        reason: "ปฏิเสธจากคิวเบิกค่าขนส่งไทย",
      });
      setBusyId(null);
      if (!res.ok) {
        await alert(`ปฏิเสธไม่สำเร็จ: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      {/* ── filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={[
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary-600 bg-primary-600 text-white"
                  : "border-border bg-white text-foreground hover:bg-surface-alt dark:bg-surface",
              ].join(" ")}
            >
              {f.label}
              <span className={`ml-1.5 text-xs ${active ? "text-white/80" : "text-muted"}`}>
                {counts[f.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center shadow-sm">
          <p className="text-sm text-muted">ไม่มีรายการในสถานะนี้</p>
        </div>
      ) : (
        <>
          {/* ── desktop table ── */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt/50 text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">ผู้รับเงิน</th>
                  <th className="px-4 py-3 font-medium">บัญชีรับโอน</th>
                  <th className="px-4 py-3 font-medium text-right">Gross (฿)</th>
                  <th className="px-4 py-3 font-medium text-right">หัก ณ ที่จ่าย (฿)</th>
                  <th className="px-4 py-3 font-medium text-right">สุทธิ (฿)</th>
                  <th className="px-4 py-3 font-medium">วันที่ขอเบิก</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{r.earnerName}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.payeeBankName || r.payeeAccountNo ? (
                        <>
                          <span className="block text-foreground">{r.payeeAccountName ?? "—"}</span>
                          {r.payeeBankName ?? ""} {r.payeeAccountNo ?? ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{baht(r.grossThb)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {baht(r.whtThb)}
                      <span className="ml-1 text-[11px]">({r.whtRatePct}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{baht(r.netThb)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{fmtDate(r.requestedAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.status === "rejected" && r.rejectedReason && (
                        <span className="mt-1 block text-[11px] text-red-600">{r.rejectedReason}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActions
                        row={r}
                        approvalEnabled={approvalEnabled}
                        busy={pending && busyId === r.id}
                        onApprove={() => approve(r)}
                        onReject={() => reject(r)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── mobile cards ── */}
          <div className="md:hidden space-y-3">
            {visible.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{r.earnerName}</p>
                    <p className="text-xs text-muted">{fmtDate(r.requestedAt)}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-muted">Gross</p>
                    <p className="tabular-nums">฿{baht(r.grossThb)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">หัก ณ ที่จ่าย</p>
                    <p className="tabular-nums text-muted">฿{baht(r.whtThb)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted">สุทธิ</p>
                    <p className="font-semibold tabular-nums">฿{baht(r.netThb)}</p>
                  </div>
                </div>
                {(r.payeeBankName || r.payeeAccountNo) && (
                  <p className="text-xs text-muted">
                    {r.payeeAccountName ?? ""} · {r.payeeBankName ?? ""} {r.payeeAccountNo ?? ""}
                  </p>
                )}
                {r.status === "rejected" && r.rejectedReason && (
                  <p className="text-[11px] text-red-600">เหตุผล: {r.rejectedReason}</p>
                )}
                <div className="flex justify-end">
                  <RowActions
                    row={r}
                    approvalEnabled={approvalEnabled}
                    busy={pending && busyId === r.id}
                    onApprove={() => approve(r)}
                    onReject={() => reject(r)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {dialogs}
    </section>
  );
}

function RowActions({
  row,
  approvalEnabled,
  busy,
  onApprove,
  onReject,
}: {
  row: CommissionWithdrawalRow;
  approvalEnabled: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  // Only a still-pending request can be approved/rejected.
  if (row.status !== "pending") {
    return <span className="text-xs text-muted">—</span>;
  }
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onApprove}
        disabled={!approvalEnabled || busy}
        title={approvalEnabled ? "อนุมัติรายการเบิก" : "ระบบค่าคอม Freight ปิดอยู่ — รอ owner ยืนยันนโยบาย 50/50"}
        className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {busy ? "..." : "อนุมัติ"}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "..." : "ปฏิเสธ"}
      </button>
    </div>
  );
}

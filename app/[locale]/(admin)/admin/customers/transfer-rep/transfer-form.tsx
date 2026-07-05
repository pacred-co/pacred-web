"use client";

/**
 * Client form for /admin/customers/transfer-rep — bulk transfer-rep
 * against the legacy `tb_users.adminidsale` column.
 *
 * Talks to `adminBulkTransferSalesRepTb` in actions/admin/admins.ts.
 * Filters happen server-side via URL params (?q=... and ?currentRep=...),
 * because the customer list can be large; selection state lives client-side.
 *
 * Preview: shows "X customers will move from {Y or 'unassigned'} to Z"
 * before submit.
 *
 * Wave 23 P2 batch 1 (2026-05-27 ค่ำ): swapped legacy Bootstrap
 * `form-control` / `form-group` / `row col-md-*` / `btn btn-color-main` /
 * `alert alert-*` classes for Tailwind utilities to match the Wave 20 P1-d
 * page chrome. Logic + validation + server-action wiring preserved per
 * AGENTS §0a (steal logic, polish UI).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminBulkTransferSalesRepTb } from "@/actions/admin/admins";

export type CustomerLite = {
  userid:       string;
  username:     string | null;
  userlastname: string | null;
  usertel:      string | null;
  adminidsale:  string | null;
  // Pre-resolved company-aware display name (server-side · นิติบุคคล →
  // company name, else person name). Optional so callers that don't provide
  // it fall back to the person name below.
  displayname?: string | null;
};

export type TbAdminLite = {
  adminid:       string;
  adminnickname: string | null;
  adminname:     string | null;
  adminlastname: string | null;
  department:    string | null;
  section:       string | null;
};

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";
const LABEL_CLS = "block text-xs text-muted mb-1";
const BTN_PRIMARY =
  "rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  "rounded-lg border border-border bg-white text-foreground px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50 disabled:cursor-not-allowed";

function customerLabel(c: CustomerLite): string {
  // Prefer the server-resolved company-aware display name (นิติบุคคล → company)
  // and fall back to the person name for rows without it.
  const name = (c.displayname ?? "").trim() || `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
  return `${c.userid} · ${name || c.usertel || "(ไม่มีชื่อ)"}`;
}

function adminLabel(a: TbAdminLite): string {
  const fallback = `${a.adminname ?? ""} ${a.adminlastname ?? ""}`.trim();
  const nick = a.adminnickname?.trim();
  return `${a.adminid} · ${nick || fallback || "(ไม่มีชื่อเล่น)"}`;
}

export function TransferRepForm({
  customers,
  admins,
  initialQuery,
  initialCurrentRep,
}: {
  customers:         CustomerLite[];
  admins:            TbAdminLite[];
  initialQuery:      string;
  initialCurrentRep: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [q, setQ]                     = useState<string>(initialQuery);
  const [currentRep, setCurrentRep]   = useState<string>(initialCurrentRep);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [targetAdmin, setTargetAdmin] = useState<string>("");
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);

  const adminLookup = useMemo(() => {
    const m = new Map<string, TbAdminLite>();
    for (const a of admins) m.set(a.adminid, a);
    return m;
  }, [admins]);

  const onApplyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim())          params.set("q", q.trim());
    if (currentRep.trim()) params.set("currentRep", currentRep.trim().toUpperCase());
    const url = params.toString()
      ? `/admin/customers/transfer-rep?${params.toString()}`
      : "/admin/customers/transfer-rep";
    router.push(url);
  };

  const toggleOne = (userid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userid)) next.delete(userid);
      else next.add(userid);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === customers.length) return new Set();
      return new Set(customers.map((c) => c.userid));
    });
  };

  const selectedRows = customers.filter((c) => selected.has(c.userid));
  const fromBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of selectedRows) {
      const key = r.adminidsale ?? "(unassigned)";
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [selectedRows]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (selected.size === 0) { setError("เลือกลูกค้าอย่างน้อย 1 ราย"); return; }
    if (!targetAdmin)        { setError("เลือก admin ปลายทาง"); return; }

    if (!confirmStep) { setConfirmStep(true); return; }

    const userIds = Array.from(selected);
    startTransition(async () => {
      const result = await adminBulkTransferSalesRepTb({
        user_ids:         userIds,
        new_admin_userid: targetAdmin,
      });
      if (!result.ok) {
        setError(result.error);
        setConfirmStep(false);
        return;
      }
      setSuccess(`ย้ายสำเร็จ ${result.data?.updated ?? 0} ราย → ${targetAdmin}`);
      setSelected(new Set());
      setConfirmStep(false);
      router.refresh();
    });
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Filter row */}
      <form onSubmit={onApplyFilter} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label htmlFor="filter-q" className={LABEL_CLS}>ค้นหา (ชื่อ / PR####)</label>
            <input
              id="filter-q"
              type="text"
              className={INPUT_CLS}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เช่น John หรือ PR1234"
              disabled={pending}
            />
          </div>
          <div className="sm:col-span-5">
            <label htmlFor="filter-currentRep" className={LABEL_CLS}>เซลล์ปัจจุบัน (currentRep)</label>
            <select
              id="filter-currentRep"
              className={INPUT_CLS}
              value={currentRep}
              onChange={(e) => setCurrentRep(e.target.value)}
              disabled={pending}
            >
              <option value="">— ทั้งหมด —</option>
              {admins.map((a) => (
                <option key={a.adminid} value={a.adminid}>{adminLabel(a)}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button type="submit" className={`${BTN_PRIMARY} w-full`} disabled={pending}>
              กรอง
            </button>
          </div>
        </div>
      </form>

      {/* Selection summary */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
        <strong>เลือกแล้ว {selected.size} ราย</strong> จากรายชื่อทั้งหมด {customers.length} ราย
        {selected.size > 0 && (
          <>
            {" "}— ปัจจุบันอยู่ที่:{" "}
            {fromBreakdown.map(([from, n]) => (
              <span
                key={from}
                className="inline-block mr-2 px-2 py-0.5 bg-white rounded text-xs"
              >
                {from === "(unassigned)" ? "(ยังไม่มี)" : from} × {n}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Customer table */}
      <div className="rounded-lg border border-border bg-white dark:bg-surface overflow-hidden">
        <div className="max-h-[480px] overflow-y-auto overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-center w-10">
                  <input
                    type="checkbox"
                    checked={customers.length > 0 && selected.size === customers.length}
                    onChange={toggleAll}
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
                <th className="px-3 py-2">รหัสสมาชิก</th>
                <th className="px-3 py-2">ชื่อ-นามสกุล</th>
                <th className="px-3 py-2">เบอร์โทร</th>
                <th className="px-3 py-2">เซลล์ปัจจุบัน</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted">
                    <em>ยังไม่มีรายชื่อ — กรอกตัวกรองด้านบนแล้วกด &quot;กรอง&quot;</em>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.userid} className="hover:bg-surface-alt/30">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(c.userid)}
                        onChange={() => toggleOne(c.userid)}
                        aria-label={`เลือก ${c.userid}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.userid}</td>
                    <td className="px-3 py-2">{customerLabel(c)}</td>
                    <td className="px-3 py-2">{c.usertel ?? "-"}</td>
                    <td className="px-3 py-2">
                      {c.adminidsale ? (
                        <span>{c.adminidsale}{adminLookup.get(c.adminidsale)?.adminnickname ? ` · ${adminLookup.get(c.adminidsale)?.adminnickname}` : ""}</span>
                      ) : (
                        <span className="text-muted">(ยังไม่มี)</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target admin + submit */}
      <form onSubmit={onSubmit} className="border-t border-border pt-4 space-y-3">
        <div>
          <label htmlFor="target-admin" className={LABEL_CLS}>
            admin ปลายทาง (target) <span className="text-red-700">*</span>
          </label>
          <select
            id="target-admin"
            className={INPUT_CLS}
            value={targetAdmin}
            onChange={(e) => { setTargetAdmin(e.target.value); setConfirmStep(false); }}
            disabled={pending}
            required
          >
            <option value="">— เลือก admin —</option>
            {admins.map((a) => (
              <option key={a.adminid} value={a.adminid}>{adminLabel(a)}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            ⚠ {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            ✓ {success}
          </div>
        )}

        {confirmStep && targetAdmin && selected.size > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <strong>ยืนยันการย้าย?</strong> ลูกค้า {selected.size} ราย จะย้ายไปยัง <strong>{targetAdmin}</strong> ({adminLookup.get(targetAdmin)?.adminnickname ?? "-"})
            {fromBreakdown.length > 0 && (
              <>
                <br />
                จาก: {fromBreakdown.map(([from, n]) => `${from === "(unassigned)" ? "ยังไม่มี" : from} × ${n}`).join(" · ")}
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => {
              setSelected(new Set()); setTargetAdmin(""); setError(null); setSuccess(null); setConfirmStep(false);
            }}
            disabled={pending}
          >
            ล้าง
          </button>
          <button
            type="submit"
            className={BTN_PRIMARY}
            disabled={pending || selected.size === 0 || !targetAdmin}
          >
            {pending
              ? "กำลังย้าย..."
              : confirmStep
                ? `ยืนยันย้าย ${selected.size} ราย`
                : `ตรวจสอบและย้าย (${selected.size} ราย)`}
          </button>
        </div>
      </form>
    </div>
  );
}

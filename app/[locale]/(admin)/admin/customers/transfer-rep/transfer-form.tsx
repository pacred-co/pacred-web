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
};

export type TbAdminLite = {
  adminid:       string;
  adminnickname: string | null;
  adminname:     string | null;
  adminlastname: string | null;
  department:    string | null;
  section:       string | null;
};

function customerLabel(c: CustomerLite): string {
  const name = `${c.username ?? ""} ${c.userlastname ?? ""}`.trim();
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
    <div style={{ marginTop: 16 }}>
      {/* Filter row */}
      <form onSubmit={onApplyFilter} className="form-horizontal" style={{ marginBottom: 16 }}>
        <div className="row mb-1">
          <div className="col-md-5">
            <label className="form-control-label">ค้นหา (ชื่อ / PR####)</label>
            <input
              type="text"
              className="form-control"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="เช่น John หรือ PR1234"
              disabled={pending}
            />
          </div>
          <div className="col-md-5">
            <label className="form-control-label">เซลล์ปัจจุบัน (currentRep)</label>
            <select
              className="form-control"
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
          <div className="col-md-2" style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-color-main round" style={{ width: "100%" }} disabled={pending}>
              กรอง
            </button>
          </div>
        </div>
      </form>

      {/* Selection summary */}
      <div className="row mb-1">
        <div className="col-md-12">
          <div className="alert alert-info" role="alert">
            <strong>เลือกแล้ว {selected.size} ราย</strong> จากรายชื่อทั้งหมด {customers.length} ราย
            {selected.size > 0 && (
              <>
                {" "}— ปัจจุบันอยู่ที่:{" "}
                {fromBreakdown.map(([from, n]) => (
                  <span
                    key={from}
                    style={{
                      display: "inline-block",
                      marginRight: 8,
                      padding: "2px 8px",
                      background: "#fff",
                      borderRadius: 4,
                    }}
                  >
                    {from === "(unassigned)" ? "(ยังไม่มี)" : from} × {n}
                  </span>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Customer table */}
      <div className="table-responsive p-05" style={{ maxHeight: 480, overflowY: "auto" }}>
        <table className="table table-bordered table-striped">
          <thead>
            <tr className="text-center">
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={customers.length > 0 && selected.size === customers.length}
                  onChange={toggleAll}
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th>รหัสสมาชิก</th>
              <th>ชื่อ-นามสกุล</th>
              <th>เบอร์โทร</th>
              <th>เซลล์ปัจจุบัน</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center" style={{ padding: "32px 0" }}>
                  <em>ยังไม่มีรายชื่อ — กรอกตัวกรองด้านบนแล้วกด &quot;กรอง&quot;</em>
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.userid}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(c.userid)}
                      onChange={() => toggleOne(c.userid)}
                      aria-label={`เลือก ${c.userid}`}
                    />
                  </td>
                  <td>{c.userid}</td>
                  <td>{customerLabel(c)}</td>
                  <td>{c.usertel ?? "-"}</td>
                  <td>
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

      {/* Target admin + submit */}
      <form onSubmit={onSubmit} className="form-horizontal" style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div className="row mb-1">
          <div className="col-md-12">
            <label className="form-control-label">admin ปลายทาง (target) <span style={{ color: "red" }}>*</span></label>
            <select
              className="form-control"
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
        </div>

        {error && (
          <div className="alert alert-danger" role="alert" style={{ marginTop: 12 }}>
            ⚠ {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success" role="alert" style={{ marginTop: 12 }}>
            ✓ {success}
          </div>
        )}

        {confirmStep && targetAdmin && selected.size > 0 && (
          <div className="alert alert-warning" role="alert" style={{ marginTop: 12 }}>
            <strong>ยืนยันการย้าย?</strong> ลูกค้า {selected.size} ราย จะย้ายไปยัง <strong>{targetAdmin}</strong> ({adminLookup.get(targetAdmin)?.adminnickname ?? "-"})
            {fromBreakdown.length > 0 && (
              <>
                <br />
                จาก: {fromBreakdown.map(([from, n]) => `${from === "(unassigned)" ? "ยังไม่มี" : from} × ${n}`).join(" · ")}
              </>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 12 }}>
          <button
            type="button"
            className="btn btn-outline-secondary round"
            onClick={() => {
              setSelected(new Set()); setTargetAdmin(""); setError(null); setSuccess(null); setConfirmStep(false);
            }}
            disabled={pending}
          >
            ล้าง
          </button>
          <button
            type="submit"
            className="btn btn-color-main round"
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

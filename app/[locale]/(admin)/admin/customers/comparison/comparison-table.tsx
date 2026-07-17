"use client";

/**
 * Client table for /admin/customers/comparison (ค่าเทียบ / CPS).
 * Faithful to legacy `users-comparison.php`: list + per-row แก้ไขค่าเทียบ /
 * ลบค่าเทียบออก + an "เพิ่มสมาชิกค่าเทียบ" dialog (pick a customer + value).
 *
 * Every mutation goes through confirm-before-mutate (§0f) via PacredDialog /
 * useConfirmDialogs and the existing server actions in
 * actions/admin/users-pricing.ts (no new write paths). On success we
 * router.refresh() so the server-rendered list updates.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { PacredDialog, DialogFooter, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminSetUserComparison, adminRemoveUserComparison } from "@/actions/admin/users-pricing";

export type ComparisonRow = {
  userID: string;
  fullName: string;
  isJuristic: boolean;
  tel: string;
  email: string;
  lineId: string;
  facebook: string;
  address: string;
  registered: string | null;
  comparisonValue: number;
  adminIDSale: string;
  deleted: boolean;
};

export type CustomerPick = {
  userID: string;
  fullName: string;
  coID: string;
};

export function ComparisonTable({ rows, picks }: { rows: ComparisonRow[]; picks: CustomerPick[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();

  // Edit dialog state.
  const editRef = useRef<HTMLDialogElement>(null);
  const [editTarget, setEditTarget] = useState<ComparisonRow | null>(null);
  const [editValue, setEditValue] = useState("150");

  // Add dialog state.
  const addRef = useRef<HTMLDialogElement>(null);

  const view = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.userID.toLowerCase().includes(term) ||
        r.fullName.toLowerCase().includes(term) ||
        r.tel.toLowerCase().includes(term) ||
        r.email.toLowerCase().includes(term) ||
        r.adminIDSale.toLowerCase().includes(term),
    );
  }, [rows, filter]);

  function openEdit(r: ComparisonRow) {
    setEditTarget(r);
    setEditValue(String(r.comparisonValue || 150));
    queueMicrotask(() => editRef.current?.showModal());
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const value = Number(editValue);
    if (!Number.isFinite(value) || value < 0) {
      void alert("กรุณากรอกค่าเทียบเป็นตัวเลขที่ถูกต้อง");
      return;
    }
    start(async () => {
      const res = await adminSetUserComparison({ userid: editTarget.userID, value });
      if (res.ok) {
        editRef.current?.close();
        setEditTarget(null);
        router.refresh();
      } else {
        await alert(`บันทึกไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  async function handleRemove(r: ComparisonRow) {
    const ok = await confirm(`ต้องการลบ "${r.fullName}" (${r.userID}) ออกจากการคิดราคาแบบค่าเทียบ?`);
    if (!ok) return;
    start(async () => {
      const res = await adminRemoveUserComparison({ userid: r.userID });
      if (res.ok) router.refresh();
      else await alert(`ลบไม่สำเร็จ: ${res.error}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="กรองในหน้านี้: รหัส / ชื่อ / เบอร์ / อีเมล / เซลล์"
          className="rounded-lg border border-border px-3 py-1.5 text-sm w-72"
        />
        <span className="text-xs text-muted">
          {view.length === rows.length ? `${rows.length} ราย` : `${view.length} / ${rows.length} ราย`}
        </span>
        <button
          type="button"
          onClick={() => addRef.current?.showModal()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" /> เพิ่มสมาชิกค่าเทียบ
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3">ที่อยู่หลัก</th>
                <th className="px-4 py-3">ติดต่อ</th>
                <th className="px-4 py-3">วันที่สมัคร</th>
                <th className="px-4 py-3 text-right">ค่าเทียบ</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">ไม่พบลูกค้าค่าเทียบ</td></tr>
              )}
              {view.map((r) => (
                <tr key={r.userID} className="border-t border-border align-top hover:bg-surface-alt/30">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/admin/customers/${r.userID}`} className="text-primary-600 hover:underline">{r.userID}</Link>
                    {r.deleted && <div className="mt-0.5 text-[11px] text-red-600">บัญชีถูกลบ</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{r.fullName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[11px] ${r.isJuristic ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                        {r.isJuristic ? "นิติบุคคล" : "บุคคล"}
                      </span>
                      {r.adminIDSale && <span className="text-[11px] text-muted">เซลล์ {r.adminIDSale}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[260px]"><div className="break-words">{r.address}</div></td>
                  <td className="px-4 py-3 text-xs">
                    {r.tel && <div>โทร: {r.tel}</div>}
                    {r.email && <div className="text-muted">{r.email}</div>}
                    {r.lineId && <div className="text-muted">LINE: {r.lineId}</div>}
                    {!r.tel && !r.email && !r.lineId && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {r.registered ? new Date(r.registered).toLocaleDateString("th-TH") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-block rounded-md bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {r.comparisonValue.toLocaleString("th-TH")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openEdit(r)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-50 px-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Pencil className="w-3 h-3" /> แก้ไขค่าเทียบ
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleRemove(r)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> ลบค่าเทียบออก
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit value dialog */}
      <PacredDialog dialogRef={editRef} title={`แก้ไขค่าเทียบ — ${editTarget?.fullName ?? ""}`}>
        <form onSubmit={submitEdit}>
          <p className="mb-2 text-xs text-muted">รหัสสมาชิก: <CustomerCodeLink code={editTarget?.userID} className="text-xs" /></p>
          <label className="block text-sm font-medium text-gray-800">ค่าเทียบที่ใช้คิดค่าขนส่ง</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm"
            required
          />
          <DialogFooter onCancel={() => { editRef.current?.close(); setEditTarget(null); }} pending={pending} />
        </form>
      </PacredDialog>

      {/* Add member dialog */}
      <AddComparisonDialog
        dialogRef={addRef}
        picks={picks}
        pending={pending}
        onSubmit={(userID, value) =>
          start(async () => {
            const res = await adminSetUserComparison({ userid: userID, value });
            if (res.ok) {
              addRef.current?.close();
              router.refresh();
            } else {
              await alert(`เพิ่มไม่สำเร็จ: ${res.error}`);
            }
          })
        }
        alert={alert}
      />

      {dialogs}
    </div>
  );
}

// ── "เพิ่มสมาชิกค่าเทียบ" dialog — pick a customer + value (default 150) ──
function AddComparisonDialog({
  dialogRef,
  picks,
  pending,
  onSubmit,
  alert,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  picks: CustomerPick[];
  pending: boolean;
  onSubmit: (userID: string, value: number) => void;
  alert: (m: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState("150");

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term
      ? picks.filter((p) => p.userID.toLowerCase().includes(term) || p.fullName.toLowerCase().includes(term))
      : picks;
    return base.slice(0, 50);
  }, [picks, search]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { void alert("กรุณาเลือกลูกค้า"); return; }
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) { void alert("กรุณากรอกค่าเทียบเป็นตัวเลขที่ถูกต้อง"); return; }
    onSubmit(selected, v);
  }

  return (
    <PacredDialog dialogRef={dialogRef} title="เพิ่มสมาชิกคิดราคาตามค่าเทียบ">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-800">ค่าเทียบที่ใช้คิดค่าขนส่ง</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800">เลือกลูกค้า</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา รหัส / ชื่อ ลูกค้า…"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-gray-200">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">ไม่พบลูกค้า (ลองพิมพ์รหัส/ชื่อ)</p>
            ) : (
              matches.map((p) => (
                <label
                  key={p.userID}
                  className={`flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50 ${selected === p.userID ? "bg-primary-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="cps-pick"
                    value={p.userID}
                    checked={selected === p.userID}
                    onChange={() => setSelected(p.userID)}
                  />
                  <span className="font-mono text-xs text-primary-700">{p.userID}</span>
                  <span className="truncate">{p.fullName || "—"}</span>
                  {p.coID && <span className="ml-auto rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">{p.coID}</span>}
                </label>
              ))
            )}
          </div>
          {selected && <p className="mt-1 text-xs text-muted">เลือก: <span className="font-mono">{selected}</span></p>}
        </div>
        <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
          <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
          <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300">
            {pending && <Loader2 className="w-4 h-4 animate-spin" />} บันทึก
          </button>
        </div>
      </form>
    </PacredDialog>
  );
}

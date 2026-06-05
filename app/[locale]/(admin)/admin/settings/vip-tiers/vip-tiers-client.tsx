"use client";

/**
 * Client UI for /admin/settings/vip-tiers (ประเภทสมาชิก VIP).
 * Faithful to legacy `settings-vip.php`: list + เพิ่มประเภท / แก้ไข / ลบ.
 *
 * confirm-before-mutate (§0f) via PacredDialog / useConfirmDialogs; mutations
 * call actions/admin/settings-vip.ts. Delete is refused server-side while any
 * customer uses the tier — we also pre-warn (and keep the button enabled so the
 * server stays the single source of truth on the guard).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Users } from "lucide-react";
import { PacredDialog, DialogFooter, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminCreateVipTier, adminRenameVipTier, adminDeleteVipTier } from "@/actions/admin/settings-vip";

export type VipTierRow = {
  id: number;
  coID: string;
  coName: string;
  memberCount: number;
};

export function VipTiersClient({ rows }: { rows: VipTierRow[] }) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();

  // Create dialog.
  const addRef = useRef<HTMLDialogElement>(null);
  const [newCoID, setNewCoID] = useState("");
  const [newCoName, setNewCoName] = useState("");

  // Rename dialog.
  const editRef = useRef<HTMLDialogElement>(null);
  const [editTarget, setEditTarget] = useState<VipTierRow | null>(null);
  const [editCoName, setEditCoName] = useState("");

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const coID = newCoID.trim().toUpperCase();
    const coName = newCoName.trim();
    if (!coID || !coName) { void alert("กรุณากรอกตัวย่อและชื่อเต็มประเภท"); return; }
    start(async () => {
      const res = await adminCreateVipTier({ coID, coName });
      if (res.ok) {
        addRef.current?.close();
        setNewCoID("");
        setNewCoName("");
        router.refresh();
      } else {
        await alert(`เพิ่มไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  function openEdit(r: VipTierRow) {
    setEditTarget(r);
    setEditCoName(r.coName);
    queueMicrotask(() => editRef.current?.showModal());
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const coName = editCoName.trim();
    if (!coName) { void alert("กรุณากรอกชื่อเต็มประเภท"); return; }
    start(async () => {
      const res = await adminRenameVipTier({ coID: editTarget.coID, coName });
      if (res.ok) {
        editRef.current?.close();
        setEditTarget(null);
        router.refresh();
      } else {
        await alert(`บันทึกไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  async function handleDelete(r: VipTierRow) {
    const ok = await confirm(
      `ต้องการลบประเภทสมาชิก "${r.coName}" (${r.coID})?\n\nการลบจะมีผลต่อบัญชีลูกค้าในประเภทนี้ และลบตารางเรทราคาของประเภทนี้ทั้งหมด` +
        (r.memberCount > 0 ? `\n\n⚠️ ยังมีลูกค้า ${r.memberCount} รายในประเภทนี้ — ระบบจะปฏิเสธจนกว่าจะย้ายลูกค้าออกหมด` : ""),
    );
    if (!ok) return;
    start(async () => {
      const res = await adminDeleteVipTier({ coID: r.coID });
      if (res.ok) router.refresh();
      else await alert(`ลบไม่สำเร็จ: ${res.error}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center px-1">
        <span className="text-xs text-muted">{rows.length} ประเภท</span>
        <button
          type="button"
          onClick={() => addRef.current?.showModal()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" /> เพิ่มประเภทสมาชิก
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 w-16">ลำดับ</th>
                <th className="px-4 py-3">ตัวย่อ VIP</th>
                <th className="px-4 py-3">ชื่อเต็มประเภท</th>
                <th className="px-4 py-3 text-right">จำนวนลูกค้า</th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-muted">ยังไม่มีประเภทสมาชิก VIP</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border align-top hover:bg-surface-alt/30">
                  <td className="px-4 py-3 text-xs text-muted">{i + 1}</td>
                  <td className="px-4 py-3"><span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{r.coID}</span></td>
                  <td className="px-4 py-3 text-sm">{r.coName || "—"}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="inline-flex items-center gap-1 text-muted"><Users className="w-3 h-3" />{r.memberCount.toLocaleString("th-TH")}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => openEdit(r)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-blue-50 px-2 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        <Pencil className="w-3 h-3" /> แก้ไข
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDelete(r)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        <Trash2 className="w-3 h-3" /> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create tier dialog */}
      <PacredDialog dialogRef={addRef} title="เพิ่มประเภทสมาชิก VIP">
        <form onSubmit={submitCreate} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-800">ตัวย่อ VIP</label>
            <input
              value={newCoID}
              onChange={(e) => setNewCoID(e.target.value)}
              maxLength={10}
              placeholder="เช่น VIP, SVIP"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
              required
            />
            <p className="mt-1 text-[11px] text-muted">ตัวอักษร/ตัวเลข ไม่เกิน 10 ตัว · เปลี่ยนภายหลังไม่ได้</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800">ชื่อเต็มประเภท VIP</label>
            <input
              value={newCoName}
              onChange={(e) => setNewCoName(e.target.value)}
              maxLength={200}
              placeholder="ชื่อเต็มประเภทสมาชิก"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <p className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            เมื่อบันทึก ระบบจะสร้างตารางเรทราคา (กก./คิว · 16 ช่องต่อตาราง) ให้อัตโนมัติ — ตั้งค่าเรทแต่ละช่องได้ที่หน้า “Rate Override ตามกลุ่ม VIP”
          </p>
          <DialogFooter onCancel={() => addRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>

      {/* Rename tier dialog */}
      <PacredDialog dialogRef={editRef} title={`แก้ไขประเภทสมาชิก — ${editTarget?.coID ?? ""}`}>
        <form onSubmit={submitEdit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-800">ตัวย่อ VIP</label>
            <input value={editTarget?.coID ?? ""} disabled className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500" />
            <p className="mt-1 text-[11px] text-muted">ตัวย่อแก้ไขไม่ได้</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800">ชื่อเต็มประเภท VIP</label>
            <input value={editCoName} onChange={(e) => setEditCoName(e.target.value)} maxLength={200} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" required />
          </div>
          <DialogFooter onCancel={() => { editRef.current?.close(); setEditTarget(null); }} pending={pending} />
        </form>
      </PacredDialog>

      {dialogs}
    </div>
  );
}

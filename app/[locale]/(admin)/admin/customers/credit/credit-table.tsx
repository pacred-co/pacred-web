"use client";

/**
 * Client table for /admin/customers/credit (เครดิต).
 * Faithful to legacy `users-credit.php`: list + per-row แก้ไขเครดิต /
 * ลบเครดิตออก + an "เพิ่มสมาชิกเครดิต" dialog (pick a customer + วงเงิน + วัน).
 *
 * confirm-before-mutate (§0f) via PacredDialog / useConfirmDialogs; the
 * mutations call the existing actions in actions/admin/users-pricing.ts
 * (adminSetUserCredit / adminRemoveUserCredit) — no new write paths. Remove
 * is refused server-side while outstanding > 0; we surface that error inline.
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { PacredDialog, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { Explain } from "@/components/ui/tooltip";
import { adminSetUserCredit, adminRemoveUserCredit } from "@/actions/admin/users-pricing";

export type CreditRow = {
  userID: string;
  fullName: string;
  isJuristic: boolean;
  tel: string;
  email: string;
  lineId: string;
  address: string;
  registered: string | null;
  creditDays: number;
  creditLimit: number;
  outstanding: number;
  remaining: number;
  adminIDSale: string;
  deleted: boolean;
};

export type CustomerPick = {
  userID: string;
  fullName: string;
  coID: string;
};

function baht(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CreditTable({ rows, picks }: { rows: CreditRow[]; picks: CustomerPick[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();

  const editRef = useRef<HTMLDialogElement>(null);
  const [editTarget, setEditTarget] = useState<CreditRow | null>(null);
  const [editLimit, setEditLimit] = useState("");
  const [editDays, setEditDays] = useState("");

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

  function openEdit(r: CreditRow) {
    setEditTarget(r);
    setEditLimit(String(r.creditLimit || ""));
    setEditDays(String(r.creditDays || ""));
    queueMicrotask(() => editRef.current?.showModal());
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    const limit = Number(editLimit);
    const days = Number(editDays);
    if (!Number.isFinite(limit) || limit < 0) { void alert("กรุณากรอกวงเงินเป็นตัวเลขที่ถูกต้อง"); return; }
    if (!Number.isInteger(days) || days < 0) { void alert("กรุณากรอกจำนวนวันเป็นจำนวนเต็มที่ถูกต้อง"); return; }
    start(async () => {
      const res = await adminSetUserCredit({ userid: editTarget.userID, limit, days });
      if (res.ok) {
        editRef.current?.close();
        setEditTarget(null);
        router.refresh();
      } else {
        await alert(`บันทึกไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  async function handleRemove(r: CreditRow) {
    const ok = await confirm(
      `ต้องการลบเครดิตของ "${r.fullName}" (${r.userID})?` +
        (r.outstanding > 0 ? `\n\n⚠️ ยังมียอดค้างชำระเครดิต ฿${baht(r.outstanding)} — ระบบจะปฏิเสธจนกว่ายอดค้างจะเป็น 0` : ""),
    );
    if (!ok) return;
    start(async () => {
      const res = await adminRemoveUserCredit({ userid: r.userID });
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
          <Plus className="w-4 h-4" /> เพิ่มสมาชิกเครดิต
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">รหัส</th>
                <th className="px-4 py-3">
                  <Explain label="ชื่อ-นามสกุล" def="ป้ายใต้ชื่อบอก บุคคล/นิติบุคคล + เซลล์ผู้ดูแล (แอดมินฝ่ายขายที่รับผิดชอบ) — นิติบุคคลใช้หัก ณ ที่จ่าย 1% ตอนวางบิล" />
                </th>
                <th className="px-4 py-3">ที่อยู่หลัก</th>
                <th className="px-4 py-3">ติดต่อ</th>
                <th className="px-4 py-3">วันที่สมัคร</th>
                <th className="px-4 py-3 text-right">
                  <Explain label="วันเครดิต" def="เทอมเครดิต = จำนวนวันที่ลูกค้าจ่ายทีหลังได้หลังรับของ (เช่น 7/15/30 วัน) ก่อนถือว่าค้างชำระ" align="right" />
                </th>
                <th className="px-4 py-3 text-right">
                  <Explain label="วงเงิน" def="วงเงินเครดิต = เพดานยอดที่ลูกค้าค้างจ่ายได้พร้อมกัน · เกินวงเงินต้องโอนเพิ่ม/ขอเพิ่มวงก่อนสั่งต่อ" align="right" />
                </th>
                <th className="px-4 py-3 text-right">
                  <Explain label="คงเหลือ" def="วงเงินคงเหลือ = วงเงิน − ยอดที่ใช้ไป (ค้างชำระ) · ติดลบ (แดง) = ใช้เกินวงเงิน ต้องตามเก็บ/จ่ายส่วนเกิน" align="right" />
                </th>
                <th className="px-4 py-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted">ไม่พบลูกค้าเครดิต</td></tr>
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
                  <td className="px-4 py-3 text-xs max-w-[240px]"><div className="break-words">{r.address}</div></td>
                  <td className="px-4 py-3 text-xs">
                    {r.tel && <div>โทร: {r.tel}</div>}
                    {r.email && <div className="text-muted">{r.email}</div>}
                    {r.lineId && <div className="text-muted">LINE: {r.lineId}</div>}
                    {!r.tel && !r.email && !r.lineId && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {r.registered ? new Date(r.registered).toLocaleDateString("th-TH") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">{r.creditDays} วัน</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">฿{baht(r.creditLimit)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    <span className={r.remaining < 0 ? "font-semibold text-red-600" : ""}>฿{baht(r.remaining)}</span>
                    {r.outstanding > 0 && <div className="text-[11px] text-muted">ค้าง ฿{baht(r.outstanding)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => openEdit(r)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-50 px-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Pencil className="w-3 h-3" /> แก้ไขเครดิต
                        </button>
                        <Explain def="กดเพื่อปรับวงเงิน + จำนวนวันเครดิตของลูกค้ารายนี้ — มีกล่องยืนยันก่อนบันทึก" align="right" />
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleRemove(r)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-50 px-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3" /> ลบเครดิตออก
                        </button>
                        <Explain def="กดเพื่อยกเลิกสิทธิ์เครดิต (กลับเป็นลูกค้าเงินสด) — ระบบจะปฏิเสธถ้ายังมียอดค้างชำระเครดิต > 0" align="right" />
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit credit dialog */}
      <PacredDialog dialogRef={editRef} title={`แก้ไขเครดิต — ${editTarget?.fullName ?? ""}`}>
        <form onSubmit={submitEdit} className="space-y-3">
          <p className="text-xs text-muted">รหัสสมาชิก: <CustomerCodeLink code={editTarget?.userID} className="text-xs" /></p>
          <div>
            <label className="block text-sm font-medium text-gray-800">วงเงินเครดิต (บาท)</label>
            <input type="number" min={0} step="0.01" value={editLimit} onChange={(e) => setEditLimit(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800">จำนวนวันเครดิต</label>
            <input type="number" min={0} step="1" value={editDays} onChange={(e) => setEditDays(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm" required />
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
            <button type="button" onClick={() => { editRef.current?.close(); setEditTarget(null); }} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:bg-gray-300">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />} บันทึก
            </button>
          </div>
        </form>
      </PacredDialog>

      {/* Add member dialog */}
      <AddCreditDialog
        dialogRef={addRef}
        picks={picks}
        pending={pending}
        onSubmit={(userID, limit, days) =>
          start(async () => {
            const res = await adminSetUserCredit({ userid: userID, limit, days });
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

// ── "เพิ่มสมาชิกเครดิต" dialog — pick a customer + วงเงิน + จำนวนวัน ──
function AddCreditDialog({
  dialogRef,
  picks,
  pending,
  onSubmit,
  alert,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  picks: CustomerPick[];
  pending: boolean;
  onSubmit: (userID: string, limit: number, days: number) => void;
  alert: (m: string) => Promise<boolean>;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [limit, setLimit] = useState("");
  const [days, setDays] = useState("");

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
    const l = Number(limit);
    const d = Number(days);
    if (!Number.isFinite(l) || l < 0) { void alert("กรุณากรอกวงเงินเป็นตัวเลขที่ถูกต้อง"); return; }
    if (!Number.isInteger(d) || d < 0) { void alert("กรุณากรอกจำนวนวันเป็นจำนวนเต็มที่ถูกต้อง"); return; }
    onSubmit(selected, l, d);
  }

  return (
    <PacredDialog dialogRef={dialogRef} title="เพิ่มสมาชิกเครดิต">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-800">วงเงินเครดิต (บาท)</label>
            <input type="number" min={0} step="0.01" value={limit} onChange={(e) => setLimit(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800">จำนวนวันเครดิต</label>
            <input type="number" min={0} step="1" value={days} onChange={(e) => setDays(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-right text-sm" required />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800">เลือกลูกค้า</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา รหัส / ชื่อ ลูกค้า…" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-gray-200">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted">ไม่พบลูกค้า (ลองพิมพ์รหัส/ชื่อ)</p>
            ) : (
              matches.map((p) => (
                <label key={p.userID} className={`flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50 ${selected === p.userID ? "bg-primary-50" : ""}`}>
                  <input type="radio" name="credit-pick" value={p.userID} checked={selected === p.userID} onChange={() => setSelected(p.userID)} />
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

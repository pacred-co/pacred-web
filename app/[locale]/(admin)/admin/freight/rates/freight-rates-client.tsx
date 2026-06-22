"use client";

/**
 * Client UI for /admin/freight/rates — China freight COST-rate maintenance.
 *
 * List `tb_freight_rate` rows + add / edit / toggle-active / delete. Every
 * mutation is confirm-before-mutate (§0f) via PacredDialog (forms) +
 * useConfirmDialogs (toggle/delete). Writes go to actions/admin/freight-rates.ts
 * which gates super/ops; accounting sees a read-only view (canWrite=false hides
 * all mutate controls — the server is still the single source of truth on RBAC).
 *
 * Wide table → overflow-x-auto + scrollbar-x-visible (Windows-Chrome hides the
 * scrollbar by default · §0c).
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, HandCoins, Power } from "lucide-react";
import { PacredDialog, DialogFooter, useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  adminCreateFreightRate,
  adminUpdateFreightRate,
  adminToggleFreightRate,
  adminDeleteFreightRate,
  type FreightRateRow,
} from "@/actions/admin/freight-rates";

const MODE_LABEL: Record<string, string> = {
  sea_fcl: "เรือ FCL (เต็มตู้)",
  sea_lcl: "เรือ LCL (รวมตู้)",
  air: "แอร์",
};
const UNIT_LABEL: Record<string, string> = {
  container: "ต่อตู้",
  cbm: "ต่อคิว (CBM)",
  kg: "ต่อกิโล (KG)",
};

type FormState = {
  transport_mode: string;
  pol: string;
  pod: string;
  carrier: string;
  container_type: string;
  cost_usd: string;
  unit: string;
  fx_thb_per_usd: string;
  effective_from: string;
  active: boolean;
  note: string;
};

function blankForm(): FormState {
  return {
    transport_mode: "sea_fcl",
    pol: "",
    pod: "",
    carrier: "",
    container_type: "",
    cost_usd: "",
    unit: "container",
    fx_thb_per_usd: "35",
    effective_from: new Date().toISOString().slice(0, 10),
    active: true,
    note: "",
  };
}

function rowToForm(r: FreightRateRow): FormState {
  return {
    transport_mode: r.transport_mode,
    pol: r.pol,
    pod: r.pod,
    carrier: r.carrier,
    container_type: r.container_type,
    cost_usd: String(r.cost_usd),
    unit: r.unit,
    fx_thb_per_usd: String(r.fx_thb_per_usd),
    effective_from: r.effective_from,
    active: r.active,
    note: r.note,
  };
}

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Preview ฿ per unit = cost_usd × fx (matches the reader's per-unit math). */
function previewPerUnitThb(f: FormState): number {
  const cost = Number(f.cost_usd) || 0;
  const fx = Number(f.fx_thb_per_usd) || 0;
  return Math.round(cost * fx * 100) / 100;
}

export function FreightRatesClient({
  rows,
  canWrite,
  loadFailed = false,
}: {
  rows: FreightRateRow[];
  canWrite: boolean;
  /** True when the rate list query errored — show a "load failed" banner so an
   *  empty table isn't mistaken for "no rates yet" (and re-created as a dup). */
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();

  const formRef = useRef<HTMLDialogElement>(null);
  const [editId, setEditId] = useState<string | null>(null); // null = create mode
  const [form, setForm] = useState<FormState>(blankForm());

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setEditId(null);
    setForm(blankForm());
    formRef.current?.showModal();
  }

  function openEdit(r: FreightRateRow) {
    setEditId(r.id);
    setForm(rowToForm(r));
    formRef.current?.showModal();
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cost_usd || Number(form.cost_usd) <= 0) {
      void alert("กรุณากรอกต้นทุน (USD) ให้มากกว่า 0");
      return;
    }
    if (!form.fx_thb_per_usd || Number(form.fx_thb_per_usd) <= 0) {
      void alert("กรุณากรอกเรท FX ให้มากกว่า 0");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.effective_from)) {
      void alert("กรุณาเลือกวันที่มีผล");
      return;
    }
    start(async () => {
      const payload = {
        transport_mode: form.transport_mode as "sea_fcl" | "sea_lcl" | "air",
        pol: form.pol,
        pod: form.pod,
        carrier: form.carrier,
        container_type: form.container_type,
        cost_usd: Number(form.cost_usd),
        unit: form.unit as "container" | "cbm" | "kg",
        fx_thb_per_usd: Number(form.fx_thb_per_usd),
        effective_from: form.effective_from,
        active: form.active,
        note: form.note,
      };
      const res = editId
        ? await adminUpdateFreightRate({ id: editId, ...payload })
        : await adminCreateFreightRate(payload);
      if (res.ok) {
        formRef.current?.close();
        router.refresh();
      } else {
        await alert(`${editId ? "บันทึก" : "เพิ่ม"}ไม่สำเร็จ: ${res.error}`);
      }
    });
  }

  async function handleToggle(r: FreightRateRow) {
    const next = !r.active;
    const ok = await confirm(
      next
        ? `เปิดใช้งานต้นทุน ${MODE_LABEL[r.transport_mode] ?? r.transport_mode} (${UNIT_LABEL[r.unit] ?? r.unit})?\n\nระบบจะเริ่มนำต้นทุนนี้ไปคำนวณกำไรสุทธิของใบเสนอราคา Freight`
        : `ปิดใช้งานต้นทุน ${MODE_LABEL[r.transport_mode] ?? r.transport_mode} (${UNIT_LABEL[r.unit] ?? r.unit})?\n\nใบเสนอราคาจะกลับไปแสดงเพียง “กำไรขั้นต้น” สำหรับโหมดนี้จนกว่าจะมีต้นทุนอื่นที่เปิดใช้งาน`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminToggleFreightRate({ id: r.id, active: next });
      if (res.ok) router.refresh();
      else await alert(`เปลี่ยนสถานะไม่สำเร็จ: ${res.error}`);
    });
  }

  async function handleDelete(r: FreightRateRow) {
    const ok = await confirm(
      `ต้องการลบรายการต้นทุน ${MODE_LABEL[r.transport_mode] ?? r.transport_mode} (${UNIT_LABEL[r.unit] ?? r.unit}) ราคา $${r.cost_usd}?\n\nการลบจะนำต้นทุนนี้ออกจากการคำนวณในอนาคต (ใบเสนอราคาเดิมไม่กระทบ เพราะระบบบันทึกต้นทุนไว้ในใบเสนอราคาแล้ว). หากเพียงต้องการหยุดใช้ชั่วคราว แนะนำให้ “ปิดใช้งาน” แทน`,
    );
    if (!ok) return;
    start(async () => {
      const res = await adminDeleteFreightRate({ id: r.id });
      if (res.ok) router.refresh();
      else await alert(`ลบไม่สำเร็จ: ${res.error}`);
    });
  }

  const isEdit = editId !== null;

  return (
    <div className="space-y-3">
      {loadFailed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ โหลดรายการต้นทุนไม่สำเร็จ (เกิดข้อผิดพลาดชั่วคราว) — ตารางอาจไม่ครบ.
          กรุณารีเฟรชก่อนเพิ่มรายการใหม่ เพื่อเลี่ยงการสร้างต้นทุนซ้ำ.
        </div>
      )}
      <div className="flex items-center px-1">
        <span className="text-xs text-muted">{rows.length} รายการต้นทุน</span>
        {canWrite && (
          <button
            type="button"
            onClick={openCreate}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> เพิ่มต้นทุน
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm min-w-[920px]">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-3">โหมดขนส่ง</th>
                <th className="px-3 py-3">เส้นทาง (POL → POD)</th>
                <th className="px-3 py-3">สายเรือ / ประเภทตู้</th>
                <th className="px-3 py-3 text-right">ต้นทุน (USD)</th>
                <th className="px-3 py-3">หน่วย</th>
                <th className="px-3 py-3 text-right">FX</th>
                <th className="px-3 py-3 text-right">≈ ฿/หน่วย</th>
                <th className="px-3 py-3">มีผลตั้งแต่</th>
                <th className="px-3 py-3">สถานะ</th>
                {canWrite && <th className="px-3 py-3">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canWrite ? 10 : 9} className="px-4 py-12 text-center">
                    <div className="space-y-2">
                      <HandCoins className="mx-auto h-7 w-7 text-muted" aria-hidden />
                      <p className="text-sm font-medium text-foreground">ยังไม่มีต้นทุนเฟรทจีน</p>
                      <p className="text-xs text-muted max-w-md mx-auto">
                        {canWrite
                          ? "กด “เพิ่มต้นทุน” เพื่อกรอกต้นทุนค่าขนส่งฝั่งจีน — ระบบจะใช้คำนวณกำไรสุทธิจริงของใบเสนอราคา Freight"
                          : "เมื่อทีมปฏิบัติการเพิ่มต้นทุนค่าขนส่งฝั่งจีน รายการจะปรากฏที่นี่"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top hover:bg-surface-alt/30">
                  <td className="px-3 py-3">{MODE_LABEL[r.transport_mode] ?? r.transport_mode}</td>
                  <td className="px-3 py-3 text-xs">
                    {(r.pol || "ทุกต้นทาง")} → {(r.pod || "ทุกปลายทาง")}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {r.carrier || "—"}
                    {r.container_type && <span className="ml-1 text-muted">· {r.container_type}</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">${Number(r.cost_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-3 text-xs">{UNIT_LABEL[r.unit] ?? r.unit}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{Number(r.fx_thb_per_usd).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">{thb(Number(r.cost_usd) * Number(r.fx_thb_per_usd))}</td>
                  <td className="px-3 py-3 text-xs text-muted">{r.effective_from}</td>
                  <td className="px-3 py-3">
                    {r.active ? (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">เปิดใช้งาน</span>
                    ) : (
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">ปิดใช้งาน</span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-3">
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
                          onClick={() => handleToggle(r)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg bg-amber-50 px-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Power className="w-3 h-3" /> {r.active ? "ปิด" : "เปิด"}
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit dialog (confirm-before-mutate · §0f) */}
      <PacredDialog dialogRef={formRef} size="lg" title={isEdit ? "แก้ไขต้นทุนเฟรทจีน" : "เพิ่มต้นทุนเฟรทจีน"}>
        <form onSubmit={submitForm} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-800">โหมดขนส่ง</label>
              <select
                value={form.transport_mode}
                onChange={(e) => set("transport_mode", e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {Object.entries(MODE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">หน่วยคิดต้นทุน</label>
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {Object.entries(UNIT_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">ต้นทุนต่อหน่วย (USD)</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.cost_usd}
                onChange={(e) => set("cost_usd", e.target.value)}
                placeholder="เช่น 350"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">เรท FX (บาท/USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.fx_thb_per_usd}
                onChange={(e) => set("fx_thb_per_usd", e.target.value)}
                placeholder="35.00"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">ท่าต้นทาง POL <span className="text-muted">(ว่าง = ทุกเส้นทาง)</span></label>
              <input
                value={form.pol}
                onChange={(e) => set("pol", e.target.value)}
                maxLength={60}
                placeholder="เช่น CNSHA"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">ท่าปลายทาง POD <span className="text-muted">(ว่าง = ทุกเส้นทาง)</span></label>
              <input
                value={form.pod}
                onChange={(e) => set("pod", e.target.value)}
                maxLength={60}
                placeholder="เช่น THBKK"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">สายเรือ / Carrier <span className="text-muted">(ไม่บังคับ)</span></label>
              <input
                value={form.carrier}
                onChange={(e) => set("carrier", e.target.value)}
                maxLength={60}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">ประเภทตู้ <span className="text-muted">(FCL: 20/40/40HQ)</span></label>
              <input
                value={form.container_type}
                onChange={(e) => set("container_type", e.target.value)}
                maxLength={20}
                placeholder="เช่น 40HQ"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">มีผลตั้งแต่วันที่</label>
              <input
                type="date"
                value={form.effective_from}
                onChange={(e) => set("effective_from", e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => set("active", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                เปิดใช้งาน (นำไปคำนวณกำไรสุทธิ)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800">หมายเหตุ <span className="text-muted">(ไม่บังคับ)</span></label>
            <input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              maxLength={500}
              placeholder="ที่มาของเรท / เดือนอ้างอิง / ผู้แจ้ง"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <p className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            ต้นทุนโดยประมาณ ≈ <strong>{thb(previewPerUnitThb(form))}</strong> / {UNIT_LABEL[form.unit] ?? form.unit}
            {" "}(USD {form.cost_usd || 0} × FX {form.fx_thb_per_usd || 0}). ระบบจะคูณด้วยจำนวนหน่วยของแต่ละ shipment ตอนคำนวณกำไรสุทธิ.
          </p>

          <DialogFooter onCancel={() => formRef.current?.close()} pending={pending} />
        </form>
      </PacredDialog>

      {dialogs}
    </div>
  );
}

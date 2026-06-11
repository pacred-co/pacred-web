"use client";

/**
 * <HsLibraryClient> — the คลัง HS CRUD surface (search + table + add/edit form).
 *
 * Manages the hs_codes dictionary via upsertHsCode / listHsCodes (actions/admin/
 * hs-codes.ts). Confirm-before-mutate (AGENTS.md §0f) via the shared
 * useConfirmDialogs. Hardcoded Thai labels (faithful-port convention · no i18n).
 *
 * ⚠️ Reference data only (AGENTS.md §0e) — nothing here touches selling price /
 * money / a declaration's persisted duty.
 */

import { useState, useTransition } from "react";
import { Search, Plus, Pencil, X } from "lucide-react";
import { listHsCodes, upsertHsCode, type HsCodeListRow } from "@/actions/admin/hs-codes";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

export type HsRow = {
  code:             string;
  description:      string;
  description_en:   string | null;
  default_duty_pct: number | string;
  form_e_duty_pct:  number | string | null;
  other_forms:      Record<string, number> | null;
  unit:             string | null;
  hs_note:          string | null;
  note:             string | null;
  is_active:        boolean;
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const numInputCls = inputCls + " text-right tabular-nums";
const btnPrimary =
  "inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50";

function pct(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("th-TH", { maximumFractionDigits: 3 })}%`;
}

/** A single editable "other forms" row in the form draft. */
type OtherFormDraft = { name: string; pct: string };

function otherFormsToDrafts(m: Record<string, number> | null): OtherFormDraft[] {
  if (!m) return [];
  return Object.entries(m).map(([name, p]) => ({ name, pct: String(p) }));
}

export function HsLibraryClient({ initialRows }: { initialRows: HsRow[] }) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [rows, setRows] = useState<HsRow[]>(initialRows);
  const [search, setSearch] = useState("");
  const [searching, startSearch] = useTransition();
  const [saving, startSave] = useTransition();

  // Form state — null = closed, "new" = add, otherwise editing an existing code.
  const [formMode, setFormMode] = useState<null | "new" | "edit">(null);
  const [origCode, setOrigCode] = useState<string | null>(null);
  const [fCode, setFCode] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDescEn, setFDescEn] = useState("");
  const [fDuty, setFDuty] = useState("");
  const [fFormE, setFFormE] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fNote, setFNote] = useState("");
  const [fActive, setFActive] = useState(true);
  const [fOther, setFOther] = useState<OtherFormDraft[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  function runSearch(term: string) {
    startSearch(async () => {
      const res = await listHsCodes(term);
      if (res.ok && res.data) {
        // listHsCodes returns the FULL field set, so a searched row carries its
        // real other_forms/description_en/unit/hs_note into openEdit — editing a
        // searched row no longer wipes the stored other_forms map.
        setRows(
          res.data.map((r: HsCodeListRow) => ({
            code:             r.code,
            description:      r.description,
            description_en:   r.description_en,
            default_duty_pct: r.default_duty_pct,
            form_e_duty_pct:  r.form_e_duty_pct,
            other_forms:      r.other_forms,
            unit:             r.unit,
            hs_note:          r.hs_note,
            note:             r.note,
            is_active:        r.is_active,
          })),
        );
      }
    });
  }

  function openNew() {
    setFormMode("new");
    setOrigCode(null);
    setFCode("");
    setFDesc("");
    setFDescEn("");
    setFDuty("");
    setFFormE("");
    setFUnit("");
    setFNote("");
    setFActive(true);
    setFOther([]);
    setFormErr(null);
  }

  function openEdit(r: HsRow) {
    setFormMode("edit");
    setOrigCode(r.code);
    setFCode(r.code);
    setFDesc(r.description);
    setFDescEn(r.description_en ?? "");
    setFDuty(String(r.default_duty_pct ?? ""));
    setFFormE(r.form_e_duty_pct == null ? "" : String(r.form_e_duty_pct));
    setFUnit(r.unit ?? "");
    setFNote(r.hs_note ?? "");
    setFActive(r.is_active);
    setFOther(otherFormsToDrafts(r.other_forms));
    setFormErr(null);
  }

  function closeForm() {
    setFormMode(null);
    setFormErr(null);
  }

  async function onSave() {
    setFormErr(null);
    const code = fCode.trim();
    const desc = fDesc.trim();
    if (!code) { setFormErr("กรุณากรอกพิกัด HS Code"); return; }
    if (!desc) { setFormErr("กรุณากรอกคำอธิบายสินค้า"); return; }
    const duty = Number(fDuty);
    if (!Number.isFinite(duty) || duty < 0 || duty > 100) {
      setFormErr("อากรปกติ (%) ต้องอยู่ระหว่าง 0–100");
      return;
    }
    let formE: number | undefined;
    if (fFormE.trim() !== "") {
      const fe = Number(fFormE);
      if (!Number.isFinite(fe) || fe < 0 || fe > 100) {
        setFormErr("อากร Form-E (%) ต้องอยู่ระหว่าง 0–100");
        return;
      }
      formE = fe;
    }
    // Build the other_forms map, validating each pct.
    const other: Record<string, number> = {};
    for (const o of fOther) {
      const name = o.name.trim();
      if (!name) continue;
      const p = Number(o.pct);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        setFormErr(`อากรของฟอร์ม "${name}" ต้องอยู่ระหว่าง 0–100`);
        return;
      }
      other[name] = p;
    }

    const ok = await confirm(
      `${formMode === "new" ? "เพิ่ม" : "บันทึกการแก้ไข"}พิกัด HS "${code}" ลงคลัง HS?\n` +
        "⚠️ ข้อมูลอ้างอิงเท่านั้น — ไม่กระทบราคาขาย · ออเดอร์ · หรืออากรในใบขน",
    );
    if (!ok) return;

    startSave(async () => {
      const res = await upsertHsCode({
        code,
        description:      desc,
        description_en:   fDescEn.trim() || undefined,
        default_duty_pct: duty,
        form_e_duty_pct:  formE,
        other_forms:      other,
        unit:             fUnit.trim() || undefined,
        hs_note:          fNote.trim() || undefined,
        is_active:        fActive,
      });
      if (!res.ok) {
        setFormErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      // Optimistic local upsert so the table reflects the change immediately,
      // then refresh the list from the server to pick up canonical values.
      const updated: HsRow = {
        code,
        description:      desc,
        description_en:   fDescEn.trim() || null,
        default_duty_pct: duty,
        form_e_duty_pct:  formE ?? 0,
        other_forms:      other,
        unit:             fUnit.trim() || null,
        hs_note:          fNote.trim() || null,
        note:             null,
        is_active:        fActive,
      };
      setRows((prev) => {
        const without = prev.filter((r) => r.code !== code && r.code !== origCode);
        return [...without, updated].sort((a, b) => a.code.localeCompare(b.code));
      });
      closeForm();
      await alert("บันทึกลงคลัง HS เรียบร้อย");
    });
  }

  return (
    <div className="space-y-4">
      {dialogs}

      {/* ── search + add ── */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(search);
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา พิกัด HS หรือ คำอธิบาย…"
              className={inputCls + " pl-8 w-64"}
            />
          </div>
          <button type="submit" disabled={searching} className={btnGhost}>
            {searching ? "กำลังค้นหา…" : "ค้นหา"}
          </button>
          {search && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setSearch("");
                runSearch("");
              }}
            >
              ล้าง
            </button>
          )}
        </form>
        <div className="ml-auto">
          <button type="button" className={btnPrimary} onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> เพิ่มพิกัด HS
          </button>
        </div>
      </div>

      {/* ── add / edit form ── */}
      {formMode && (
        <section className="rounded-2xl border border-primary-200 bg-primary-50/30 dark:bg-primary-950/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">
              {formMode === "new" ? "➕ เพิ่มพิกัด HS ใหม่" : `✏️ แก้ไขพิกัด HS · ${origCode}`}
            </h2>
            <button type="button" className="text-muted hover:text-foreground" onClick={closeForm}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {formErr && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {formErr}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">พิกัด HS Code *</span>
              <input
                type="text"
                value={fCode}
                onChange={(e) => setFCode(e.target.value)}
                disabled={formMode === "edit"}
                placeholder="เช่น 8517.12.00"
                maxLength={20}
                className={inputCls + " font-mono disabled:opacity-60"}
              />
              {formMode === "edit" && (
                <span className="block text-[10px] text-muted">แก้ไขพิกัดไม่ได้ — ลบแล้วเพิ่มใหม่หากต้องเปลี่ยน</span>
              )}
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">หน่วย</span>
              <input
                type="text"
                value={fUnit}
                onChange={(e) => setFUnit(e.target.value)}
                placeholder="piece / kg / set"
                maxLength={20}
                className={inputCls}
              />
            </label>
            <label className="space-y-0.5 sm:col-span-2">
              <span className="block text-[11px] text-muted">คำอธิบายสินค้า (ไทย) *</span>
              <input
                type="text"
                value={fDesc}
                onChange={(e) => setFDesc(e.target.value)}
                placeholder="เช่น โทรศัพท์มือถือ smartphone"
                maxLength={300}
                className={inputCls}
              />
            </label>
            <label className="space-y-0.5 sm:col-span-2">
              <span className="block text-[11px] text-muted">คำอธิบาย (อังกฤษ)</span>
              <input
                type="text"
                value={fDescEn}
                onChange={(e) => setFDescEn(e.target.value)}
                placeholder="(optional)"
                maxLength={300}
                className={inputCls}
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">อากรปกติ (%) *</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.001"
                inputMode="decimal"
                value={fDuty}
                onChange={(e) => setFDuty(e.target.value)}
                placeholder="0"
                className={numInputCls}
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">อากร Form-E / ACFTA (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.001"
                inputMode="decimal"
                value={fFormE}
                onChange={(e) => setFFormE(e.target.value)}
                placeholder="0"
                className={numInputCls}
              />
            </label>
          </div>

          {/* ── other preferential forms (อื่นๆ) ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted">ฟอร์มอื่นๆ (อากรพิเศษ)</span>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
                onClick={() => setFOther((p) => [...p, { name: "", pct: "" }])}
              >
                <Plus className="h-3 w-3" /> เพิ่มฟอร์ม
              </button>
            </div>
            {fOther.length === 0 ? (
              <p className="text-[10px] text-muted">— ยังไม่มีฟอร์มอื่น — กด “เพิ่มฟอร์ม” เช่น Form-D (ATIGA), Form-AK</p>
            ) : (
              <div className="space-y-1.5">
                {fOther.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={o.name}
                      onChange={(e) =>
                        setFOther((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                      placeholder="ชื่อฟอร์ม เช่น Form-D (ATIGA)"
                      maxLength={60}
                      className={inputCls + " flex-1"}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.001"
                      inputMode="decimal"
                      value={o.pct}
                      onChange={(e) =>
                        setFOther((p) => p.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))
                      }
                      placeholder="%"
                      className={numInputCls + " w-24"}
                    />
                    <button
                      type="button"
                      className="text-muted hover:text-red-600"
                      onClick={() => setFOther((p) => p.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="space-y-0.5 block">
            <span className="block text-[11px] text-muted">หมายเหตุ (เงื่อนไข / ของควบคุม)</span>
            <textarea
              value={fNote}
              onChange={(e) => setFNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className={inputCls}
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
            ใช้งาน (แสดงในตัวเลือก)
          </label>

          <div className="flex gap-2 pt-1">
            <button type="button" disabled={saving} className={btnPrimary} onClick={onSave}>
              {saving ? "กำลังบันทึก…" : "บันทึกลงคลัง HS"}
            </button>
            <button type="button" disabled={saving} className={btnGhost} onClick={closeForm}>
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {/* ── table ── */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-xs text-muted">
            {search ? "ไม่พบพิกัด HS ที่ตรงกับการค้นหา" : "ยังไม่มีพิกัด HS ในคลัง — กด “เพิ่มพิกัด HS”"}
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">พิกัด HS</th>
                  <th className="px-3 py-2">คำอธิบาย</th>
                  <th className="px-3 py-2 text-right">อากรปกติ</th>
                  <th className="px-3 py-2 text-right">Form-E</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                    <td className="px-3 py-2 text-[13px]">{r.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{pct(r.default_duty_pct)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{pct(r.form_e_duty_pct)}</td>
                    <td className="px-3 py-2">
                      {r.is_active ? (
                        <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                          ใช้งาน
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          ปิด
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-3 w-3" /> แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted">แสดงได้สูงสุด 200 รายการ — ใช้ช่องค้นหาเพื่อกรองพิกัดที่ต้องการ</p>
    </div>
  );
}

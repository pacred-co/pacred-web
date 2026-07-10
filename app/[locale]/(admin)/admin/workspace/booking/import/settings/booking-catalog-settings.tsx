"use client";

/**
 * ตั้งค่าเรทตั้งต้น (Booking pricing catalog) — Pricing แก้ sale/cost/profit ต่อ combo.
 * 2026-07-10 (ปอน). เลือก combo (Term × ขนส่ง × LCL/FCL) → แก้ line-item + หมายเหตุ →
 * บันทึก (persist DB) → ใบเสนอราคาดึงไปใช้. cost/profit โชว์เต็ม (หน้านี้ canViewCost แล้ว).
 */

import { useMemo, useState } from "react";
import { Plus, Trash2, Save, RotateCcw, Loader2, Info } from "lucide-react";
import {
  bahtFmt, computeCatalogTotals, catalogKeyOf, templateLabel, usesLoadType,
  type CatalogLine, type CatalogTemplate,
} from "@/lib/booking/catalog";
import { saveBookingCatalogTemplate, resetBookingCatalog } from "@/actions/admin/booking-catalog";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

const GROUPS = ["Freight", "Origin", "Customs", "Document", "D/O", "Transport", "Port", "Special", "Receipt"];
const UNITS = ["THB/SET", "THB/CBM", "THB/CONT", "THB/RT", "THB/BILL", "ใบเสร็จจริง"];
// แกนเลือก combo (เหมือน Condition Builder หน้าใบเสนอราคา)
const TERM_OPTIONS = ["EXW", "FOB", "CIF", "DDP"];
const SERVICE_OPTIONS = ["SEA", "AIR", "TRUCK"];
const LOAD_OPTIONS = ["LCL", "FCL"];

const cloneTemplates = (t: Record<string, CatalogTemplate>): Record<string, CatalogTemplate> =>
  JSON.parse(JSON.stringify(t));

function blankTemplate(term: string, service: string, loadType: string): CatalogTemplate {
  const load = usesLoadType(service) ? loadType : "LCL";
  return {
    key: catalogKeyOf({ term, service, loadType: load }),
    label: templateLabel({ term, service, loadType: load }),
    service, loadType: load, term, note: "", lines: [],
  };
}

export function BookingCatalogSettings({
  templates, persisted,
}: {
  templates: Record<string, CatalogTemplate>; persisted: boolean;
}) {
  const [work, setWork] = useState<Record<string, CatalogTemplate>>(() => cloneTemplates(templates));
  // แกน combo (init จาก template แรกที่มี · default CIF/SEA/LCL)
  const first = templates["CIF_SEA_LCL"] ?? Object.values(templates)[0];
  const [term, setTerm] = useState<string>(first?.term ?? "CIF");
  const [service, setService] = useState<string>(first?.service ?? "SEA");
  const [loadType, setLoadType] = useState<string>(first?.loadType ?? "LCL");
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { confirm, dialogs } = useConfirmDialogs();

  const activeKey = catalogKeyOf({ term, service, loadType });
  const existing = !!work[activeKey];
  const tpl = work[activeKey] ?? blankTemplate(term, service, loadType);

  const totals = useMemo(() => {
    if (!tpl) return null;
    return computeCatalogTotals(tpl.lines.map((l) => ({ ...l, qty: 1, unitPrice: l.sale })));
  }, [tpl]);
  const marginTotal = totals ? totals.vatBase + totals.nonVat - totals.costTotal : 0;

  function markDirty(k: string) {
    setDirty((prev) => new Set(prev).add(k));
    setMsg(null);
  }
  // mutate template ของ combo ที่เลือก · สร้าง blank ให้ถ้ายังไม่มี (สร้าง combo ใหม่)
  function mutateActive(fn: (t: CatalogTemplate) => CatalogTemplate) {
    setWork((w) => {
      const cur = w[activeKey] ?? blankTemplate(term, service, loadType);
      return { ...w, [activeKey]: fn(cur) };
    });
    markDirty(activeKey);
  }
  function patchTemplate(patch: Partial<CatalogTemplate>) {
    mutateActive((t) => ({ ...t, ...patch }));
  }
  function editLine(idx: number, patch: Partial<CatalogLine>) {
    mutateActive((t) => ({
      ...t,
      lines: t.lines.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        if (patch.receipt === true) next.vat = false; // ใบเสร็จ → ไม่คิด VAT
        return next;
      }),
    }));
  }
  function addLine() {
    const line: CatalogLine = {
      id: `custom-${Date.now()}`, group: "Special", desc: "", unit: "THB/SET",
      sale: 0, cost: 0, profit: 0, vat: true, wht: 0,
    };
    mutateActive((t) => ({ ...t, lines: [...t.lines, line] }));
  }
  function deleteLine(idx: number) {
    mutateActive((t) => ({ ...t, lines: t.lines.filter((_, i) => i !== idx) }));
  }
  // เลือกแกน combo (SEA เท่านั้นที่มี LCL/FCL · AIR/TRUCK บังคับ LCL)
  function pickService(s: string) {
    setService(s);
    if (!usesLoadType(s)) setLoadType("LCL");
  }

  async function onSave() {
    if (!tpl || saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveBookingCatalogTemplate(activeKey, tpl);
      if (res.ok) {
        setDirty((prev) => { const n = new Set(prev); n.delete(activeKey); return n; });
        setMsg({ ok: true, text: `บันทึกเรท "${tpl.label}" แล้ว` });
      } else {
        setMsg({ ok: false, text: res.error ?? "บันทึกไม่สำเร็จ" });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    const ok = await confirm("รีเซ็ตเรททุก combo กลับเป็นค่าตั้งต้น (จาก CSV)?\nการแก้ที่บันทึกไว้ทั้งหมดจะหาย — ยืนยันไหม?");
    if (!ok) return;
    setResetting(true);
    try {
      const res = await resetBookingCatalog();
      if (res.ok) window.location.reload();
      else { setMsg({ ok: false, text: res.error ?? "รีเซ็ตไม่สำเร็จ" }); setResetting(false); }
    } catch {
      setMsg({ ok: false, text: "รีเซ็ตไม่สำเร็จ" }); setResetting(false);
    }
  }

  const isDirty = dirty.has(activeKey);
  const dirtyCount = dirty.size;

  return (
    <div className="space-y-4">
      {!persisted && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>ยังไม่ได้รัน migration <b>0248</b> — แก้ได้แต่ <b>บันทึกไม่ติด</b> (โชว์ค่าตั้งต้นชั่วคราว) จนกว่าจะรัน migration บนฐานข้อมูลก่อน</span>
        </div>
      )}

      {/* เลือกเงื่อนไข (combo) — แยกทีละแกน เหมือน Condition Builder หน้าใบเสนอราคา */}
      <div className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">เลือกเงื่อนไข (combo)</h3>
          <button
            type="button" onClick={onReset} disabled={resetting}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-muted transition-colors hover:text-rose-600 disabled:opacity-50 dark:bg-surface"
          >
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} รีเซ็ตค่าตั้งต้น
          </button>
        </div>
        <AxisRow label="บริการ" options={["IMPORT", "EXPORT"]} value="IMPORT" disabledOpts={["EXPORT"]} note="ส่งออก (Export) เปิดเร็วๆ นี้" />
        <AxisRow label="TERM" options={TERM_OPTIONS} value={term} onPick={setTerm} />
        <AxisRow label="ขนส่ง" options={SERVICE_OPTIONS} value={service} onPick={pickService} />
        {usesLoadType(service) && (
          <AxisRow label="ประเภท" options={LOAD_OPTIONS} value={loadType} onPick={setLoadType} note="เฉพาะทางเรือ · LCL=รวมตู้ · FCL=เหมาตู้" />
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2.5 text-xs">
          <span className="font-semibold text-foreground">{tpl.label}</span>
          <span className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[11px] text-muted">{activeKey}</span>
          {existing
            ? <span className="text-muted">· มีเรทแล้ว {tpl.lines.length} รายการ</span>
            : <span className="text-amber-600">· ยังไม่มีเรทชุดนี้ — เพิ่มบรรทัดแล้วบันทึกเพื่อสร้าง</span>}
          {isDirty && <span className="font-medium text-amber-600">● ยังไม่บันทึก</span>}
          {dirtyCount > 1 && <span className="text-muted">(รวม {dirtyCount} combo ยังไม่บันทึก — บันทึกทีละชุด)</span>}
        </div>
      </div>

      {/* note */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
        <label className="mb-1.5 block text-xs font-semibold text-muted">หมายเหตุตั้งต้น (แสดงในใบเสนอราคา)</label>
        <textarea
          value={tpl.note} rows={2} onChange={(e) => patchTemplate({ note: e.target.value })}
          className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 dark:bg-surface-alt"
          placeholder="เงื่อนไข / โน้ตตั้งต้นของ combo นี้…"
        />
      </div>

      {/* lines editor */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
        <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">กลุ่ม</th>
              <th className="px-2 py-2 text-left">คำอธิบาย</th>
              <th className="px-2 py-2 text-left">หน่วย</th>
              <th className="px-2 py-2 text-right">ราคาขาย</th>
              <th className="px-2 py-2 text-right">ต้นทุน 🔒</th>
              <th className="px-2 py-2 text-right">กำไร 🔒</th>
              <th className="px-2 py-2 text-center">VAT</th>
              <th className="px-2 py-2 text-center">WHT%</th>
              <th className="px-2 py-2 text-center">ใบเสร็จ</th>
              <th className="px-2 py-2 text-center" />
            </tr>
          </thead>
          <tbody>
            {tpl.lines.map((l, idx) => {
              const margin = (Number(l.sale) || 0) - (Number(l.cost) || 0);
              return (
                <tr key={l.id} className="even:bg-surface-alt/20">
                  <td className="px-2 py-1.5 text-center text-muted">{idx + 1}</td>
                  <td className="px-1 py-1.5">
                    <select value={l.group} onChange={(e) => editLine(idx, { group: e.target.value })}
                      className="w-full rounded border border-border bg-transparent px-1 py-1 text-xs outline-none focus:border-primary-400">
                      {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5">
                    <input value={l.desc} onChange={(e) => editLine(idx, { desc: e.target.value })}
                      placeholder="คำอธิบายรายการ (TH/EN)"
                      className="w-full min-w-[16rem] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-primary-400" />
                    <input value={l.note ?? ""} onChange={(e) => editLine(idx, { note: e.target.value })}
                      placeholder="หมายเหตุบรรทัด (เช่น 20'/40', เช็คตามระยะทาง)"
                      className="mt-0.5 w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] text-amber-700 outline-none hover:border-border focus:border-primary-400" />
                  </td>
                  <td className="px-1 py-1.5">
                    <input list="catalog-units" value={l.unit} onChange={(e) => editLine(idx, { unit: e.target.value })}
                      className="w-24 rounded border border-border bg-transparent px-1 py-1 text-xs outline-none focus:border-primary-400" />
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <input type="number" value={l.sale} onChange={(e) => editLine(idx, { sale: Number(e.target.value) })}
                      className="w-24 rounded border border-border bg-transparent px-1.5 py-1 text-right text-xs outline-none focus:border-primary-400" />
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {l.receipt ? <span className="text-muted">—</span> : (
                      <input type="number" value={l.cost ?? 0} onChange={(e) => editLine(idx, { cost: Number(e.target.value) })}
                        className="w-24 rounded border border-border bg-transparent px-1.5 py-1 text-right text-xs outline-none focus:border-primary-400" />
                    )}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    {l.receipt ? <span className="text-muted">—</span> : (
                      <div className="flex flex-col items-end">
                        <input type="number" value={l.profit ?? 0} onChange={(e) => editLine(idx, { profit: Number(e.target.value) })}
                          className="w-24 rounded border border-border bg-transparent px-1.5 py-1 text-right text-xs outline-none focus:border-primary-400" />
                        <span className={`mt-0.5 text-[10.5px] ${margin < 0 ? "text-rose-600" : "text-emerald-600"}`} title="มาร์จิน = ราคาขาย − ต้นทุน">
                          มาร์จิน {bahtFmt(margin)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input type="checkbox" checked={l.vat} disabled={l.receipt} onChange={(e) => editLine(idx, { vat: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input type="number" value={l.wht} onChange={(e) => editLine(idx, { wht: Number(e.target.value) })}
                      className="w-12 rounded border border-border bg-transparent px-1 py-1 text-center text-xs outline-none focus:border-primary-400" />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input type="checkbox" checked={!!l.receipt} onChange={(e) => editLine(idx, { receipt: e.target.checked })} title="เก็บตามใบเสร็จจริง (ไม่คิด VAT)" />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button type="button" onClick={() => deleteLine(idx)} aria-label="ลบบรรทัด"
                      className="text-muted transition-colors hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {tpl.lines.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-muted">ยังไม่มีบรรทัด — กด “เพิ่มบรรทัด”</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="catalog-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

      <button type="button" onClick={addLine}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary-400 hover:text-primary-600 dark:bg-surface">
        <Plus className="h-4 w-4" /> เพิ่มบรรทัด
      </button>

      {/* summary + save (sticky) */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:bg-surface/95">
        {totals && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span>รวมราคาขาย <b className="text-sm text-foreground">{bahtFmt(totals.vatBase + totals.nonVat + totals.receiptTotal)}</b></span>
            <span>ต้นทุนรวม 🔒 <b className="text-sm">{bahtFmt(totals.costTotal)}</b></span>
            <span>กำไรรวม 🔒 <b className={`text-sm ${marginTotal < 0 ? "text-rose-600" : "text-emerald-600"}`}>{bahtFmt(marginTotal)}</b></span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {msg && <span className={`text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</span>}
          <button type="button" onClick={onSave} disabled={saving || !isDirty}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isDirty ? "บันทึกเรทชุดนี้" : "บันทึกแล้ว"}
          </button>
        </div>
      </div>
      {dialogs}
    </div>
  );
}

// แถวเลือกแกน combo (label ซ้าย + pills ขวา · สไตล์เดียวกับ Condition Builder)
function AxisRow({
  label, options, value, onPick, disabledOpts, note,
}: {
  label: string; options: string[]; value: string; onPick?: (v: string) => void;
  disabledOpts?: string[]; note?: string;
}) {
  return (
    <div className="grid grid-cols-[68px_1fr] items-start gap-3 sm:grid-cols-[84px_1fr]">
      <div className="pt-1.5 text-xs font-bold text-muted">{label}</div>
      <div>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const dis = disabledOpts?.includes(o);
            const active = value === o;
            return (
              <button
                key={o} type="button" disabled={dis} onClick={() => { if (!dis) onPick?.(o); }}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  dis ? "cursor-not-allowed bg-surface-alt/40 text-muted/50"
                    : active ? "bg-primary-600 text-white ring-2 ring-primary-400 ring-offset-1 ring-offset-background"
                      : "border border-border bg-white text-foreground hover:border-primary-400 hover:text-primary-600 dark:bg-surface",
                ].join(" ")}
              >{o}</button>
            );
          })}
        </div>
        {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
      </div>
    </div>
  );
}

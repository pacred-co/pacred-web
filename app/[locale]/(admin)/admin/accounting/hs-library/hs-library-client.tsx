"use client";

/**
 * <HsLibraryClient> — the ONE คลัง HS CODE LIBRARY surface.
 *
 * 2026-08-03 — owner ย้ำรอบสอง: "ทำไมยังมี 2 แทป · รวมกันทั้งหน้าตาการใช้งาน
 * และ DB · table เดียวกัน ใช้ที่เดียวกัน" ⇒ NO tabs. ONE list over ONE table
 * (hs_codes). The former แท็บ 2's product-grain now lives ON each row as
 * `product_aliases` (mig 0285 + merge script): ทุกชื่อสินค้าที่เคยถาม/ตอบ
 * โชว์เป็นชิปใต้แถวพิกัด และช่องค้นหาแมตช์ชื่อพวกนั้นด้วย — พิมพ์ชื่อสินค้า
 * ก็เจอแถวพิกัดในลิสต์เดียวกันเลย.
 *
 * §0g self-explaining rows · §0h ≥11px + real hierarchy · §0f confirm-before-mutate.
 * ⚠️ Reference data (§0e) — nothing here touches a selling price / order / money.
 */

import { searchHsRows } from "@/lib/admin/hs-search";
import { useMemo, useState, useTransition } from "react";
import {
  Search, Plus, Pencil, X, AlertTriangle, Layers, PackageSearch,
  BadgeCheck, HelpCircle, FileText, Loader2, Wand2,
} from "lucide-react";
import { listHsCodes, upsertHsCode, type HsCodeListRow } from "@/actions/admin/hs-codes";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

export type HsRow = HsCodeListRow;

// ── tokens ──────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const numInputCls = inputCls + " text-right tabular-nums";
const btnPrimary =
  "inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50";
const chipDuty =
  "inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt/50 px-1.5 py-0.5 text-[11px] tabular-nums";

const clean = (v: string | null | undefined) => (v ?? "").toString().trim();
const digitsOf = (v: string | null | undefined) => clean(v).replace(/[^0-9]/g, "");

/**
 * 🔴 owner 2026-08-03: พิมพ์ "สติ๊ก" แล้ว "ไม่เห็นเจอเลย" ทั้งที่ 3919.10.99 มี
 * ชื่อ "สติกเกอร์" อยู่ — คนไทยเขียนคำเดียวกันได้หลายแบบ (สติ๊กเกอร์/สติกเกอร์/
 * สติ้กเกอร์ · โช้คอัพ/โช๊คอัพ) และแชทกับคลังคนละสะกดกันตลอด. ค้นแบบเทียบตรงตัว
 * จึงพลาดของที่มีอยู่จริง = คนใช้สรุปว่า "ระบบไม่มี" แล้วไปถามในไลน์ซ้ำ.
 * ⇒ ตัดวรรณยุกต์/ไม้ไต่คู้/การันต์/สระบน-ล่าง + ช่องว่าง + . - ทิ้งทั้ง 2 ฝั่ง
 * ก่อนเทียบ (ใช้กับ "หาเจอ" เท่านั้น — ไม่แตะข้อความที่แสดงหรือที่บันทึก).
 */
const TH_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;
const norm = (v: string | null | undefined) =>
  clean(v)
    .toLowerCase()
    // "เเ" (สระเอ 2 ตัว — พิมพ์ผิดที่เจอบ่อยมากในแชท เช่น "ตลับกุญเเจ") = "แ"
    .replace(/เเ/g, "แ")
    .replace(TH_MARKS, "")
    // วงเล็บ/เครื่องหมายคั่น — "กระดาษทราย (กลมหลังสักหลาด)" ต้องเจอด้วยคำ
    // "กระดาษทรายกลมหลังสักหลาด" ที่คนพิมพ์มาในแชท
    .replace(/[\s.\-_/,()[\]{}"'·]/g, "");

function pct(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("th-TH", { maximumFractionDigits: 3 })}%`;
}

/** Source badge — where this code came from. */
function SourceBadge({ source, provenance }: { source: string | null; provenance: string | null }) {
  const s = clean(source) || "—";
  const tone =
    provenance === "curated_0224" || provenance === "curated"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20"
      : provenance === "decl"
      ? "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/20"
      : provenance === "dummy_0030"
      ? "border-slate-300 bg-slate-100 text-slate-600 dark:bg-slate-900/30"
      : "border-border bg-surface-alt/50 text-muted";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${tone}`}>{s}</span>;
}

/** คืน "ชื่อสินค้า" ตัวแรกของแถวที่ตรงกับคำค้น (normalized) — null = ไม่ตรง */
function aliasHit(r: HsRow, n: string): string | null {
  if (!n) return null;
  for (const a of r.product_aliases ?? []) {
    const th = clean(a.th), en = clean(a.en);
    if (th && norm(th).includes(n)) return th;
    if (en && norm(en).includes(n)) return en;
  }
  return null;
}

type OtherFormDraft = { name: string; pct: string };
function otherFormsToDrafts(m: Record<string, number> | null): OtherFormDraft[] {
  return m ? Object.entries(m).map(([name, p]) => ({ name, pct: String(p) })) : [];
}

// ════════════════════════════════════════════════════════════════════
export function HsLibraryClient({ initialRows }: { initialRows: HsRow[] }) {
  // owner 2026-08-03 — ตารางเดียว ลิสต์เดียว ไม่มีแท็บ
  return <CodesSection initialRows={initialRows} />;
}

// ════════════════════════════════════════════════════════════════════
// §1 — พิกัด (the code-grain library)
// ════════════════════════════════════════════════════════════════════
type CodeFilter = "all" | "confirmed" | "unconfirmed" | "canonical" | "used" | "conflict" | "padded";

function CodesSection({ initialRows }: { initialRows: HsRow[] }) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [rows, setRows] = useState<HsRow[]>(initialRows);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CodeFilter>("all");
  const [refreshing, startRefresh] = useTransition();
  const [saving, startSave] = useTransition();

  const [formMode, setFormMode] = useState<null | "new" | "edit">(null);
  const [origCode, setOrigCode] = useState<string | null>(null);
  const [fCode, setFCode] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fDescEn, setFDescEn] = useState("");
  const [fDuty, setFDuty] = useState("");
  const [fFormE, setFFormE] = useState("");
  const [fUnit, setFUnit] = useState("");
  const [fNote, setFNote] = useState("");
  const [fStat, setFStat] = useState("000");
  const [fActive, setFActive] = useState(true);
  const [fOther, setFOther] = useState<OtherFormDraft[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  /** A code whose curated duty disagrees with what the ใบขน actually used. */
  const isConflict = (r: HsRow) =>
    r.decl_duty_pct !== null && Number(r.default_duty_pct) !== Number(r.decl_duty_pct);

  const stats = useMemo(() => ({
    total:       rows.length,
    confirmed:   rows.filter((r) => r.duty_confirmed).length,
    used:        rows.filter((r) => (r.decl_count ?? 0) > 0).length,
    conflict:    rows.filter(isConflict).length,
    // ชื่อสินค้าที่ค้นเจอได้ทั้งหมด = ชื่อหลักของแถว + ชื่อ alias ที่เคยถาม/ตอบ
    // (owner 2026-08-03 งงว่า "5-6 พันหายไปไหน" — 5,335 แถวบอท/ไฟล์คือ "ชื่อ"
    //  ไม่ใช่พิกัด · ชื่อซ้ำเป๊ะยุบเหลือหนึ่ง → การ์ดนี้ต้องนับ "ชื่อ" ให้ตรงความหมาย)
    names:       rows.reduce((n, r) => n + 1 + (r.product_aliases?.length ?? 0), 0),
  }), [rows]);

  const visible = useMemo(() => {
    // ตัวกรองสถานะก่อน (ถูก/เร็ว) แล้วค่อยค้นข้อความผ่าน SOT `lib/admin/hs-search.ts`
    // (owner 2026-08-08 "พิมพ์ผิด/เรียกคนละคำ แล้วหาไม่เจอ") — SOT คืนด้วยว่าเจอ
    // จากชั้นไหน เพื่อให้จอแยกป้าย "ตรงคำ" vs "ใกล้เคียง" ได้ · 43 เทสล็อกไว้.
    const base = rows.filter((r) => {
      if (filter === "confirmed"   && !r.duty_confirmed) return false;
      if (filter === "unconfirmed" &&  r.duty_confirmed) return false;
      if (filter === "canonical"   && !r.is_canonical) return false;
      if (filter === "used"        && (r.decl_count ?? 0) === 0) return false;
      if (filter === "conflict"    && !isConflict(r)) return false;
      if (filter === "padded"      && !r.hs8_is_padded) return false;
      return true;
    });
    return searchHsRows(base, search);
  }, [rows, search, filter]);

  /** จำนวนที่เจอแบบ "เดาให้" — จอบอกตรงๆ ว่ามีผลใกล้เคียงกี่รายการ */
  const fuzzyCount = useMemo(() => visible.filter((r) => r.match.kind === "fuzzy").length, [visible]);

  const RENDER_CAP = 400;
  const shown = visible.slice(0, RENDER_CAP);

  function refresh() {
    startRefresh(async () => {
      const res = await listHsCodes();
      if (res.ok && res.data) setRows(res.data);
    });
  }

  function openNew() {
    setFormMode("new"); setOrigCode(null);
    setFCode(""); setFDesc(""); setFDescEn(""); setFDuty(""); setFFormE("");
    setFUnit(""); setFNote(""); setFStat("000"); setFActive(true); setFOther([]);
    setFormErr(null);
  }

  function openEdit(r: HsRow) {
    setFormMode("edit"); setOrigCode(r.code);
    setFCode(r.code);
    setFDesc(r.description);
    setFDescEn(r.description_en ?? "");
    setFDuty(String(r.default_duty_pct ?? ""));
    setFFormE(r.form_e_duty_pct == null ? "" : String(r.form_e_duty_pct));
    setFUnit(r.unit ?? "");
    setFNote(r.hs_note ?? "");
    setFStat(r.default_stat_code ?? "000");
    setFActive(r.is_active);
    setFOther(otherFormsToDrafts(r.other_forms));
    setFormErr(null);
  }

  /** Adopt the ใบขน-observed duty into the editor (one click, still needs Save). */
  function adoptDecl(r: HsRow) {
    openEdit(r);
    if (r.decl_duty_pct !== null) setFDuty(String(r.decl_duty_pct));
    if (r.decl_form_e_pct !== null) setFFormE(String(r.decl_form_e_pct));
  }

  async function onSave() {
    setFormErr(null);
    const code = fCode.trim();
    const desc = fDesc.trim();
    if (!code) { setFormErr("กรุณากรอกพิกัด HS Code"); return; }
    if (!desc) { setFormErr("กรุณากรอกคำอธิบายสินค้า"); return; }
    const duty = Number(fDuty);
    if (!Number.isFinite(duty) || duty < 0 || duty > 100) {
      setFormErr("อากรปกติ (%) ต้องอยู่ระหว่าง 0–100"); return;
    }
    let formE: number | undefined;
    if (fFormE.trim() !== "") {
      const fe = Number(fFormE);
      if (!Number.isFinite(fe) || fe < 0 || fe > 100) {
        setFormErr("อากร Form-E (%) ต้องอยู่ระหว่าง 0–100"); return;
      }
      formE = fe;
    }
    const other: Record<string, number> = {};
    for (const o of fOther) {
      const name = o.name.trim();
      if (!name) continue;
      const p = Number(o.pct);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        setFormErr(`อากรของฟอร์ม "${name}" ต้องอยู่ระหว่าง 0–100`); return;
      }
      other[name] = p;
    }

    // §0f — confirm, and say plainly what saving MEANS (it confirms the duty).
    const ok = await confirm(
      `${formMode === "new" ? "เพิ่ม" : "บันทึกการแก้ไข"}พิกัด HS "${code}" ลงคลัง HS?\n\n` +
        `อากรปกติ ${duty}%${formE !== undefined ? ` · Form-E ${formE}%` : ""}\n` +
        "✅ การบันทึก = ยืนยันอากรนี้ (พิกัดจะขึ้นสถานะ “ยืนยันแล้ว”)\n" +
        "⚠️ ข้อมูลอ้างอิง — ไม่กระทบราคาขาย · ออเดอร์ · หรืออากรที่บันทึกในใบขนที่ออกไปแล้ว",
    );
    if (!ok) return;

    startSave(async () => {
      const res = await upsertHsCode({
        code,
        description:       desc,
        description_en:    fDescEn.trim() || undefined,
        default_duty_pct:  duty,
        form_e_duty_pct:   formE,
        other_forms:       other,
        unit:              fUnit.trim() || undefined,
        hs_note:           fNote.trim() || undefined,
        default_stat_code: fStat.trim() || undefined,
        is_active:         fActive,
      });
      if (!res.ok) { setFormErr(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      setFormMode(null);
      // Authoritative refetch — the row's server-side fields (duty_confirmed,
      // provenance, decl_*) are derived, so an optimistic local patch would lie.
      refresh();
      await alert("บันทึกลงคลัง HS เรียบร้อย");
    });
  }

  const fBtn = (v: CodeFilter) =>
    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors " +
    (filter === v
      ? "border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-950/20"
      : "border-border hover:bg-surface-alt");

  return (
    <div className="space-y-4">
      {dialogs}

      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard icon={<Layers className="h-4 w-4" />} label="พิกัดทั้งหมด" value={stats.total} />
        <StatCard icon={<PackageSearch className="h-4 w-4" />} label="ชื่อสินค้า/คำค้น" value={stats.names} />
        <StatCard icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />} label="ยืนยันอากรแล้ว" value={stats.confirmed} tone="emerald" />
        <StatCard icon={<FileText className="h-4 w-4 text-sky-600" />} label="เคยใช้จริงในใบขน" value={stats.used} tone="sky" />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="อากรไม่ตรงกับใบขน" value={stats.conflict} tone="amber" />
      </div>

      {/* ── search + filters + add ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา พิกัด (4202.29 หรือ 42022900) · ชื่อสินค้า ไทย/อังกฤษ · หมายเหตุ…"
            className={inputCls + " pl-8 w-80"}
          />
        </div>
        <button type="button" className={fBtn("all")} onClick={() => setFilter("all")}>ทั้งหมด</button>
        <button type="button" className={fBtn("confirmed")} onClick={() => setFilter("confirmed")}>
          <BadgeCheck className="h-3.5 w-3.5" /> ยืนยันอากรแล้ว
        </button>
        <button type="button" className={fBtn("unconfirmed")} onClick={() => setFilter("unconfirmed")}>
          <HelpCircle className="h-3.5 w-3.5" /> ยังไม่ยืนยันอากร
        </button>
        <button type="button" className={fBtn("used")} onClick={() => setFilter("used")}>
          <FileText className="h-3.5 w-3.5" /> ใช้จริงในใบขน
        </button>
        <button type="button" className={fBtn("conflict")} onClick={() => setFilter("conflict")}>
          <AlertTriangle className="h-3.5 w-3.5" /> ⚠ ขัดกัน
        </button>
        <button type="button" className={fBtn("canonical")} onClick={() => setFilter("canonical")}>คลังเดิม</button>
        <button type="button" className={fBtn("padded")} onClick={() => setFilter("padded")}>พิกัดประมาณ</button>
        <div className="ml-auto flex items-center gap-2">
          {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
          <button type="button" className={btnPrimary} onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> เพิ่มพิกัด HS
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        แสดง {shown.length.toLocaleString("th-TH")} / {visible.length.toLocaleString("th-TH")} พิกัด
        {visible.length > RENDER_CAP && ` (จำกัด ${RENDER_CAP} แรก — ใช้ค้นหาเพื่อกรอง)`}
      </p>

      {/* ── add / edit form ── */}
      {formMode && (
        <section className="rounded-2xl border border-primary-200 bg-primary-50/30 dark:bg-primary-950/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">
              {formMode === "new" ? "➕ เพิ่มพิกัด HS ใหม่" : `✏️ แก้ไขพิกัด HS · ${origCode}`}
            </h2>
            <button type="button" className="text-muted hover:text-foreground" onClick={() => setFormMode(null)}>
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
                type="text" value={fCode} onChange={(e) => setFCode(e.target.value)}
                disabled={formMode === "edit"} placeholder="เช่น 8517.12.00" maxLength={20}
                className={inputCls + " font-mono disabled:opacity-60"}
              />
              {formMode === "edit" && (
                <span className="block text-[11px] text-muted">แก้ไขพิกัดไม่ได้ — ลบแล้วเพิ่มใหม่หากต้องเปลี่ยน</span>
              )}
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">หน่วย</span>
              <input type="text" value={fUnit} onChange={(e) => setFUnit(e.target.value)}
                placeholder="piece / kg / set" maxLength={20} className={inputCls} />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">รหัสสถิติ (ปกติ)</span>
              <input type="text" value={fStat} onChange={(e) => setFStat(e.target.value)}
                placeholder="000 / 001 / 090" maxLength={10} className={inputCls + " tabular-nums"} />
            </label>
            <label className="space-y-0.5 sm:col-span-2">
              <span className="block text-[11px] text-muted">คำอธิบายสินค้า (ไทย) *</span>
              <input type="text" value={fDesc} onChange={(e) => setFDesc(e.target.value)}
                placeholder="เช่น โทรศัพท์มือถือ smartphone" maxLength={300} className={inputCls} />
            </label>
            <label className="space-y-0.5 sm:col-span-2">
              <span className="block text-[11px] text-muted">คำอธิบาย (อังกฤษ)</span>
              <input type="text" value={fDescEn} onChange={(e) => setFDescEn(e.target.value)}
                placeholder="(optional)" maxLength={300} className={inputCls} />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">อากรปกติ (%) *</span>
              <input type="number" min={0} max={100} step="0.001" inputMode="decimal"
                value={fDuty} onChange={(e) => setFDuty(e.target.value)} placeholder="0" className={numInputCls} />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted">อากร Form-E / ACFTA (%)</span>
              <input type="number" min={0} max={100} step="0.001" inputMode="decimal"
                value={fFormE} onChange={(e) => setFFormE(e.target.value)} placeholder="0" className={numInputCls} />
            </label>
          </div>

          {/* other preferential forms */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted">ฟอร์มอื่นๆ (อากรพิเศษ)</span>
              <button type="button" className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
                onClick={() => setFOther((p) => [...p, { name: "", pct: "" }])}>
                <Plus className="h-3 w-3" /> เพิ่มฟอร์ม
              </button>
            </div>
            {fOther.length === 0 ? (
              <p className="text-[11px] text-muted">— ยังไม่มีฟอร์มอื่น — กด “เพิ่มฟอร์ม” เช่น Form-D (ATIGA), Form-AK</p>
            ) : (
              <div className="space-y-1.5">
                {fOther.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="text" value={o.name}
                      onChange={(e) => setFOther((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="ชื่อฟอร์ม เช่น Form-D (ATIGA)" maxLength={60} className={inputCls + " flex-1"} />
                    <input type="number" min={0} max={100} step="0.001" inputMode="decimal" value={o.pct}
                      onChange={(e) => setFOther((p) => p.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                      placeholder="%" className={numInputCls + " w-24"} />
                    <button type="button" className="text-muted hover:text-red-600"
                      onClick={() => setFOther((p) => p.filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="space-y-0.5 block">
            <span className="block text-[11px] text-muted">หมายเหตุ (เงื่อนไข / ของควบคุม / เลี่ยงพิกัด)</span>
            <textarea value={fNote} onChange={(e) => setFNote(e.target.value)} rows={2} maxLength={1000} className={inputCls} />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
            ใช้งาน (แสดงในตัวเลือก)
          </label>

          <div className="flex gap-2 pt-1">
            <button type="button" disabled={saving} className={btnPrimary} onClick={onSave}>
              {saving ? "กำลังบันทึก…" : "บันทึกลงคลัง HS"}
            </button>
            <button type="button" disabled={saving} className={btnGhost} onClick={() => setFormMode(null)}>
              ยกเลิก
            </button>
          </div>
        </section>
      )}

      {/* ── rows ── */}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center text-xs text-muted">
          {search || filter !== "all" ? "ไม่พบพิกัดที่ตรงกับเงื่อนไข" : "ยังไม่มีพิกัดในคลัง — กด “เพิ่มพิกัด HS”"}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <CodeRow key={r.code} r={r} conflict={isConflict(r)} term={search}
              onEdit={() => openEdit(r)} onAdopt={() => adoptDecl(r)} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted leading-relaxed">
        ⚠️ <b>อากรที่ยืนยันแล้ว</b> = มีคนในทีมยืนยัน หรือมาจากใบขนจริง · <b>ยังไม่ยืนยัน</b> = ค่าที่บอท/ไฟล์เดาไว้
        หรือยังไม่ทราบ (เลข 0 แปลว่า “ไม่ทราบ” <b>ไม่ใช่</b> “ยกเว้นอากร”) — กรุณายืนยันก่อนใช้ยิงใบขน ·
        <b> อากรจริงบนใบขน</b> คือค่าที่ยิงจริง (สิทธิ์ 000 = อากรปกติ · ACN = Form-E) ใช้เทียบเท่านั้น ไม่ถูกนำไปคิดเงินเอง.
      </p>
    </div>
  );
}

/** §0g — one self-explaining row: what · duty + trust · reality · next action. */
function CodeRow({
  r, conflict, term, onEdit, onAdopt,
}: { r: HsRow; conflict: boolean; term: string; onEdit: () => void; onAdopt: () => void }) {
  const used = (r.decl_count ?? 0) > 0;
  // ถ้าคำที่ค้นไปตรงกับ "ชื่อสินค้า" ไม่ใช่ชื่อหลักของแถว → ต้องบอกให้เห็น
  // (owner: เจอแถวชื่อ "เทปพันสายไฟ" ตอนค้น "สติ๊ก" แล้วนึกว่าระบบหาไม่เจอ)
  const n = norm(term);
  const hit = n && !norm(r.description).includes(n) && !norm(r.description_en).includes(n)
    ? aliasHit(r, n) : null;
  return (
    <div
      className={
        "rounded-xl border bg-white dark:bg-surface px-3.5 py-2.5 " +
        (conflict ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/10" : "border-border")
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-foreground">{r.code}</span>
            {r.is_canonical && (
              <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                คลังเดิม
              </span>
            )}
            <SourceBadge source={r.source} provenance={r.provenance} />
            {r.hs8_is_padded && (
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                title="พิกัดต้นทางสั้นกว่า 8 หลัก — ระบบเติม 0 ให้ครบเพื่อจับคู่ (อาจไม่ตรงพิกัดย่อยจริง)">
                พิกัดประมาณ
              </span>
            )}
            {!r.is_active && (
              <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">ปิด</span>
            )}
          </div>
          {hit && (
            <p className="mt-0.5 text-[13px] font-bold text-primary-700 break-words">
              🔎 {hit}
              <span className="ml-1.5 text-[11px] font-normal text-muted">— ชื่อที่เคยถาม/ตอบสำหรับพิกัดนี้</span>
            </p>
          )}
          <p className={"mt-0.5 break-words " + (hit ? "text-[11px] text-muted" : "text-[13px] font-semibold text-foreground")}>
            {hit ? "ชื่อหลักในคลัง: " : ""}{r.description}
          </p>
          {clean(r.description_en) && <p className="text-[11px] text-muted break-words">{r.description_en}</p>}
          <AliasChips aliases={r.product_aliases} selfTh={r.description} selfEn={r.description_en} term={term} />
          {clean(r.hs_note) && <p className="mt-1 text-[11px] text-muted break-words">📝 {r.hs_note}</p>}
        </div>

        {/* duty + trust */}
        <div className="shrink-0 space-y-1 text-right">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span className={chipDuty}>
              <span className="text-muted">อากรปกติ</span>
              <span className="font-mono font-bold">{pct(r.default_duty_pct)}</span>
            </span>
            {Number(r.form_e_duty_pct) > 0 && (
              <span className={chipDuty}>
                <span className="text-muted">Form-E</span>
                <span className="font-mono font-semibold">{pct(r.form_e_duty_pct)}</span>
              </span>
            )}
            {r.other_forms && Object.keys(r.other_forms).length > 0 && (
              <span className={chipDuty} title={Object.entries(r.other_forms).map(([k, v]) => `${k}: ${v}%`).join(" · ")}>
                <span className="text-muted">ฟอร์มอื่น</span>
                <span className="font-mono font-semibold">{Object.keys(r.other_forms).length}</span>
              </span>
            )}
            {clean(r.default_stat_code) && (
              <span className={chipDuty}>
                <span className="text-muted">สถิติ</span>
                <span className="font-mono font-semibold">{r.default_stat_code}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {r.duty_confirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <BadgeCheck className="h-3 w-3" /> ยืนยันอากรแล้ว
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                title="ค่านี้มาจากการเดาของบอท/ไฟล์ หรือยังไม่ทราบ — 0 ไม่ได้แปลว่ายกเว้นอากร">
                <HelpCircle className="h-3 w-3" /> ยังไม่ยืนยันอากร
              </span>
            )}
            <button type="button" onClick={onEdit}
              className="inline-flex items-center gap-0.5 rounded-lg border border-border px-2 py-0.5 text-[11px] hover:bg-surface-alt">
              <Pencil className="h-3 w-3" /> แก้ไข
            </button>
          </div>
        </div>
      </div>

      {/* ── ใบขน reality strip ── */}
      {used && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-950/20">
            <FileText className="h-3 w-3" /> ใช้จริง {Number(r.decl_count).toLocaleString("th-TH")} ใบขน
          </span>
          {r.decl_duty_pct !== null && (
            <span className={chipDuty}>
              <span className="text-muted">อากรจริง</span>
              <span className="font-mono font-semibold">{pct(r.decl_duty_pct)}</span>
            </span>
          )}
          {r.decl_form_e_pct !== null && (
            <span className={chipDuty}>
              <span className="text-muted">Form-E จริง</span>
              <span className="font-mono font-semibold">{pct(r.decl_form_e_pct)}</span>
            </span>
          )}
          {r.decl_duty_stable === false && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
              title="ใบขนหลายใบใช้อากรต่างกันสำหรับพิกัดนี้ — เลขที่แสดงคือค่าที่พบบ่อยที่สุด">
              อากรบนใบขนไม่คงที่
            </span>
          )}
          {clean(r.decl_last_used) && (
            <span className="text-[11px] text-muted">ใบขนล่าสุด {r.decl_last_used}</span>
          )}
          {conflict && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                <AlertTriangle className="h-3 w-3" /> คลังบอกว่า {pct(r.default_duty_pct)} แต่ใบขนยิง {pct(r.decl_duty_pct)}
              </span>
              <button type="button" onClick={onAdopt}
                className="inline-flex items-center gap-0.5 rounded-lg border border-amber-400 bg-white dark:bg-surface px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-50">
                <Wand2 className="h-3 w-3" /> ใช้อากรจากใบขน
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone?: "amber" | "slate" | "emerald" | "sky" }) {
  const ring =
    tone === "amber"   ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10"
    : tone === "slate" ? "border-slate-200 bg-slate-50/50 dark:bg-slate-900/20"
    : tone === "emerald" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10"
    : tone === "sky"   ? "border-sky-200 bg-sky-50/50 dark:bg-sky-950/10"
    : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-xl border ${ring} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}

/** ชื่อสินค้าที่เคยถาม/ตอบสำหรับพิกัดนี้ — the one-table replacement for the old
 *  "สินค้า → พิกัด" tab. Shows up to 6 chips + "+N" (expand); the search box
 *  already matches every alias, so typing a product name lands on this row. */
function AliasChips({
  aliases, selfTh, selfEn, term,
}: { aliases: HsRow["product_aliases"]; selfTh: string | null; selfEn: string | null; term: string }) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(() => {
    const seen = new Set<string>([clean(selfTh).toLowerCase(), clean(selfEn).toLowerCase()]);
    const out: { label: string; title: string }[] = [];
    for (const a of aliases ?? []) {
      const th = clean(a.th), en = clean(a.en);
      const label = th || en;
      if (!label) continue;
      const k = label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ label, title: [en && th ? th + " / " + en : label, clean(a.note)].filter(Boolean).join(" · ") });
    }
    // ⚠️ ชิปตัดที่ 6 ตัว — ถ้าชื่อที่ค้นเจอไปอยู่ชิปที่ 50 (พิกัดหนึ่งมีได้ถึง 118
    // ชื่อ) ผู้ใช้จะเห็นแถวที่ไม่มีคำที่ตัวเองพิมพ์อยู่เลย = "ผลลัพธ์มั่ว/ไม่เจอ".
    // ⇒ เวลาค้น ดันชื่อที่ตรงขึ้นหน้าเสมอ.
    const n = norm(term);
    if (n) {
      out.sort((a, b) => Number(norm(b.label).includes(n)) - Number(norm(a.label).includes(n)));
    }
    return out;
  }, [aliases, selfTh, selfEn, term]);
  if (items.length === 0) return null;
  const nTerm = norm(term);
  const CAP = 6;
  const shown = expanded ? items : items.slice(0, CAP);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted">สินค้า:</span>
      {shown.map((a, i) => (
        <span key={i} title={a.title}
          className={"inline-flex max-w-[16rem] truncate rounded-full border px-2 py-0.5 text-[11px] " +
            (nTerm && norm(a.label).includes(nTerm)
              ? "border-primary-400 bg-primary-50 font-semibold text-primary-800 dark:bg-primary-950/20"
              : "border-border bg-surface-alt/60 text-foreground/80")}>
          {a.label}
        </span>
      ))}
      {items.length > CAP && (
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-primary-600 hover:bg-surface-alt">
          {expanded ? "ย่อ" : "+" + (items.length - CAP).toLocaleString("th-TH") + " ชื่อ"}
        </button>
      )}
    </div>
  );
}

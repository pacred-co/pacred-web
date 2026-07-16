"use client";

/**
 * <HsLibraryClient> — the ONE คลัง HS CODE LIBRARY surface (owner 2026-07-16:
 * "ยุบทิ้ง ให้มารวมกันอยู่ทีเดียว และหน้าเดียวกัน").
 *
 * TWO sections on ONE page, because the data has two real grains:
 *   §1 พิกัด       — code-grain library (hs_codes) · search/filter/inline-edit
 *   §2 สินค้า→พิกัด — product-grain aliases (doc_bot_hs_codes) · absorbs ALL of
 *                    the retired /hs-library/bot page: source badges, product
 *                    grouping, พิกัดหลัก/พิกัดรอง (same completeness scorer),
 *                    ⚠️ พิกัดขัดกัน, ยังไม่มี code, the 4 stat cards, and the
 *                    VERBATIM duty chip. Plus the previously-orphaned overrides.
 *
 * §2 lazy-loads on first open (5,335 alias rows) so the initial paint isn't
 * paying for a tab nobody opened.
 *
 * §0g self-explaining rows · §0h ≥11px + real hierarchy · §0f confirm-before-mutate.
 * ⚠️ Reference data (§0e) — nothing here touches a selling price / order / money.
 */

import { useMemo, useState, useTransition, useEffect } from "react";
import {
  Search, Plus, Pencil, X, AlertTriangle, Layers, PackageSearch, Ban,
  BadgeCheck, HelpCircle, FileText, Bot, Loader2, Wand2,
} from "lucide-react";
import { listHsCodes, upsertHsCode, type HsCodeListRow } from "@/actions/admin/hs-codes";
import {
  listDocBotHsLibrary, listDocBotHsOverrides,
  type DocBotHsRow, type DocBotHsOverrideRow,
} from "@/actions/admin/doc-bot-hs";
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

type OtherFormDraft = { name: string; pct: string };
function otherFormsToDrafts(m: Record<string, number> | null): OtherFormDraft[] {
  return m ? Object.entries(m).map(([name, p]) => ({ name, pct: String(p) })) : [];
}

// ════════════════════════════════════════════════════════════════════
export function HsLibraryClient({ initialRows }: { initialRows: HsRow[] }) {
  const [tab, setTab] = useState<"codes" | "products">("codes");

  return (
    <div className="space-y-4">
      {/* ── section tabs (ONE page · two grains) ── */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border">
        <TabBtn active={tab === "codes"} onClick={() => setTab("codes")} icon={<Layers className="h-4 w-4" />}>
          พิกัด (คลังหลัก)
          <span className="ml-1 tabular-nums opacity-70">{initialRows.length.toLocaleString("th-TH")}</span>
        </TabBtn>
        <TabBtn active={tab === "products"} onClick={() => setTab("products")} icon={<Bot className="h-4 w-4" />}>
          สินค้า → พิกัด (บอท + ไฟล์)
        </TabBtn>
      </div>

      {tab === "codes" ? <CodesSection initialRows={initialRows} /> : <ProductsSection />}
    </div>
  );
}

function TabBtn({
  active, onClick, icon, children,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors " +
        (active
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt/50")
      }
    >
      {icon}
      {children}
    </button>
  );
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
  }), [rows]);

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    const td = digitsOf(search);
    return rows.filter((r) => {
      if (filter === "confirmed"   && !r.duty_confirmed) return false;
      if (filter === "unconfirmed" &&  r.duty_confirmed) return false;
      if (filter === "canonical"   && !r.is_canonical) return false;
      if (filter === "used"        && (r.decl_count ?? 0) === 0) return false;
      if (filter === "conflict"    && !isConflict(r)) return false;
      if (filter === "padded"      && !r.hs8_is_padded) return false;
      if (!t) return true;
      if (r.code.toLowerCase().includes(t)) return true;
      // Cross-style digit match: "4202.29" must find a row stored as "42022900".
      if (td.length >= 2 && digitsOf(r.code).includes(td)) return true;
      if (clean(r.description).toLowerCase().includes(t)) return true;
      if (clean(r.description_en).toLowerCase().includes(t)) return true;
      if (clean(r.hs_note).toLowerCase().includes(t)) return true;
      if (clean(r.source).toLowerCase().includes(t)) return true;
      return false;
    });
  }, [rows, search, filter]);

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={<Layers className="h-4 w-4" />} label="พิกัดทั้งหมด" value={stats.total} />
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
            placeholder="ค้นหา พิกัด (4202.29 หรือ 42022900) · ชื่อไทย/อังกฤษ · หมายเหตุ…"
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
            <CodeRow key={r.code} r={r} conflict={isConflict(r)} onEdit={() => openEdit(r)} onAdopt={() => adoptDecl(r)} />
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
  r, conflict, onEdit, onAdopt,
}: { r: HsRow; conflict: boolean; onEdit: () => void; onAdopt: () => void }) {
  const used = (r.decl_count ?? 0) > 0;
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
          <p className="mt-0.5 text-[13px] font-semibold text-foreground break-words">{r.description}</p>
          {clean(r.description_en) && <p className="text-[11px] text-muted break-words">{r.description_en}</p>}
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

// ════════════════════════════════════════════════════════════════════
// §2 — สินค้า → พิกัด (product-grain aliases · absorbed from /hs-library/bot)
// ════════════════════════════════════════════════════════════════════
function completeness(r: DocBotHsRow): number {
  let s = 0;
  if (clean(r.hs_code)) s += 8;
  if (clean(r.no))      s += 4;
  if (clean(r.fe))      s += 2;
  if (clean(r.stat))    s += 1;
  return s;
}
function betterRow(a: DocBotHsRow, b: DocBotHsRow): DocBotHsRow {
  const ca = completeness(a), cb = completeness(b);
  if (ca !== cb) return ca > cb ? a : b;
  return (a.imported_at ?? "") >= (b.imported_at ?? "") ? a : b;
}
function groupKeyOf(r: DocBotHsRow): string {
  const th = clean(r.th).toLowerCase();
  if (th) return "th:" + th;
  const en = clean(r.en).toLowerCase();
  if (en) return "en:" + en;
  const code = clean(r.hs_code);
  if (code) return "code:" + code;
  return "id:" + r.id;
}

type ProductGroup = {
  key: string; productTh: string; productEn: string; rowCount: number;
  primary: DocBotHsRow | null; alternates: DocBotHsRow[];
  distinctCodes: string[]; hasConflict: boolean; isEmpty: boolean; newest: string;
};

function buildGroups(rows: DocBotHsRow[]): ProductGroup[] {
  const byKey = new Map<string, DocBotHsRow[]>();
  for (const r of rows) {
    const k = groupKeyOf(r);
    const arr = byKey.get(k);
    if (arr) arr.push(r); else byKey.set(k, [r]);
  }
  const groups: ProductGroup[] = [];
  for (const [key, arr] of byKey) {
    const repByCode = new Map<string, DocBotHsRow>();
    for (const r of arr) {
      const c = clean(r.hs_code);
      if (!c) continue;
      const cur = repByCode.get(c);
      repByCode.set(c, cur ? betterRow(cur, r) : r);
    }
    const distinctCodes = [...repByCode.keys()];
    let primary: DocBotHsRow | null = null;
    for (const r of arr) primary = primary ? betterRow(primary, r) : r;
    const primaryCode = clean(primary?.hs_code ?? "");
    const alternates = distinctCodes
      .filter((c) => c !== primaryCode)
      .map((c) => repByCode.get(c)!)
      .sort((a, b) => completeness(b) - completeness(a) || clean(a.hs_code).localeCompare(clean(b.hs_code)));
    const productTh = clean(primary?.th) || clean(arr.find((r) => clean(r.th))?.th) || "";
    const productEn = clean(primary?.en) || clean(arr.find((r) => clean(r.en))?.en) || "";
    let newest = "";
    for (const r of arr) if ((r.imported_at ?? "") > newest) newest = r.imported_at ?? "";
    groups.push({
      key, productTh, productEn, rowCount: arr.length, primary, alternates, distinctCodes,
      hasConflict: distinctCodes.length > 1, isEmpty: distinctCodes.length === 0, newest,
    });
  }
  groups.sort((a, b) => (b.newest > a.newest ? 1 : b.newest < a.newest ? -1 : 0));
  return groups;
}

/** Duty chip — renders the doc-bot value VERBATIM ('10%' / 'ยกเว้น' / '-' / '0.1').
 *  Deliberately uncoerced: the source has a real ×100 fraction bug ('0.1' meaning
 *  10%), and silently "fixing" it in a display would hide the data problem the
 *  Doc team needs to see. The library (§1) does the coercion, flags it, and
 *  never marks a bot-derived duty as confirmed. */
function DutyChip({ label, value }: { label: string; value: string | null | undefined }) {
  const v = clean(value);
  if (!v) return null;
  return (
    <span className={chipDuty}>
      <span className="text-muted">{label}</span>
      <span className="font-mono font-semibold">{v}</span>
    </span>
  );
}
function DutyRow({ r }: { r: DocBotHsRow }) {
  const hasAny = clean(r.no) || clean(r.fe) || clean(r.stat);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DutyChip label="อากรปกติ" value={r.no} />
      <DutyChip label="Form-E" value={r.fe} />
      <DutyChip label="สถิติ" value={r.stat} />
      {!hasAny && <span className="text-[11px] text-muted">— ไม่มีข้อมูลอากร —</span>}
    </div>
  );
}

function ProductsSection() {
  const [rows, setRows] = useState<DocBotHsRow[] | null>(null);
  const [overrides, setOverrides] = useState<DocBotHsOverrideRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Lazy-load on first open — 5,335 alias rows should not be in the initial paint.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [lib, ov] = await Promise.all([listDocBotHsLibrary(), listDocBotHsOverrides()]);
      if (!alive) return;
      if (lib.ok && lib.data) setRows(lib.data);
      else setErr(lib.ok ? "ไม่พบข้อมูล" : lib.error ?? "โหลดไม่สำเร็จ");
      if (ov.ok && ov.data) setOverrides(ov.data);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const allGroups = useMemo(() => buildGroups(rows ?? []), [rows]);
  const stats = useMemo(() => ({
    totalRows:      rows?.length ?? 0,
    productCount:   allGroups.length,
    conflictGroups: allGroups.filter((g) => g.hasConflict).length,
    emptyRows:      (rows ?? []).filter((r) => !clean(r.hs_code)).length,
    emptyGroups:    allGroups.filter((g) => g.isEmpty).length,
  }), [rows, allGroups]);

  const [search, setSearch] = useState("");
  const [onlyConflict, setOnlyConflict] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState(false);

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (onlyConflict && !g.hasConflict) return false;
      if (onlyEmpty && !g.isEmpty) return false;
      if (!t) return true;
      if (g.productTh.toLowerCase().includes(t)) return true;
      if (g.productEn.toLowerCase().includes(t)) return true;
      if (clean(g.primary?.hs_code).toLowerCase().includes(t)) return true;
      if (g.alternates.some((a) => clean(a.hs_code).toLowerCase().includes(t))) return true;
      return false;
    });
  }, [allGroups, search, onlyConflict, onlyEmpty]);

  const RENDER_CAP = 400;
  const shown = visible.slice(0, RENDER_CAP);

  const filterBtn = (active: boolean) =>
    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors " +
    (active ? "border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-950/20" : "border-border hover:bg-surface-alt");

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-white dark:bg-surface p-8 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลดคลังสินค้า → พิกัด (บอท + ไฟล์)…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        คลังจาก <b>DOC BOT</b> + <b>ไฟล์พิกัดอัพเดท</b> จัดกลุ่ม <b>ตามชื่อสินค้า</b> — แต่ละสินค้ามี{" "}
        <b>พิกัดหลัก</b> (ระบบเลือกจากรายการที่ข้อมูลครบสุด) + <b>พิกัดรอง</b> (พิกัดอื่นที่เคยตอบกับสินค้าเดียวกัน)
        ให้ฝ่ายเอกสาร <b>เลือกเองตามเคส</b> (พิกัด “ติด” ด่าน → เลี่ยงไปพิกัดรอง). ตัวเลขอากรที่นี่{" "}
        <b>แสดงตามต้นฉบับ ไม่แปลงค่า</b> — ตัวเลขที่ใช้งานจริงอยู่ในแท็บ <b>พิกัด (คลังหลัก)</b>.
      </p>

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">โหลดคลังบอทไม่สำเร็จ: {err}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={<Layers className="h-4 w-4" />} label="แถวทั้งหมด" value={stats.totalRows} />
        <StatCard icon={<PackageSearch className="h-4 w-4" />} label="สินค้า (จัดกลุ่ม)" value={stats.productCount} />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="สินค้าพิกัดขัดกัน" value={stats.conflictGroups} tone="amber" />
        <StatCard icon={<Ban className="h-4 w-4 text-slate-500" />} label="แถวยังไม่มีพิกัด" value={stats.emptyRows} tone="slate" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อสินค้า (ไทย/อังกฤษ) หรือ เลขพิกัด HS…" className={inputCls + " pl-8 w-72"} />
        </div>
        <button type="button" className={filterBtn(onlyConflict)} onClick={() => setOnlyConflict((v) => !v)}>
          <AlertTriangle className="h-3.5 w-3.5" /> เฉพาะที่มีพิกัดขัดกัน
          {stats.conflictGroups > 0 && <span className="tabular-nums opacity-70">({stats.conflictGroups})</span>}
        </button>
        <button type="button" className={filterBtn(onlyEmpty)} onClick={() => setOnlyEmpty((v) => !v)}>
          <Ban className="h-3.5 w-3.5" /> เฉพาะที่ยังไม่มี code
          {stats.emptyGroups > 0 && <span className="tabular-nums opacity-70">({stats.emptyGroups})</span>}
        </button>
        {(search || onlyConflict || onlyEmpty) && (
          <button type="button" className={btnGhost}
            onClick={() => { setSearch(""); setOnlyConflict(false); setOnlyEmpty(false); }}>
            ล้าง
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted">
          แสดง {shown.length.toLocaleString("th-TH")} / {visible.length.toLocaleString("th-TH")} สินค้า
          {visible.length > RENDER_CAP && ` (จำกัด ${RENDER_CAP} แรก — ใช้ค้นหาเพื่อกรอง)`}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center text-xs text-muted">
          ไม่พบสินค้าที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <div className="space-y-2.5">{shown.map((g) => <ProductCard key={g.key} g={g} />)}</div>
      )}

      {/* ── คำที่ต้องแก้พิกัด (the previously-orphaned overrides) ── */}
      {overrides.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-3.5 space-y-2">
          <h3 className="text-sm font-semibold">คำที่ต้องแก้พิกัด (บอทเคยตอบผิด)</h3>
          <p className="text-[11px] text-muted">
            รายการที่ฝ่ายเอกสารเคยแก้ไว้ว่า “ถ้าเจอคำนี้ พิกัดที่ถูกคือ…” — เก็บไว้ในระบบตั้งแต่ตอนย้าย DOC BOT
            แต่ยังไม่เคยถูกนำมาแสดงที่ไหน จึงยกมาไว้ตรงนี้ให้เห็น.
          </p>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
              <thead className="bg-surface-alt/50 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">คำ / keyword</th>
                  <th className="px-3 py-2">พิกัดที่ถูกต้อง</th>
                  <th className="px-3 py-2">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-alt/30">
                    <td className="px-3 py-2 text-[13px]">{clean(o.keyword) || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{clean(o.correct_hs) || "—"}</td>
                    <td className="px-3 py-2 text-[11px] text-muted">{clean(o.note) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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

function ProductCard({ g }: { g: ProductGroup }) {
  const p = g.primary;
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground break-words">
            {g.productTh || <span className="text-muted italic">(ไม่ระบุชื่อไทย)</span>}
          </h3>
          {g.productEn && <p className="text-[11px] text-muted break-words">{g.productEn}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {g.hasConflict && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <AlertTriangle className="h-3 w-3" /> พิกัดขัดกัน {g.distinctCodes.length} เลข
            </span>
          )}
          {g.isEmpty && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              <Ban className="h-3 w-3" /> ยังไม่มีพิกัด
            </span>
          )}
          {clean(p?.source) && <SourceBadge source={p!.source} provenance={null} />}
          <span className="rounded-full border border-border bg-surface-alt/50 px-2 py-0.5 text-[11px] text-muted tabular-nums">
            ถูกถาม {g.rowCount.toLocaleString("th-TH")} ครั้ง
          </span>
        </div>
      </div>

      {p && clean(p.hs_code) ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">พิกัดหลัก</span>
            <span className="font-mono text-sm font-bold text-foreground">{clean(p.hs_code)}</span>
          </div>
          <div className="mt-1.5"><DutyRow r={p} /></div>
          {clean(p.note) && <p className="mt-1.5 text-[11px] text-muted break-words">📝 {clean(p.note)}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 dark:bg-slate-900/20 px-3 py-2 text-[11px] text-muted">
          — ยังไม่มีเลขพิกัดสำหรับสินค้านี้ (มีแต่คำถาม รอฝ่ายเอกสารกำหนดพิกัด) —
        </div>
      )}

      {g.alternates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted">
            พิกัดรอง (ตัวเลือกอื่น · เลือกใช้ตามเคส / เลี่ยงพิกัด) — {g.alternates.length} เลข
          </p>
          <div className="space-y-1.5">
            {g.alternates.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-foreground">{clean(a.hs_code)}</span>
                  <DutyRow r={a} />
                </div>
                {clean(a.note) && <p className="mt-1 text-[11px] text-muted break-words">📝 {clean(a.note)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * <HsLibraryBotClient> — READ-ONLY grouped browse of the DOC BOT HS library
 * (doc_bot_hs_codes · mig 0249).
 *
 * Groups the 749 flat bot rows BY PRODUCT (normalize th: lower+trim), then per
 * product shows a computed พิกัดหลัก (primary) + every other distinct code as
 * พิกัดรอง (alternates) — the "choose later / เลี่ยงพิกัด" list. A ⚠️ badge marks
 * the conflict groups (>1 distinct code) the Doc team must resolve.
 *
 * ⚠️ DISPLAY ONLY (§0e) — nothing here mutates. No edit / merge / dedup buttons;
 * the owner picks the primaries in a later slice.
 */

import { useMemo, useState } from "react";
import { Search, AlertTriangle, Layers, PackageSearch, Ban } from "lucide-react";
import type { DocBotHsRow } from "@/actions/admin/doc-bot-hs";

// ── tiny helpers ──────────────────────────────────────────────
function clean(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * Completeness score for choosing the primary / a per-code representative row.
 * "MOST COMPLETE (has `no` normal-duty, then `fe`, then `stat`)" + a code is
 * essential, so a coded row always outranks an empty-code row.
 */
function completeness(r: DocBotHsRow): number {
  let s = 0;
  if (clean(r.hs_code)) s += 8; // must have a code to be useful
  if (clean(r.no))      s += 4; // อากรปกติ
  if (clean(r.fe))      s += 2; // Form-E
  if (clean(r.stat))    s += 1; // รหัสสถิติ
  return s;
}

/** Better of two rows: higher completeness, tie-break by most-recent import. */
function betterRow(a: DocBotHsRow, b: DocBotHsRow): DocBotHsRow {
  const ca = completeness(a);
  const cb = completeness(b);
  if (ca !== cb) return ca > cb ? a : b;
  return (a.imported_at ?? "") >= (b.imported_at ?? "") ? a : b;
}

/** Group key = normalized th (fallback en → code → row id so blanks don't collapse). */
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
  key:           string;
  productTh:     string;
  productEn:     string;
  rowCount:      number;
  primary:       DocBotHsRow | null;
  alternates:    DocBotHsRow[]; // one representative row per distinct code ≠ primary's
  distinctCodes: string[];
  hasConflict:   boolean;       // >1 distinct code = Doc must choose
  isEmpty:       boolean;       // no row in the group has a code
  newest:        string;        // max imported_at (for newest-first sort)
};

function buildGroups(rows: DocBotHsRow[]): ProductGroup[] {
  const byKey = new Map<string, DocBotHsRow[]>();
  for (const r of rows) {
    const k = groupKeyOf(r);
    const arr = byKey.get(k);
    if (arr) arr.push(r);
    else byKey.set(k, [r]);
  }

  const groups: ProductGroup[] = [];
  for (const [key, arr] of byKey) {
    // Representative (most-complete) row per distinct non-empty code.
    const repByCode = new Map<string, DocBotHsRow>();
    for (const r of arr) {
      const c = clean(r.hs_code);
      if (!c) continue;
      const cur = repByCode.get(c);
      repByCode.set(c, cur ? betterRow(cur, r) : r);
    }
    const distinctCodes = [...repByCode.keys()];

    // Primary = the single best row across ALL rows (coded rows win via score).
    let primary: DocBotHsRow | null = null;
    for (const r of arr) primary = primary ? betterRow(primary, r) : r;

    const primaryCode = clean(primary?.hs_code ?? "");
    const alternates = distinctCodes
      .filter((c) => c !== primaryCode)
      .map((c) => repByCode.get(c)!)
      .sort(
        (a, b) =>
          completeness(b) - completeness(a) ||
          clean(a.hs_code).localeCompare(clean(b.hs_code)),
      );

    const productTh = clean(primary?.th) || clean(arr.find((r) => clean(r.th))?.th) || "";
    const productEn = clean(primary?.en) || clean(arr.find((r) => clean(r.en))?.en) || "";
    let newest = "";
    for (const r of arr) if ((r.imported_at ?? "") > newest) newest = r.imported_at ?? "";

    groups.push({
      key,
      productTh,
      productEn,
      rowCount:      arr.length,
      primary,
      alternates,
      distinctCodes,
      hasConflict:   distinctCodes.length > 1,
      isEmpty:       distinctCodes.length === 0,
      newest,
    });
  }

  // Newest product first (matches the action's newest-first read).
  groups.sort((a, b) => (b.newest > a.newest ? 1 : b.newest < a.newest ? -1 : 0));
  return groups;
}

// ── styling tokens (mirror hs-library-client) ──────────────────
const chipDuty =
  "inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt/50 px-1.5 py-0.5 text-[11px] tabular-nums";

/** One duty/stat chip — shows a label + the raw text value (verbatim, uncoerced). */
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

/** The duty row (อากรปกติ · Form-E · สถิติ) for one code. */
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

export function HsLibraryBotClient({ rows }: { rows: DocBotHsRow[] }) {
  const allGroups = useMemo(() => buildGroups(rows), [rows]);

  // Summary stats over the FULL dataset (independent of filters).
  const stats = useMemo(() => {
    const emptyRows = rows.filter((r) => !clean(r.hs_code)).length;
    return {
      totalRows:      rows.length,
      productCount:   allGroups.length,
      conflictGroups: allGroups.filter((g) => g.hasConflict).length,
      emptyRows,
      emptyGroups:    allGroups.filter((g) => g.isEmpty).length,
    };
  }, [rows, allGroups]);

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

  // Cap the rendered list so a huge match set stays responsive.
  const RENDER_CAP = 400;
  const shown = visible.slice(0, RENDER_CAP);

  const filterBtn = (active: boolean) =>
    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs transition-colors " +
    (active
      ? "border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-950/20"
      : "border-border hover:bg-surface-alt");

  return (
    <div className="space-y-4">
      {/* ── summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={<Layers className="h-4 w-4" />} label="แถวทั้งหมด" value={stats.totalRows} />
        <StatCard icon={<PackageSearch className="h-4 w-4" />} label="สินค้า (จัดกลุ่ม)" value={stats.productCount} />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
          label="สินค้าพิกัดขัดกัน"
          value={stats.conflictGroups}
          tone="amber"
        />
        <StatCard
          icon={<Ban className="h-4 w-4 text-slate-500" />}
          label="แถวยังไม่มีพิกัด"
          value={stats.emptyRows}
          tone="slate"
        />
      </div>

      {/* ── search + filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อสินค้า (ไทย/อังกฤษ) หรือ เลขพิกัด HS…"
            className="w-72 rounded-lg border border-border bg-white dark:bg-surface pl-8 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          />
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
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt"
            onClick={() => {
              setSearch("");
              setOnlyConflict(false);
              setOnlyEmpty(false);
            }}
          >
            ล้าง
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted">
          แสดง {shown.length.toLocaleString("th-TH")} / {visible.length.toLocaleString("th-TH")} สินค้า
          {visible.length > RENDER_CAP && ` (จำกัด ${RENDER_CAP} แรก — ใช้ค้นหาเพื่อกรอง)`}
        </span>
      </div>

      {/* ── grouped product cards ── */}
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-white dark:bg-surface p-8 text-center text-xs text-muted">
          ไม่พบสินค้าที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <div className="space-y-2.5">
          {shown.map((g) => (
            <ProductCard key={g.key} g={g} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted leading-relaxed">
        ⚠️ ข้อมูลอ้างอิงจากคลัง DOC BOT เท่านั้น (อ่านอย่างเดียว) — <b>พิกัดหลัก</b> คือค่าเริ่มต้นที่ระบบเลือกให้
        (ข้อมูลครบสุด: มีอากรปกติ → Form-E → รหัสสถิติ) · <b>พิกัดรอง</b> คือเลขพิกัดอื่นที่เคยตอบกับสินค้าเดียวกัน —
        ฝ่ายเอกสารเลือกใช้เองตามเคส (กรณีพิกัด "ติด" ด่าน → เลี่ยงไปใช้พิกัดรอง). การแก้ไข/รวมเข้าคลังหลัก
        ทำในขั้นตอนถัดไป — หน้านี้ไม่แก้ไขข้อมูลใดๆ.
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "amber" | "slate";
}) {
  const ring =
    tone === "amber"
      ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10"
      : tone === "slate"
      ? "border-slate-200 bg-slate-50/50 dark:bg-slate-900/20"
      : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-xl border ${ring} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}

function ProductCard({ g }: { g: ProductGroup }) {
  const p = g.primary;
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-3.5 space-y-2.5">
      {/* header: product identity + badges */}
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
          <span className="rounded-full border border-border bg-surface-alt/50 px-2 py-0.5 text-[11px] text-muted tabular-nums">
            ถูกถาม {g.rowCount.toLocaleString("th-TH")} ครั้ง
          </span>
        </div>
      </div>

      {/* พิกัดหลัก (primary) */}
      {p && clean(p.hs_code) ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              พิกัดหลัก
            </span>
            <span className="font-mono text-sm font-bold text-foreground">{clean(p.hs_code)}</span>
          </div>
          <div className="mt-1.5">
            <DutyRow r={p} />
          </div>
          {clean(p.note) && <p className="mt-1.5 text-[11px] text-muted break-words">📝 {clean(p.note)}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 dark:bg-slate-900/20 px-3 py-2 text-[11px] text-muted">
          — ยังไม่มีเลขพิกัดสำหรับสินค้านี้ (มีแต่คำถาม รอฝ่ายเอกสารกำหนดพิกัด) —
        </div>
      )}

      {/* พิกัดรอง (alternates) */}
      {g.alternates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted">
            พิกัดรอง (ตัวเลือกอื่น · เลือกใช้ตามเคส / เลี่ยงพิกัด) — {g.alternates.length} เลข
          </p>
          <div className="space-y-1.5">
            {g.alternates.map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5"
              >
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

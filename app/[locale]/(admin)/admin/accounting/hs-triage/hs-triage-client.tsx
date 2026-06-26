"use client";

/**
 * GAP 5 (+owner 2026-06-12) — the CS HS-triage queue UI.
 *
 * One flat, numbered list of per-line items (ฝากนำเข้า + ฝากสั่งซื้อ · นำเข้า & ส่งออก).
 * CS can: search by product name · toggle "เฉพาะที่ยังไม่มีพิกัด" · edit a single
 * line's พิกัด (HS + รหัสสถิติ) inline · OR **multi-select** lines and BULK-assign
 * one พิกัด to all of them ("เลือกรายการ 1,2,3,5… → เพิ่มเข้าพิกัด 3926.90.99"). A live
 * คลัง HS hint shows the duty + suggests the usual รหัสสถิติ. Everything writes ONLY
 * hs_code + hs_stat_code (§0e) via setLineHsCode / setBulkHsCode.
 */
import { useState, useEffect, useTransition, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { setLineHsCode, setBulkHsCode, listHsTriage } from "@/actions/admin/hs-triage";
import { lookupHsCode, type HsLookupRow } from "@/actions/admin/hs-codes";
import { HsCodePicker } from "@/components/admin/hs-code-picker";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { HsTriageForwarderLine, HsTriageShopLine } from "@/actions/admin/hs-triage";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type LineKind = "forwarder" | "shop";
type Row = {
  kind: LineKind;
  id: number;
  title: string;
  subtitle: string;
  href: string;
  hsCode: string | null;
  statCode: string | null;
};

// The `kind:` prefix is LOAD-BEARING: forwarder id and shop id are PKs of
// DIFFERENT tables, so they can collide as bare ints. Keep the prefix here AND in
// setBulkHsCode's per-kind partition or selection rows would silently merge.
const keyOf = (r: { kind: LineKind; id: number }) => `${r.kind}:${r.id}`;

function flatten(fwd: HsTriageForwarderLine[], shop: HsTriageShopLine[]): Row[] {
  const a: Row[] = fwd.map((l) => ({
    kind: "forwarder",
    id: l.id,
    title: l.productname || "(ไม่มีชื่อสินค้า)",
    subtitle: `📦 ฝากนำเข้า · ออเดอร์ #${l.fNo ?? l.fid ?? "—"}${l.customer ? ` · ${l.customer}` : ""}`,
    href: `/admin/forwarders/${l.fid ?? ""}`,
    hsCode: l.hsCode,
    statCode: l.statCode,
  }));
  const b: Row[] = shop.map((l) => ({
    kind: "shop",
    id: l.id,
    title: l.ctitle || "(ไม่มีชื่อสินค้า)",
    subtitle: `🛒 ฝากสั่งซื้อ · ออเดอร์ ${l.hno ?? "—"}`,
    href: `/admin/service-orders/${l.hno ?? ""}`,
    hsCode: l.hsCode,
    statCode: l.statCode,
  }));
  return [...a, ...b];
}

type HsHint = null | "loading" | "notfound" | HsLookupRow;

/** Debounced คลัง HS lookup → duty hint + the usual รหัสสถิติ. Reference only. */
function useHsHint(code: string): HsHint {
  const [hint, setHint] = useState<HsHint>(null);
  useEffect(() => {
    const c = code.trim();
    let cancelled = false;
    if (c.length < 3) {
      queueMicrotask(() => { if (!cancelled) setHint(null); });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => { if (!cancelled) setHint("loading"); });
    const t = setTimeout(() => {
      lookupHsCode(c).then((res) => {
        if (cancelled) return;
        setHint(res.ok && res.data ? res.data : "notfound");
      }).catch(() => { if (!cancelled) setHint("notfound"); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [code]);
  return hint;
}

function HsHintLine({ hint }: { hint: HsHint }) {
  if (hint === null) return null;
  if (hint === "loading") return <span className="text-[11px] text-muted">กำลังค้นคลัง HS…</span>;
  if (hint === "notfound") return <span className="text-[11px] text-amber-600">— ไม่พบใน คลัง HS —</span>;
  return (
    <span className="text-[11px] text-emerald-700">
      อากรปกติ {hint.default_duty_pct}% · Form-E {hint.form_e_duty_pct}% · สถิติปกติ {hint.default_stat_code ?? "000"}
      {hint.description ? ` · ${hint.description}` : ""}
    </span>
  );
}

/** Inline single-line editor (HS + stat) for one row. */
function TriageRow({
  index,
  row,
  selected,
  onToggle,
  onSaved,
}: {
  index: number;
  row: Row;
  selected: boolean;
  onToggle: () => void;
  onSaved: (hs: string, stat: string) => void;
}) {
  const [hs, setHs] = useState(row.hsCode ?? "");
  const [stat, setStat] = useState(row.statCode ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const hint = useHsHint(hs);
  const { confirm, dialogs } = useConfirmDialogs();

  async function save() {
    setErr(null);
    const ok = await confirm(`บันทึกพิกัด "${hs.trim() || "(ล้าง)"}"${stat.trim() ? ` · สถิติ ${stat.trim()}` : ""} ให้รายการนี้?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await setLineHsCode({ kind: row.kind, id: row.id, hsCode: hs.trim(), statCode: stat.trim() });
      if (res.ok) onSaved(hs.trim(), stat.trim());
      else setErr(res.error ?? "บันทึกไม่สำเร็จ");
    });
  }

  const dirty = (hs.trim() !== (row.hsCode ?? "")) || (stat.trim() !== (row.statCode ?? ""));

  return (
    <div className={`rounded-xl border p-2.5 ${selected ? "border-primary-400 bg-primary-50/40" : "border-border bg-white dark:bg-surface"}`}>
      {dialogs}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 h-4 w-4 accent-primary-600" aria-label="เลือก" />
          <span className="mt-0.5 text-[11px] text-muted tabular-nums w-6 shrink-0">{index}</span>
          <div className="min-w-0">
            <Link href={row.href} className="text-xs font-medium text-primary-600 hover:underline break-words line-clamp-1">
              {row.title}
            </Link>
            <p className="text-[11px] text-muted truncate">{row.subtitle}</p>
            {row.hsCode && <p className="text-[11px] text-emerald-700">พิกัดเดิม {row.hsCode}{row.statCode ? ` · สถิติ ${row.statCode}` : ""}</p>}
          </div>
        </div>
        <div className="sm:w-80 space-y-0.5">
          <div className="flex gap-1.5">
            <div className="flex-1 min-w-0">
              <HsCodePicker
                value={hs}
                onChange={setHs}
                onPick={(row) => { if (stat.trim() === "" && row.default_stat_code) setStat(row.default_stat_code); }}
                placeholder="HS 8471.30.20 หรือชื่อสินค้า"
                inputClassName={inputCls + " pr-7"}
                aria-label="พิกัด HS"
              />
            </div>
            <input value={stat} onChange={(e) => setStat(e.target.value)} placeholder="สถิติ" maxLength={10} className={inputCls + " w-20 tabular-nums"} />
            <button type="button" disabled={pending || !dirty} onClick={save}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-40 whitespace-nowrap">
              {pending ? "…" : "บันทึก"}
            </button>
          </div>
          <HsHintLine hint={hint} />
          {err && <span className="block text-[11px] text-red-600">{err}</span>}
        </div>
      </div>
    </div>
  );
}

export function HsTriageClient({
  forwarderLines,
  shopLines,
}: {
  forwarderLines: HsTriageForwarderLine[];
  shopLines: HsTriageShopLine[];
}) {
  const [rows, setRows] = useState<Row[]>(() => flatten(forwarderLines, shopLines));
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [querying, startQuery] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkHs, setBulkHs] = useState("");
  const [bulkStat, setBulkStat] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);
  const bulkHint = useHsHint(bulkHs);
  const { confirm, dialogs } = useConfirmDialogs();

  // Pre-fill the bulk stat from the คลัง HS default when the duty hint lands.
  // bulkHint is referentially stable (it's useHsHint's own useState), so [bulkHint]
  // can't loop; setBulkStat is queueMicrotask-wrapped (React-19 set-state-in-effect).
  useEffect(() => {
    if (bulkHint && typeof bulkHint === "object" && bulkStat.trim() === "") {
      const d = bulkHint.default_stat_code;
      if (d) queueMicrotask(() => setBulkStat(d));
    }
  }, [bulkHint]); // eslint-disable-line react-hooks/exhaustive-deps

  function runQuery(nextSearch: string, nextMissing: boolean) {
    startQuery(async () => {
      const res = await listHsTriage({ search: nextSearch, missingOnly: nextMissing, limit: 300 });
      if (res.ok && res.data) {
        setRows(flatten(res.data.forwarderLines, res.data.shopLines));
        setSelected(new Set());
      }
    });
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }
  function selectAllVisible() {
    setSelected(new Set(rows.map(keyOf)));
  }
  function clearSel() { setSelected(new Set()); }

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected]);

  async function applyBulk() {
    if (selectedRows.length === 0) return;
    const ok = await confirm(
      `เพิ่ม ${selectedRows.length} รายการ เข้าพิกัด "${bulkHs.trim() || "(ล้าง)"}"${bulkStat.trim() ? ` · สถิติ ${bulkStat.trim()}` : ""}?`,
    );
    if (!ok) return;
    startBulk(async () => {
      const res = await setBulkHsCode({
        items: selectedRows.map((r) => ({ kind: r.kind, id: r.id })),
        hsCode: bulkHs.trim(),
        statCode: bulkStat.trim(),
      });
      if (res.ok) {
        setBanner(`✓ เพิ่ม ${res.data?.updated ?? selectedRows.length} รายการ เข้าพิกัดแล้ว`);
        setBulkHs(""); setBulkStat("");
        // Authoritative refetch (NOT an optimistic patch) so the row badges reflect
        // exactly what the DB matched — `updated` can be < selected if a row went
        // stale between load and apply (§0f badge accuracy). runQuery clears selection.
        runQuery(search, missingOnly);
      } else {
        setBanner(`✗ ${res.error ?? "บันทึกไม่สำเร็จ"}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      {dialogs}

      {/* controls */}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); runQuery(search, missingOnly); }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อสินค้า (หาของซ้ำเพื่อให้พิกัดเดียวกัน)…"
          className={inputCls + " max-w-xs"}
        />
        <button type="submit" disabled={querying} className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">
          {querying ? "ค้นหา…" : "ค้นหา"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={missingOnly} onChange={(e) => { setMissingOnly(e.target.checked); runQuery(search, e.target.checked); }} className="h-4 w-4 accent-primary-600" />
          เฉพาะที่ยังไม่มีพิกัด
        </label>
        <span className="text-[11px] text-muted">· {rows.length} รายการ</span>
      </form>

      {banner && (
        <p className={`rounded-lg px-3 py-2 text-sm ${banner.startsWith("✓") ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-700"}`}>
          {banner}
        </p>
      )}

      {/* bulk-assign bar (sticky when selecting) */}
      {selectedRows.length > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-primary-300 bg-primary-50 dark:bg-surface p-3 shadow-sm space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-primary-800">เลือก {selectedRows.length} รายการ → เพิ่มเข้าพิกัด:</span>
            <div className="w-52">
              <HsCodePicker
                value={bulkHs}
                onChange={setBulkHs}
                onPick={(row) => { if (bulkStat.trim() === "" && row.default_stat_code) setBulkStat(row.default_stat_code); }}
                placeholder="HS หรือชื่อสินค้า"
                inputClassName={inputCls + " pr-7"}
                aria-label="พิกัด HS (กลุ่ม)"
              />
            </div>
            <input value={bulkStat} onChange={(e) => setBulkStat(e.target.value)} placeholder="สถิติ 000" maxLength={10} className={inputCls + " w-24 tabular-nums"} />
            <button type="button" disabled={bulkPending} onClick={applyBulk}
              className="rounded-md bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {bulkPending ? "กำลังเพิ่ม…" : "เพิ่มเข้าพิกัด"}
            </button>
            <button type="button" onClick={clearSel} className="text-xs text-muted hover:underline">ยกเลิกการเลือก</button>
          </div>
          <HsHintLine hint={bulkHint} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-alt/30 px-4 py-10 text-center text-sm text-muted">
          {missingOnly ? "🎉 ไม่มีรายการค้าง — ทุกรายการมีพิกัดแล้ว" : "ไม่พบรายการตามที่ค้นหา"}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <button type="button" onClick={selectAllVisible} className="hover:underline">เลือกทั้งหมดที่แสดง</button>
            {selected.size > 0 && <button type="button" onClick={clearSel} className="hover:underline">ล้าง</button>}
          </div>
          {rows.map((r, i) => (
            <TriageRow
              key={keyOf(r)}
              index={i + 1}
              row={r}
              selected={selected.has(keyOf(r))}
              onToggle={() => toggle(keyOf(r))}
              onSaved={(hs, stat) =>
                setRows((prev) => prev.map((x) => (keyOf(x) === keyOf(r) ? { ...x, hsCode: hs || null, statCode: stat || null } : x)))
              }
            />
          ))}
        </div>
      )}

      <p className="pt-1 text-[11px] leading-relaxed text-muted">
        แสดงรายการล่าสุด (เรียงใหม่→เก่า · จำกัดจำนวนเพื่อความเร็ว) — ใช้ค้นหาเพื่อหาของซ้ำแล้วเลือกหลายรายการ
        ใส่พิกัดเดียวกันทีเดียว. เขียนเฉพาะ HS + รหัสสถิติ (ไม่กระทบราคา/ต้นทุน/สถานะ).
      </p>
    </div>
  );
}

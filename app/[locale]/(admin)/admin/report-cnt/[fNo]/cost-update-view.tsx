"use client";

/**
 * <CostUpdateView> — Wave 16 follow-up B (2026-05-23)
 *
 * Pacred-native replacement for the legacy `report-cnt.php?action=cost-update`
 * Google Sheets view. The legacy view called the Sheets API live to fetch
 * carrier (Sang/CTT/MK/MX) cost sheets and bulk-applied them into
 * `fCostTotalPrice`. We drop the Sheets dependency entirely:
 *
 *   1. Admin sees every forwarder row in this container with the current
 *      `fCostTotalPriceSheet` (carrier reference cost) and the current
 *      `fCostTotalPrice` (PCS internal cost).
 *   2. Admin can EDIT each row's new Sheet cost inline.
 *   3. OR admin can UPLOAD a CSV exported from the carrier's sheet
 *      (`tracking_chn,cost_sheet` header). Our client-side parser matches
 *      by `tracking_chn` → forwarder row and pre-fills the new value.
 *   4. Single "บันทึกทั้งหมด" submit calls `adminBulkUpdateForwarderCostSheet`
 *      and the action audit-logs the bulk-update + revalidates.
 *
 * Pure Tailwind v4 + Lucide per AGENTS.md §0a — no Bootstrap-4 chrome.
 *
 * CSV parser — intentionally tiny (~40 LOC inline). Handles the two
 * real-world quirks we DO see: UTF-8 BOM (Excel exports), CRLF line
 * endings, and quoted cells with embedded commas (common when carriers
 * format costs as "1,500.00"). Does NOT handle multi-line quoted cells
 * — tracking numbers and prices don't have those. If we hit a real edge
 * case later, swap for `papaparse` (already in package.json — but we
 * avoid bundling it in this client view to keep the JS payload tiny).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Save, AlertTriangle, CheckCircle2, FileSpreadsheet, Info } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminBulkUpdateForwarderCostSheet } from "@/actions/admin/report-cnt-cost-update";
import type { DetailRow } from "./container-detail-client";

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export type CostUpdateViewProps = {
  fCabinetNumber: string;
  warehouseLabel: string;
  rows: DetailRow[];
};

// ─────────────────────────────────────────────────────────────────────
// CSV parser — tiny, handles only the format we expect:
//   tracking_chn,cost_sheet         ← header row (required)
//   SF1234567890,3500.00            ← data rows
//
// Returns { ok, rows, warnings } where warnings explain any rejected lines.
// ─────────────────────────────────────────────────────────────────────

type ParsedCsvRow = { trackingChn: string; costSheet: number };
type ParseResult = {
  ok:       boolean;
  rows:     ParsedCsvRow[];
  warnings: string[];
  error?:   string;
};

// Split a single CSV line respecting "quoted, cells, with commas".
// Doubled "" inside a quoted cell → literal " (per RFC-4180 minimum).
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i += 1; }
      else if (ch === '"') { inQuotes = false; }
      else { buf += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cells.push(buf); buf = ""; }
      else buf += ch;
    }
  }
  cells.push(buf);
  return cells.map((c) => c.trim());
}

function parseCsv(text: string): ParseResult {
  const warnings: string[] = [];
  // Normalise newlines + strip BOM (carrier Excel exports can ship UTF-8 BOM).
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { ok: false, rows: [], warnings, error: "ไฟล์ว่าง" };
  }

  // Header — accept `tracking_chn,cost_sheet` (case-insensitive) or its
  // common variants. Reject if neither column is found.
  const header = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const trkIdx = header.findIndex((c) => c === "tracking_chn" || c === "trackingchn" || c === "tracking");
  const costIdx = header.findIndex((c) => c === "cost_sheet" || c === "costsheet" || c === "cost");
  if (trkIdx < 0 || costIdx < 0) {
    return {
      ok: false, rows: [], warnings,
      error: "หัว CSV ต้องมีคอลัมน์ `tracking_chn` และ `cost_sheet` (พบ: " + header.join(", ") + ")",
    };
  }

  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const trk = cells[trkIdx] ?? "";
    // Strip thousands separators ("1,500.50" → "1500.50") AFTER cell-split.
    const costRaw = (cells[costIdx] ?? "").replace(/,/g, "");
    if (!trk) { warnings.push(`บรรทัด ${i + 1}: ขาด tracking_chn`); continue; }
    const cost = Number(costRaw);
    if (!Number.isFinite(cost) || cost < 0) {
      warnings.push(`บรรทัด ${i + 1}: ค่า cost_sheet ไม่ใช่ตัวเลข (${costRaw})`);
      continue;
    }
    rows.push({ trackingChn: trk, costSheet: cost });
  }

  return { ok: true, rows, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export function CostUpdateView({ fCabinetNumber, warehouseLabel, rows }: CostUpdateViewProps) {
  // edits: map fid → new sheet cost (string for input control). Missing
  // key = no edit (use the stored value when computing diffs).
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [csvSummary, setCsvSummary] = useState<{
    matched: number; unmatched: number; duplicates: number; warnings: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Build derived rows + change set
  const decorated = useMemo(() => {
    return rows.map((r) => {
      const editStr = edits.get(r.id);
      const newCost = editStr == null
        ? r.fcosttotalpricesheet
        : (Number.isFinite(Number(editStr)) ? Number(editStr) : r.fcosttotalpricesheet);
      const changed = editStr != null && Math.abs(newCost - r.fcosttotalpricesheet) > 0.005;
      return { ...r, newCost, changed, editStr: editStr ?? String(r.fcosttotalpricesheet) };
    });
  }, [rows, edits]);

  const changedCount = decorated.filter((r) => r.changed).length;
  const totalCurrent = rows.reduce((s, r) => s + r.fcosttotalprice, 0);
  const totalSheetCurrent = rows.reduce((s, r) => s + r.fcosttotalpricesheet, 0);
  const totalSheetNew = decorated.reduce((s, r) => s + r.newCost, 0);
  const totalSheetDiff = totalSheetNew - totalSheetCurrent;

  function setRowEdit(fid: number, value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      next.set(fid, value);
      return next;
    });
  }

  async function resetAll() {
    if (changedCount > 0 && !(await confirm(`ยกเลิกการแก้ไขทั้งหมด ${changedCount} รายการ?`))) return;
    setEdits(new Map());
    setCsvSummary(null);
    setMsg(null);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setMsg(null);
    setCsvSummary(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (!parsed.ok) {
        setMsg({ kind: "err", text: parsed.error ?? "อ่าน CSV ไม่สำเร็จ" });
        return;
      }
      // Match CSV rows to forwarder rows by tracking_chn. Track unmatched +
      // duplicate-matches separately so the admin sees what happened.
      const trkToRow = new Map<string, DetailRow>();
      const dupTracking = new Set<string>();
      for (const r of rows) {
        if (!r.ftrackingchn) continue;
        const key = r.ftrackingchn.toUpperCase();
        if (trkToRow.has(key)) dupTracking.add(key);
        else trkToRow.set(key, r);
      }

      const next = new Map<number, string>(edits);
      let matched = 0;
      let unmatched = 0;
      let duplicates = 0;
      const csvSeen = new Set<string>();

      for (const row of parsed.rows) {
        const key = row.trackingChn.toUpperCase();
        if (csvSeen.has(key)) {
          duplicates += 1;
          parsed.warnings.push(`tracking ${row.trackingChn}: ปรากฏซ้ำใน CSV — ใช้บรรทัดแรก`);
          continue;
        }
        csvSeen.add(key);
        const target = trkToRow.get(key);
        if (!target) {
          unmatched += 1;
          continue;
        }
        if (dupTracking.has(key)) {
          // The container itself has duplicate tracking — flag but still apply
          parsed.warnings.push(`tracking ${row.trackingChn}: มีหลายแถวในตู้ — ใช้แถวแรก (fid ${target.id})`);
        }
        next.set(target.id, String(row.costSheet));
        matched += 1;
      }
      setEdits(next);
      setCsvSummary({
        matched, unmatched, duplicates,
        warnings: parsed.warnings.slice(0, 20),
      });
      setMsg({
        kind: matched > 0 ? "ok" : "info",
        text: `จับคู่จาก CSV: ${matched} / ${parsed.rows.length} รายการ (ไม่พบ tracking: ${unmatched}, ซ้ำใน CSV: ${duplicates})`,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.onerror = () => setMsg({ kind: "err", text: "อ่านไฟล์ไม่สำเร็จ" });
    reader.readAsText(file, "utf-8");
  }

  async function save() {
    const updates = decorated
      .filter((r) => r.changed)
      .map((r) => ({ fid: r.id, newCostSheet: r.newCost }));
    if (updates.length === 0) {
      setMsg({ kind: "info", text: "ไม่มีรายการที่ถูกแก้ไข" });
      return;
    }
    if (!(await confirm(`บันทึก ${updates.length} รายการ — ต้นทุน Sheet ใหม่ขึ้นไปยังฐานข้อมูล?`))) return;
    setMsg(null);
    start(async () => {
      const res = await adminBulkUpdateForwarderCostSheet({ updates });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      const { updated, failed, errors } = res.data!;
      if (failed > 0) {
        setMsg({
          kind: "err",
          text: `บันทึกบางส่วน: สำเร็จ ${updated} · ล้มเหลว ${failed} (${errors.slice(0, 3).map((e) => `#${e.fid}: ${e.error}`).join(" · ")})`,
        });
      } else {
        setMsg({ kind: "ok", text: `บันทึกสำเร็จ ${updated} รายการ` });
        setEdits(new Map());
        setCsvSummary(null);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary-500" />
              ปรับต้นทุนตู้สินค้า
              <span className="font-mono text-primary-600">{fCabinetNumber}</span>
            </h2>
            <p className="mt-1 text-xs text-muted">
              โกดัง <span className="font-semibold">{warehouseLabel}</span> · กรอกเองหรืออัปโหลด CSV
              จากชีตของผู้ขนส่ง · {rows.length.toLocaleString()} รายการ
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <Stat label="ต้นทุน PCS ปัจจุบัน" value={totalCurrent} />
            <Stat label="Sheet เดิม" value={totalSheetCurrent} />
            <Stat
              label="Sheet ใหม่"
              value={totalSheetNew}
              hint={totalSheetDiff !== 0
                ? `${totalSheetDiff > 0 ? "+" : ""}${totalSheetDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : undefined}
              hintTone={totalSheetDiff > 0 ? "green" : totalSheetDiff < 0 ? "red" : "muted"}
            />
          </div>
        </div>
      </section>

      {/* Action bar */}
      <section className="rounded-2xl border border-border bg-surface-alt/40 p-3 lg:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-alt disabled:opacity-50"
              title="อัปโหลด CSV จากชีตของผู้ขนส่ง (คอลัมน์: tracking_chn, cost_sheet)"
            >
              <Upload className="h-3.5 w-3.5" />
              อัปโหลด CSV
            </button>
            {changedCount > 0 && (
              <button
                type="button"
                onClick={resetAll}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิกการแก้ไข ({changedCount})
              </button>
            )}
            <span className="text-xs text-muted inline-flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              CSV header: <code className="font-mono">tracking_chn,cost_sheet</code>
            </span>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={pending || changedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {pending ? "กำลังบันทึก…" : `บันทึกทั้งหมด${changedCount > 0 ? ` (${changedCount})` : ""}`}
          </button>
        </div>

        {/* Status row */}
        {msg && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              msg.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                : msg.kind === "err"
                  ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
                  : "border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
            }`}
          >
            <div className="flex items-start gap-2">
              {msg.kind === "ok" && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
              {msg.kind === "err" && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
              {msg.kind === "info" && <Info className="h-4 w-4 mt-0.5 shrink-0" />}
              <span className="whitespace-pre-wrap">{msg.text}</span>
            </div>
          </div>
        )}
        {csvSummary && csvSummary.warnings.length > 0 && (
          <details className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            <summary className="cursor-pointer hover:underline">
              คำเตือนจาก CSV ({csvSummary.warnings.length})
            </summary>
            <ul className="mt-1 ml-5 list-disc space-y-0.5">
              {csvSummary.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </details>
        )}
      </section>

      {/* Editable table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-alt/60 text-muted">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">รหัสพัสดุ / PR ID</th>
                <th className="px-3 py-2 font-medium text-right">CBM · kg</th>
                <th className="px-3 py-2 font-medium text-right">ต้นทุน PCS</th>
                <th className="px-3 py-2 font-medium text-right">Sheet เดิม</th>
                <th className="px-3 py-2 font-medium text-right">Sheet ใหม่</th>
                <th className="px-3 py-2 font-medium text-right">ผลต่าง</th>
                <th className="px-3 py-2 font-medium text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r) => {
                const diff = r.newCost - r.fcosttotalpricesheet;
                return (
                  <tr key={r.id} className={`border-t border-border ${r.changed ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-mono text-foreground">{r.ftrackingchn ?? "—"}</div>
                      <div className="text-[10px] text-muted">{r.fidorco ?? ""} · {r.userid}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">
                      <div>{r.fvolume?.toLocaleString(undefined, { maximumFractionDigits: 5 }) ?? "0"}</div>
                      <div className="text-[10px] text-muted">{r.fweight?.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? "0"} kg</div>
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums text-muted">
                      {r.fcosttotalprice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">
                      {r.fcosttotalpricesheet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.editStr}
                        onChange={(e) => setRowEdit(r.id, e.target.value)}
                        disabled={pending}
                        className={`w-28 rounded border px-2 py-1 text-right tabular-nums text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                          r.changed
                            ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 font-semibold"
                            : "border-border bg-white dark:bg-surface"
                        }`}
                      />
                    </td>
                    <td className={`px-3 py-2 align-top text-right tabular-nums ${
                      diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-muted"
                    }`}>
                      {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      {r.changed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">
                          แก้ไข
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt text-muted px-2 py-0.5 text-[10px]">
                          เดิม
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {decorated.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-muted">
                    ไม่พบรายการในตู้นี้
                  </td>
                </tr>
              )}
            </tbody>
            {decorated.length > 0 && (
              <tfoot className="bg-surface-alt/60 text-xs font-semibold">
                <tr className="border-t border-border">
                  <td className="px-3 py-2" colSpan={2}>รวม {decorated.length.toLocaleString()} รายการ</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalCurrent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalSheetCurrent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalSheetNew.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${
                    totalSheetDiff > 0 ? "text-green-600" : totalSheetDiff < 0 ? "text-red-600" : "text-muted"
                  }`}>
                    {totalSheetDiff === 0 ? "—" : `${totalSheetDiff > 0 ? "+" : ""}${totalSheetDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td className="px-3 py-2 text-center text-muted">
                    {changedCount > 0 ? `${changedCount} แก้ไข` : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small piece
// ─────────────────────────────────────────────────────────────────────

function Stat({
  label, value, hint, hintTone,
}: {
  label:    string;
  value:    number;
  hint?:    string;
  hintTone?: "green" | "red" | "muted";
}) {
  const toneClass =
    hintTone === "green" ? "text-green-600" :
    hintTone === "red"   ? "text-red-600"   : "text-muted";
  return (
    <div className="rounded-md border border-border bg-white dark:bg-surface px-3 py-2 min-w-32">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">
        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      {hint && <div className={`mt-0.5 text-[10px] tabular-nums ${toneClass}`}>{hint}</div>}
    </div>
  );
}

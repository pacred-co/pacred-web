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
import { Upload, Save, AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Cloud, Lock } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { Link } from "@/i18n/navigation";
import {
  adminBulkUpdateForwarderCostSheet,
  adminApplyContainerCostFromSheet,
} from "@/actions/admin/report-cnt-cost-update";
// V-D2 — canonical product-type labels (extended 1-5 incl. ควบคุมพิเศษ).
import { RATE_PRODUCT_LABEL_EXT } from "@/lib/warehouse/rate-dimensions";
import type { DetailRow } from "./container-detail-client";

// ─────────────────────────────────────────────────────────────────────
// Sheet parcel shape (mirror of lib adapter SheetParcel — kept local so
// this client file doesn't import a "server-only" module).
// ─────────────────────────────────────────────────────────────────────

export type SheetParcelView = {
  cabinetNumber: string;
  trackingChn: string;
  userId: string | null;
  amount: number;
  weight: number;
  volume: number;
  priceOther: number;
  costTotalPrice: number;
  productType: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export type CostUpdateViewProps = {
  fCabinetNumber: string;
  warehouseLabel: string;
  rows: DetailRow[];
  /** แสง's Google Sheet parcels for this container (LANE A). */
  sheetParcels?: SheetParcelView[];
  sheetSource?: "cache" | "live" | null;
  sheetUnavailable?: { reason: string; message?: string } | null;
  cabinetIsPaid?: boolean;
  paidCntId?: number | null;
};

const PRODUCT_TYPE_LABEL: Record<string, string> = RATE_PRODUCT_LABEL_EXT;

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

export function CostUpdateView({
  fCabinetNumber,
  warehouseLabel,
  rows,
  sheetParcels = [],
  sheetSource = null,
  sheetUnavailable = null,
  cabinetIsPaid = false,
  paidCntId = null,
}: CostUpdateViewProps) {
  // Two sub-modes: "sheet" = the legacy faithful Google-Sheet diff
  // (default — LANE A); "manual" = the Pacred-native inline/CSV editor.
  const hasSheet = sheetParcels.length > 0;
  const [mode, setMode] = useState<"sheet" | "manual">(hasSheet ? "sheet" : "manual");

  return (
    <div className="space-y-4">
      {/* Sub-mode tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        <SubTab active={mode === "sheet"} onClick={() => setMode("sheet")} icon={<Cloud className="h-3.5 w-3.5" />}>
          เทียบกับ Google Sheet (แสง)
          {hasSheet && (
            <span className="ml-1.5 rounded-full bg-primary-100 text-primary-700 px-1.5 text-[10px] font-semibold">
              {sheetParcels.length}
            </span>
          )}
        </SubTab>
        <SubTab active={mode === "manual"} onClick={() => setMode("manual")} icon={<Upload className="h-3.5 w-3.5" />}>
          กรอกเอง / อัปโหลด CSV
        </SubTab>
      </div>

      {mode === "sheet" ? (
        <SheetDiffMode
          fCabinetNumber={fCabinetNumber}
          rows={rows}
          sheetParcels={sheetParcels}
          sheetSource={sheetSource}
          sheetUnavailable={sheetUnavailable}
          cabinetIsPaid={cabinetIsPaid}
          paidCntId={paidCntId}
        />
      ) : (
        <ManualCostEditor fCabinetNumber={fCabinetNumber} warehouseLabel={warehouseLabel} rows={rows} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-tab
// ─────────────────────────────────────────────────────────────────────

function SubTab({
  active, onClick, icon, children,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 ${
        active ? "border-primary-500 text-primary-700" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SheetDiffMode — LANE A faithful port of report-cnt.php?action=cost-update
// (the 16-column Sheet-vs-PCS compare + "อัปเดตต้นทุนตามชีส" submit that
// writes the LIVE cost `fcosttotalprice`).
// ─────────────────────────────────────────────────────────────────────

type DiffRow = {
  tracking: string;
  fid: number | null;          // matched PCS forwarder row id (null = no match)
  userId: string | null;
  // Sheet side
  sAmount: number; sWeight: number; sVolume: number; sOther: number; sCost: number; sProductType: string | null;
  // PCS side (null when unmatched)
  pAmount: number | null; pWeight: number | null; pVolume: number | null;
  pOther: number | null; pCost: number | null; pProductType: string | null;
};

function SheetDiffMode({
  fCabinetNumber, rows, sheetParcels, sheetSource, sheetUnavailable, cabinetIsPaid, paidCntId,
}: {
  fCabinetNumber: string;
  rows: DetailRow[];
  sheetParcels: SheetParcelView[];
  sheetSource: "cache" | "live" | null;
  sheetUnavailable: { reason: string; message?: string } | null;
  cabinetIsPaid: boolean;
  paidCntId: number | null;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const router = useRouter();

  // Build a PCS index by tracking (uppercased). Each tracking maps to ONE
  // forwarder row (legacy uses the first match; per-container trackings are
  // effectively unique). We aggregate PCS "other" the same way legacy does:
  // priceCrate + ftransportpricechnthb + priceother.
  const pcsByTracking = useMemo(() => {
    const m = new Map<string, DetailRow>();
    for (const r of rows) {
      if (!r.ftrackingchn) continue;
      const key = r.ftrackingchn.toUpperCase();
      if (!m.has(key)) m.set(key, r);
    }
    return m;
  }, [rows]);

  const diffRows: DiffRow[] = useMemo(() => {
    return sheetParcels.map((p) => {
      const pcs = pcsByTracking.get(p.trackingChn.toUpperCase()) ?? null;
      const pOther = pcs ? pcs.pricecrate + pcs.ftransportpricechnthb + pcs.priceother : null;
      return {
        tracking: p.trackingChn,
        fid: pcs ? pcs.id : null,
        userId: p.userId ?? pcs?.userid ?? null,
        sAmount: p.amount, sWeight: p.weight, sVolume: p.volume, sOther: p.priceOther, sCost: p.costTotalPrice,
        sProductType: p.productType,
        pAmount: pcs ? (pcs.famount ?? 0) : null,
        pWeight: pcs ? (pcs.fweight ?? 0) : null,
        pVolume: pcs ? (pcs.fvolume ?? 0) : null,
        pOther,
        pCost: pcs ? pcs.fcosttotalprice : null,
        pProductType: pcs?.fproductstype ?? null,
      };
    });
  }, [sheetParcels, pcsByTracking]);

  // Only rows that matched a PCS forwarder row CAN be applied.
  const applicable = diffRows.filter((d) => d.fid != null);
  const matchedCount = applicable.length;
  const unmatchedCount = diffRows.length - matchedCount;

  // Totals (Sheet vs PCS) — matched rows only, mirrors legacy รวม row.
  const totals = useMemo(() => {
    let sAmount = 0, sWeight = 0, sVolume = 0, sOther = 0, sCost = 0;
    let pAmount = 0, pWeight = 0, pVolume = 0, pOther = 0, pCost = 0;
    for (const d of applicable) {
      sAmount += d.sAmount; sWeight += d.sWeight; sVolume += d.sVolume; sOther += d.sOther; sCost += d.sCost;
      pAmount += d.pAmount ?? 0; pWeight += d.pWeight ?? 0; pVolume += d.pVolume ?? 0;
      pOther += d.pOther ?? 0; pCost += d.pCost ?? 0;
    }
    return { sAmount, sWeight, sVolume, sOther, sCost, pAmount, pWeight, pVolume, pOther, pCost };
  }, [applicable]);

  async function apply() {
    const updates = applicable.map((d) => ({ fid: d.fid as number, sheetCost: d.sCost }));
    if (updates.length === 0) {
      setMsg({ kind: "info", text: "ไม่มีรายการที่จับคู่กับ PCS ได้ — ตรวจสอบชื่อตู้/แทร็คกิ้ง" });
      return;
    }
    if (cabinetIsPaid) {
      setMsg({ kind: "err", text: "ตู้นี้จ่ายค่าตู้แล้ว — แก้ไขต้นทุนจากบิลจ่ายเงินตู้" });
      return;
    }
    const ok = await confirm(
      `อัปเดตต้นทุนตามชีสของแสง ${updates.length} รายการ?\n\n` +
      `ราคานี้จะถูกเขียนทับ "ต้นทุนจริง" (fCostTotalPrice) ของแต่ละพัสดุ และมีผลต่อกำไรทันที.`,
    );
    if (!ok) return;
    setMsg(null);
    start(async () => {
      const res = await adminApplyContainerCostFromSheet({ fCabinetNumber, updates });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error });
        return;
      }
      const { updated, failed, errors } = res.data!;
      if (failed > 0) {
        setMsg({
          kind: "err",
          text: `อัปเดตบางส่วน: สำเร็จ ${updated} · ล้มเหลว ${failed} (${errors.slice(0, 3).map((e) => `#${e.fid}: ${e.error}`).join(" · ")})`,
        });
      } else {
        setMsg({ kind: "ok", text: `อัปเดตต้นทุนสำเร็จ ${updated} รายการ` });
      }
      router.refresh();
    });
  }

  if (sheetUnavailable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-6 text-sm text-amber-800 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">ยังเชื่อมต่อ Google Sheet ไม่ได้</p>
            <p className="mt-1 text-xs">
              {sheetUnavailable.reason === "not_configured"
                ? "ยังไม่ได้ตั้งค่า service account ของ Google Sheets — แจ้งทีมพัฒนา/ก๊อต. ระหว่างนี้ใช้แท็บ “กรอกเอง / อัปโหลด CSV” เพื่อปรับต้นทุนได้."
                : `อ่านชีตไม่สำเร็จ (${sheetUnavailable.reason}${sheetUnavailable.message ? `: ${sheetUnavailable.message}` : ""}).`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary-500" />
              เทียบต้นทุนตู้กับชีตของแสง
              <span className="font-mono text-primary-600">{fCabinetNumber}</span>
            </h2>
            <p className="mt-1 text-xs text-muted">
              โหลดจาก Google Sheet (ชีต <span className="font-mono">main</span>) ·{" "}
              {sheetSource === "cache" ? "จาก cache (ซิงค์อัตโนมัติ)" : "อ่านสดจากชีต"} ·{" "}
              จับคู่ PCS: <span className="font-medium text-green-600">{matchedCount}</span>
              {unmatchedCount > 0 && (
                <> · ไม่พบใน PCS: <span className="font-medium text-amber-600">{unmatchedCount}</span></>
              )}
            </p>
          </div>
          <a
            href="https://docs.google.com/spreadsheets/d/13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA/edit#gid=0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:underline"
          >
            ไปยังไฟล์ Google Sheet ↗
          </a>
        </div>
      </section>

      {/* Apply bar */}
      <section className="rounded-2xl border border-border bg-surface-alt/40 p-3 lg:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            แถวสีแดง = ค่าใน PCS ไม่ตรงกับชีต · ปุ่มจะเขียนต้นทุนจากชีตทับ <span className="font-mono">ราคาตามคิว PCS</span>
          </p>
          {cabinetIsPaid ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              <Lock className="h-3.5 w-3.5" />
              ตู้จ่ายเงินแล้ว — แก้ที่{" "}
              {paidCntId ? (
                <Link href={`/admin/cnt-hs/${paidCntId}`} className="underline">
                  บิลจ่ายเงินตู้
                </Link>
              ) : (
                "บิลจ่ายเงินตู้"
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={pending || matchedCount === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {pending ? "กำลังอัปเดต…" : `อัปเดตต้นทุนตามชีส (${matchedCount})`}
            </button>
          )}
        </div>
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
      </section>

      {/* 16-column diff table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-surface-alt/60 text-muted">
              <tr className="text-center">
                <th className="px-2 py-2 font-medium text-left">รหัสพัสดุ</th>
                <th className="px-2 py-2 font-medium text-left">รหัสย่อย</th>
                <th className="px-2 py-2 font-medium">จำนวน Sheet</th>
                <th className="px-2 py-2 font-medium">จำนวน PCS</th>
                <th className="px-2 py-2 font-medium">น้ำหนัก Sheet</th>
                <th className="px-2 py-2 font-medium">น้ำหนัก PCS</th>
                <th className="px-2 py-2 font-medium">คิว Sheet</th>
                <th className="px-2 py-2 font-medium">คิว PCS</th>
                <th className="px-2 py-2 font-medium">ประเภท Sheet</th>
                <th className="px-2 py-2 font-medium">ประเภท PCS</th>
                <th className="px-2 py-2 font-medium">ค่าบริการ Sheet</th>
                <th className="px-2 py-2 font-medium">ค่าบริการ PCS</th>
                <th className="px-2 py-2 font-medium">ราคาตามคิว Sheet</th>
                <th className="px-2 py-2 font-medium">ราคาตามคิว PCS</th>
                <th className="px-2 py-2 font-medium">เรทคิว Sheet</th>
                <th className="px-2 py-2 font-medium text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {diffRows.map((d) => {
                const unmatched = d.fid == null;
                const mAmount = d.pAmount != null && Math.abs(d.sAmount - d.pAmount) > 0.005;
                const mWeight = d.pWeight != null && round1(d.sWeight) !== round1(d.pWeight);
                const mVolume = d.pVolume != null && round5(d.sVolume) !== round5(d.pVolume);
                const mOther  = d.pOther  != null && round2(d.sOther)  !== round2(d.pOther);
                const mCost   = d.pCost   != null && round2(d.sCost)   !== round2(d.pCost);
                const mType   = d.pProductType != null && d.sProductType != null && d.sProductType !== d.pProductType;
                const rate = d.sVolume > 0 ? d.sCost / d.sVolume : 0;
                return (
                  <tr key={`${d.tracking}-${d.fid ?? "x"}`} className={`border-t border-border ${unmatched ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}>
                    <td className="px-2 py-1.5 text-left font-mono">
                      {d.fid != null ? (
                        <Link href={`/admin/forwarders/${d.fid}`} className="text-primary-600 hover:underline">
                          {d.tracking}
                        </Link>
                      ) : (
                        d.tracking
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-left text-muted">{d.userId ?? "—"}</td>
                    <Cell value={d.sAmount} dp={0} />
                    <Cell value={d.pAmount} dp={0} bad={mAmount} dash={unmatched} />
                    <Cell value={d.sWeight} dp={1} />
                    <Cell value={d.pWeight} dp={1} bad={mWeight} dash={unmatched} />
                    <Cell value={d.sVolume} dp={5} />
                    <Cell value={d.pVolume} dp={5} bad={mVolume} dash={unmatched} />
                    <td className="px-2 py-1.5 text-center">{d.sProductType ? PRODUCT_TYPE_LABEL[d.sProductType] ?? d.sProductType : "—"}</td>
                    <td className={`px-2 py-1.5 text-center ${mType ? "bg-red-500 text-white" : ""}`}>
                      {unmatched ? "—" : d.pProductType ? PRODUCT_TYPE_LABEL[d.pProductType] ?? d.pProductType : "—"}
                    </td>
                    <Cell value={d.sOther} dp={2} />
                    <Cell value={d.pOther} dp={2} bad={mOther} dash={unmatched} />
                    <Cell value={d.sCost} dp={2} strong />
                    <Cell value={d.pCost} dp={2} bad={mCost} dash={unmatched} />
                    <Cell value={rate} dp={2} />
                    <td className="px-2 py-1.5 text-center">
                      {unmatched ? (
                        <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-medium">
                          ไม่พบใน PCS
                        </span>
                      ) : mCost ? (
                        <span className="inline-flex rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-medium">
                          ต้นทุนต่าง
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 text-[10px] font-medium">
                          ตรง
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {diffRows.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-3 py-12 text-center text-muted">
                    ไม่พบรายการของตู้นี้ในชีต — อาจเปลี่ยนชื่อตู้เป็น copy หรือยังไม่ลงข้อมูลในชีต
                  </td>
                </tr>
              )}
            </tbody>
            {applicable.length > 0 && (
              <tfoot className="bg-surface-alt/60 text-xs font-semibold">
                <tr className="border-t border-border text-right">
                  <td className="px-2 py-2 text-left" colSpan={2}>รวม (จับคู่ได้ {matchedCount})</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.sAmount, 0)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.pAmount, 0)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.sWeight, 1)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.pWeight, 1)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.sVolume, 5)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.pVolume, 5)}</td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.sOther, 2)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.pOther, 2)}</td>
                  <td className="px-2 py-2 tabular-nums text-primary-700">{fmt(totals.sCost, 2)}</td>
                  <td className="px-2 py-2 tabular-nums">{fmt(totals.pCost, 2)}</td>
                  <td className="px-2 py-2" />
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ── tiny numeric helpers ───────────────────────────────────────────
function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }
function round5(n: number) { return Math.round(n * 100000) / 100000; }
function fmt(n: number, dp: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function Cell({
  value, dp, bad, dash, strong,
}: {
  value: number | null; dp: number; bad?: boolean; dash?: boolean; strong?: boolean;
}) {
  return (
    <td className={`px-2 py-1.5 text-right tabular-nums ${bad ? "bg-red-500 text-white" : ""} ${strong ? "font-semibold text-primary-700" : ""}`}>
      {dash || value == null ? "—" : fmt(value, dp)}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ManualCostEditor — the existing Pacred-native inline/CSV editor.
// (Unchanged behaviour; now lives behind the "กรอกเอง / อัปโหลด CSV" tab.)
// ─────────────────────────────────────────────────────────────────────

function ManualCostEditor({ fCabinetNumber, warehouseLabel, rows }: { fCabinetNumber: string; warehouseLabel: string; rows: DetailRow[] }) {
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

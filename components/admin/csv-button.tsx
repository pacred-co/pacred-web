"use client";

import { useState } from "react";
import { escapeCsvCell } from "@/lib/csv/escape";

export type CsvRow = Record<string, string | number | null | undefined>;
export type CsvCol = { key: string; label: string };

/** Build the CSV text (BOM-prefixed, formula-injection-safe) and trigger a download. */
function buildAndDownload(rows: CsvRow[], cols: CsvCol[], filename: string) {
  const header = cols.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) => cols.map((c) => escapeCsvCell(row[c.key])).join(","));
  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CsvButton({
  rows,
  cols,
  filename,
  fetchAll,
}: {
  /** The currently-displayed (paginated) rows. */
  rows: CsvRow[];
  cols: CsvCol[];
  filename: string;
  /**
   * Optional server action that returns the ENTIRE filtered result set
   * (across all pages, capped). When provided, a second "ทั้งหมด" button
   * appears. The action is responsible for re-running the page's filtered
   * query unpaginated AND writing the admin_export_log audit row.
   */
  fetchAll?: () => Promise<{ rows: CsvRow[]; truncated?: boolean }>;
}) {
  const [loading, setLoading] = useState(false);

  function downloadPage() {
    buildAndDownload(rows, cols, filename);
  }

  async function downloadAll() {
    if (!fetchAll || loading) return;
    setLoading(true);
    try {
      const res = await fetchAll();
      const allRows = res?.rows ?? [];
      if (allRows.length === 0) {
        alert("ไม่พบข้อมูลสำหรับ export");
        return;
      }
      // Distinguish the full export filename from the page export.
      const allName = filename.replace(/\.csv$/i, "") + `-ทั้งหมด-${allRows.length}แถว.csv`;
      buildAndDownload(allRows, cols, allName);
      if (res?.truncated) {
        alert(
          `ข้อมูลมีจำนวนมาก — export ได้สูงสุด ${allRows.length.toLocaleString("th-TH")} แถว (ถูกจำกัดไว้). ` +
            `กรุณากรอง (filter) ให้แคบลงเพื่อให้ได้ครบทุกแถว.`,
        );
      }
    } catch (e) {
      console.error("[CsvButton] export-all failed:", e);
      alert("Export ทั้งหมดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  const btnCls =
    "flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-40 shrink-0";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={downloadPage} disabled={rows.length === 0} className={btnCls}>
        ⬇ CSV {fetchAll ? "หน้านี้" : ""} ({rows.length} แถว)
      </button>
      {fetchAll && (
        <button onClick={downloadAll} disabled={loading} className={btnCls} title="export ทุกแถวตาม filter ที่เลือก (ไม่จำกัดเฉพาะหน้านี้)">
          {loading ? "⏳ กำลังโหลด…" : "⬇ CSV ทั้งหมด"}
        </button>
      )}
    </div>
  );
}

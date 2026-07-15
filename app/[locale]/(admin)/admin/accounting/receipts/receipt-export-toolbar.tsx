"use client";

/**
 * Copy / CSV / Excel / Print export toolbar — legacy-faithful.
 *
 * The legacy PCS `receipt-forwarder-item/home.php` renders DataTables Buttons
 * (Copy · CSV · Excel · Print) above the table, restyled to
 * `btn btn-sm btn-outline-info btn-rounded` (blue-outline rounded pills).
 * This is the Pacred equivalent — same four actions, same blue-outline-rounded
 * look, over the SAME filtered dataset.
 *
 * Data source: when `fetchAll` is provided (every tab except the "recent"
 * landing snapshot) the four export actions pull the ENTIRE filtered result set
 * (all pages, audited server-side) — matching legacy, whose client-side table
 * held every row. Without `fetchAll` they fall back to the current page rows.
 *
 * CSV/Copy/Excel are formula-injection-safe (escapeCsvCell). Print opens a
 * clean table-only window (like DataTables' print view) so the admin chrome
 * isn't printed.
 */

import { useState } from "react";
import { Copy, FileDown, FileSpreadsheet, Printer, Check } from "lucide-react";
import { escapeCsvCell } from "@/lib/csv/escape";
import type { CsvCol, CsvRow } from "@/components/admin/csv-button";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsv(rows: CsvRow[], cols: CsvCol[]): string {
  const header = cols.map((c) => escapeCsvCell(c.label)).join(",");
  const lines = rows.map((row) => cols.map((c) => escapeCsvCell(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}

function toTsv(rows: CsvRow[], cols: CsvCol[]): string {
  const esc = (v: string | number | null | undefined) =>
    String(v ?? "").replace(/[\t]/g, " ").replace(/\r?\n/g, " ");
  const header = cols.map((c) => esc(c.label)).join("\t");
  const lines = rows.map((row) => cols.map((c) => esc(row[c.key])).join("\t"));
  return [header, ...lines].join("\n");
}

function escHtml(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Minimal HTML table Excel opens natively (Copy-of-DataTables excelHtml5). */
function toXlsHtml(rows: CsvRow[], cols: CsvCol[]): string {
  const thead = `<tr>${cols.map((c) => `<th>${escHtml(c.label)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((row) => `<tr>${cols.map((c) => `<td>${escHtml(row[c.key])}</td>`).join("")}</tr>`)
    .join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">${thead}${tbody}</table></body></html>`;
}

/** Clean table-only print view (like DataTables print) in a new window. */
function toPrintHtml(rows: CsvRow[], cols: CsvCol[], title: string): string {
  const thead = `<tr>${cols.map((c) => `<th>${escHtml(c.label)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((row) => `<tr>${cols.map((c) => `<td>${escHtml(row[c.key])}</td>`).join("")}</tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
    <style>
      body{font-family:'Prompt',sans-serif;margin:16px;color:#0f172a}
      h1{font-size:16px;margin:0 0 12px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}
      thead th{background:#f97316;color:#fff}
    </style></head><body><h1>${escHtml(title)}</h1><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></body></html>`;
}

export function ReceiptExportToolbar({
  rows,
  cols,
  filename,
  title,
  fetchAll,
}: {
  /** The currently-displayed (paginated) rows. */
  rows: CsvRow[];
  cols: CsvCol[];
  filename: string;
  /** Human title for the Print view header. */
  title: string;
  /** Server action returning the ENTIRE filtered set (all pages, audited). */
  fetchAll?: () => Promise<{ rows: CsvRow[]; truncated?: boolean }>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function resolveRows(): Promise<{ rows: CsvRow[]; truncated?: boolean }> {
    if (fetchAll) {
      const res = await fetchAll();
      const all = res?.rows ?? [];
      return { rows: all.length ? all : rows, truncated: res?.truncated };
    }
    return { rows };
  }

  async function run(kind: string, fn: (data: CsvRow[]) => void | Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      const { rows: data, truncated } = await resolveRows();
      if (data.length === 0) {
        alert("ไม่พบข้อมูลสำหรับ export");
        return;
      }
      await fn(data);
      if (truncated) {
        alert(
          `ข้อมูลมีจำนวนมาก — ทำได้สูงสุด ${data.length.toLocaleString("th-TH")} แถว (ถูกจำกัดไว้). ` +
            `กรุณากรอง (filter) ให้แคบลงเพื่อให้ได้ครบทุกแถว.`,
        );
      }
    } catch (e) {
      console.error(`[ReceiptExportToolbar] ${kind} failed:`, e);
      alert("ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  const doCopy = () =>
    run("copy", async (data) => {
      await navigator.clipboard.writeText(toTsv(data, cols));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  const doCsv = () =>
    run("csv", (data) =>
      triggerDownload(
        new Blob(["﻿" + toCsv(data, cols)], { type: "text/csv;charset=utf-8;" }),
        filename,
      ),
    );

  const doExcel = () =>
    run("xls", (data) =>
      triggerDownload(
        new Blob([toXlsHtml(data, cols)], { type: "application/vnd.ms-excel" }),
        filename.replace(/\.csv$/i, "") + ".xls",
      ),
    );

  const doPrint = () =>
    run("print", (data) => {
      const w = window.open("", "_blank", "width=1000,height=720");
      if (!w) {
        alert("กรุณาอนุญาต popup เพื่อพิมพ์");
        return;
      }
      w.document.write(toPrintHtml(data, cols, title));
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 350);
    });

  // Legacy `btn btn-sm btn-outline-info btn-rounded` = blue-outline rounded pill.
  const pill =
    "inline-flex items-center gap-1.5 rounded-full border border-sky-400 bg-white px-3 py-1.5 text-sm font-medium text-sky-600 hover:bg-sky-50 disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={doCopy} disabled={!!busy} className={pill}>
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
        {copied ? "คัดลอกแล้ว" : "Copy"}
      </button>
      <button type="button" onClick={doCsv} disabled={!!busy} className={pill}>
        <FileDown className="size-4" />
        {busy === "csv" ? "…" : "CSV"}
      </button>
      <button type="button" onClick={doExcel} disabled={!!busy} className={pill}>
        <FileSpreadsheet className="size-4" />
        {busy === "xls" ? "…" : "Excel"}
      </button>
      <button type="button" onClick={doPrint} disabled={!!busy} className={pill}>
        <Printer className="size-4" />
        {busy === "print" ? "…" : "Print"}
      </button>
      {fetchAll && (
        <span className="text-[11px] text-slate-400">
          (export = ทุกแถวตามตัวกรอง ไม่ใช่แค่หน้านี้)
        </span>
      )}
    </div>
  );
}

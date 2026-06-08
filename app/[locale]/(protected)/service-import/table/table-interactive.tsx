"use client";

/**
 * Client interactivity for the ฝากนำเข้าสินค้าแบบตาราง (forwarder-table) view —
 * the row-select checkboxes + select-all + live "ยอดชำระรวม" pay-bar + the
 * Copy/CSV/Excel/Print export toolbar. A faithful rebuild of the legacy
 * `forwarder-table.php` DataTables block (the jQuery checkbox column,
 * `calPrice.php` live total, `#select` pay handler, and the
 * `dom:'lBfrtip' buttons:['copy','csv','excel','print']` export bar) into
 * Tailwind + React (ปอน 2026-06-08: "เอาให้เหมือน 1:1 แต่ใช้ tailwind").
 *
 * Architecture: a Context provider wraps the server-rendered <table> (passed
 * as children) AND the pay-bar, so the server table stays server-rendered
 * (SEO/perf) while the per-row <RowCheckbox> + the <TablePayBar> hydrate as
 * client consumers. The per-row net price + pay-modal row shape are computed
 * server-side and handed down as plain-serializable props (no function props
 * cross the RSC boundary except ForwarderPayModal's own Server Actions).
 *
 * Selection mirrors the legacy `initComplete` — all payable (fStatus=5) rows
 * start selected; the live total = Σ of selected rows' net price (we already
 * have each row's net, so no calPrice.php round-trip is needed).
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { escapeCsvCell } from "@/lib/csv/escape";
import { ForwarderPayModal } from "../forwarder-pay-modal";
import { type ForwarderRow as PayModalRow } from "../forwarder-row-view";

// ── Selection context ────────────────────────────────────────────────
type SelectionContext = {
  payableIds: number[];
  selected: Set<number>;
  isPayable: (id: number) => boolean;
  toggle: (id: number, next: boolean) => void;
  toggleAll: (next: boolean) => void;
  allChecked: boolean;
  count: number;
  total: number;
  selectedRows: PayModalRow[];
};

const Ctx = createContext<SelectionContext | null>(null);

export type PayablePayload = {
  /** Payable (fStatus=5) row ids — get a checkbox; start selected. */
  payable: { id: number; net: number }[];
  /** The pay-modal row shape for each payable id (PCSF/credit/WHT math). */
  payRows: PayModalRow[];
};

export function TableSelectionProvider({
  payable,
  payRows,
  children,
}: PayablePayload & { children: ReactNode }) {
  const payableIds = useMemo(() => payable.map((p) => p.id), [payable]);
  const payableSet = useMemo(() => new Set(payableIds), [payableIds]);
  const netById = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of payable) m.set(p.id, p.net);
    return m;
  }, [payable]);
  const payRowById = useMemo(() => {
    const m = new Map<number, PayModalRow>();
    for (const r of payRows) m.set(r.id, r);
    return m;
  }, [payRows]);

  // legacy initComplete — every payable row starts selected.
  const [selected, setSelected] = useState<Set<number>>(() => new Set(payableIds));

  const toggle = (id: number, next: boolean) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  };
  const toggleAll = (next: boolean) => {
    setSelected(next ? new Set(payableIds) : new Set<number>());
  };

  const total = useMemo(() => {
    let sum = 0;
    for (const id of selected) sum += netById.get(id) ?? 0;
    return sum;
  }, [selected, netById]);

  const selectedRows = useMemo(() => {
    const out: PayModalRow[] = [];
    for (const id of selected) {
      const r = payRowById.get(id);
      if (r) out.push(r);
    }
    return out;
  }, [selected, payRowById]);

  const value: SelectionContext = {
    payableIds,
    selected,
    isPayable: (id) => payableSet.has(id),
    toggle,
    toggleAll,
    allChecked: payableIds.length > 0 && selected.size === payableIds.length,
    count: selected.size,
    total,
    selectedRows,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── Per-row checkbox — renders only for payable rows (legacy `.d-none2`
//    hides the checkbox on non-status-5 rows). ────────────────────────
export function RowCheckbox({ id }: { id: number }) {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.isPayable(id)) return null;
  return (
    <input
      type="checkbox"
      className="dt-checkboxes w-4 h-4 rounded border-border accent-red-600 cursor-pointer align-middle"
      checked={ctx.selected.has(id)}
      onChange={(e) => ctx.toggle(id, e.target.checked)}
      aria-label={`select-${id}`}
    />
  );
}

// ── Header select-all (legacy DataTables column-0 select-all). ─────────
export function SelectAllHeaderCheckbox() {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.payableIds.length === 0) return null;
  return (
    <input
      type="checkbox"
      className="check-all w-4 h-4 rounded border-white/60 accent-white cursor-pointer align-middle"
      checked={ctx.allChecked}
      onChange={(e) => ctx.toggleAll(e.target.checked)}
      aria-label="select-all"
    />
  );
}

// PHP number_format($n, 2).
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Bottom pay-bar — legacy `.b-pay` fixed bar (forwarder-table.php
//    L1064-1083): เลือกทั้งหมด · จำนวนรายการ · ยอดชำระรวม · ชำระเงิน. ──
export function TablePayBar({ isJuristic }: { isJuristic: boolean }) {
  const ctx = useContext(Ctx);
  const t = useTranslations("serviceImportTable");
  const [open, setOpen] = useState(false);
  const hasPayable = !!ctx && ctx.payableIds.length > 0;

  // NOTE: the `body.has-import-paybar` flag (lifts the LINE bubble above the
  // pay-bar so it never steals the "ชำระเงิน" tap) is owned by <CollapseSidebar>
  // on this route — no duplicate management here.

  if (!ctx || !hasPayable) return null;

  const disabled = ctx.count === 0;

  return (
    <>
      <div className="fixed left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[90%] md:max-w-3xl z-[55] bottom-[92px] md:bottom-0 bg-white/95 dark:bg-surface/95 backdrop-blur-md border border-border md:border-x md:border-t rounded-2xl md:rounded-t-2xl md:rounded-b-none shadow-lg overflow-hidden">
        <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-6 md:py-3">
          <label className="flex flex-col items-center gap-0.5 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              className="check-all w-4 h-4 rounded border-border accent-red-600 cursor-pointer"
              checked={ctx.allChecked}
              onChange={(e) => ctx.toggleAll(e.target.checked)}
            />
            <span className="text-[10px] md:text-[11px] text-muted whitespace-nowrap leading-none">
              {t("selectAll")}
            </span>
          </label>

          <div className="flex-1 min-w-0 leading-tight">
            <div className="text-[10px] md:text-xs text-muted">
              {t("payBarCountPrefix")}{" "}
              <span className="countPay font-bold text-foreground notranslate">{ctx.count}</span>{" "}
              {t("payBarCountSuffix")}
            </div>
            <div className="font-bold text-foreground text-xs md:text-sm">
              {t("summaryTotal")}{" "}
              <span className="notranslate price-all text-red-600 text-base md:text-lg">
                {numberFormat2(ctx.total)}
              </span>{" "}
              <span className="text-[10px] md:text-xs text-muted font-normal">{t("bahtUnit")}</span>
            </div>
          </div>

          <button
            type="button"
            id="select"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className={`shrink-0 inline-flex items-center justify-center gap-1 rounded-full px-4 md:px-6 py-2 md:py-2.5 text-sm md:text-base font-bold transition-all ${
              disabled
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-md shadow-red-600/30 animate__animated animate__infinite animate__headShake"
            }`}
          >
            {t("payButton")}
          </button>
        </div>
      </div>

      <ForwarderPayModal
        key={Array.from(ctx.selected).sort((a, b) => a - b).join(",")}
        rows={ctx.selectedRows}
        isJuristic={isJuristic}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ── Export toolbar — legacy DataTables `buttons:['copy','csv','excel','print']`
//    (forwarder-table.php). Operates over the FULL filtered set passed in. ──
export type ExportCol = { key: string; label: string };
export type ExportRow = Record<string, string | number | null | undefined>;

export function ExportToolbar({
  rows,
  cols,
  filename,
}: {
  rows: ExportRow[];
  cols: ExportCol[];
  filename: string;
}) {
  const t = useTranslations("serviceImportTable");
  const [copied, setCopied] = useState(false);
  const empty = rows.length === 0;

  const cell = (row: ExportRow, key: string) => String(row[key] ?? "");

  function doCopy() {
    const header = cols.map((c) => c.label).join("\t");
    const body = rows.map((r) => cols.map((c) => cell(r, c.key)).join("\t")).join("\n");
    const tsv = header + "\n" + body;
    void navigator.clipboard?.writeText(tsv).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  function doCsv() {
    const header = cols.map((c) => escapeCsvCell(c.label)).join(",");
    const lines = rows.map((r) => cols.map((c) => escapeCsvCell(r[c.key])).join(","));
    const csv = [header, ...lines].join("\r\n");
    downloadBlob("﻿" + csv, "text/csv;charset=utf-8;", filename);
  }

  function doExcel() {
    // Excel opens an HTML-table .xls; UTF-8 meta keeps Thai intact.
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const head = `<tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr>`;
    const body = rows
      .map((r) => `<tr>${cols.map((c) => `<td>${esc(cell(r, c.key))}</td>`).join("")}</tr>`)
      .join("");
    const html =
      `<html><head><meta charset="utf-8"></head><body>` +
      `<table border="1">${head}${body}</table></body></html>`;
    downloadBlob(html, "application/vnd.ms-excel;charset=utf-8;", filename.replace(/\.csv$/i, ".xls"));
  }

  function doPrint() {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const head = `<tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr>`;
    const body = rows
      .map((r) => `<tr>${cols.map((c) => `<td>${esc(cell(r, c.key))}</td>`).join("")}</tr>`)
      .join("");
    const w = window.open("", "_blank", "width=1024,height=720");
    if (!w) return;
    w.document.write(
      `<html><head><meta charset="utf-8"><title>${esc(filename)}</title>` +
        `<style>` +
        `body{font-family:Prompt,Arial,sans-serif;padding:16px;}` +
        `table{border-collapse:collapse;width:100%;font-size:12px;}` +
        `th,td{border:1px solid #999;padding:4px 6px;text-align:left;}` +
        `thead th{background:#ce35a1;color:#fff;}` +
        `</style></head><body>` +
        `<table>${head}${body}</table>` +
        `<script>window.onload=function(){window.print();}<\/script>` +
        `</body></html>`,
    );
    w.document.close();
  }

  // Legacy DataTables export buttons = Bootstrap `btn btn-sm btn-outline-primary`
  // (outline #007bff, fills blue on hover). Compact (ปอน 2026-06-08 "ลดขนาด").
  const btn =
    "inline-flex items-center gap-1 rounded border border-[#007bff] bg-white px-2 py-0.5 text-[11px] font-medium text-[#007bff] hover:bg-[#007bff] hover:text-white disabled:opacity-40 shrink-0 transition-colors";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={doCopy} disabled={empty} className={btn}>
        {copied ? t("copied") : t("exportCopy")}
      </button>
      <button type="button" onClick={doCsv} disabled={empty} className={btn}>
        {t("exportCsv")} ({rows.length})
      </button>
      <button type="button" onClick={doExcel} disabled={empty} className={btn}>
        {t("exportExcel")}
      </button>
      <button type="button" onClick={doPrint} disabled={empty} className={btn}>
        {t("exportPrint")}
      </button>
    </div>
  );
}

// ── Inline quick-filter search — legacy DataTables `f` filter ("ค้นหา:" /
//    "Search:" box, forwarder-table.php `dom:'lBfrtip'`). Live-filters the
//    rendered #myTable rows client-side by substring match (skips the
//    `.no-sort` summary row). Pure DOM (the table is server-rendered). ──
export function TableQuickSearch() {
  const t = useTranslations("serviceImportTable");
  const [value, setValue] = useState("");

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value.trim().toLowerCase();
    setValue(e.target.value);
    const rows = document.querySelectorAll<HTMLTableRowElement>("#myTable tbody tr");
    rows.forEach((tr) => {
      if (tr.classList.contains("no-sort")) return; // keep the summary row
      const text = (tr.textContent || "").toLowerCase();
      tr.style.display = !q || text.includes(q) ? "" : "none";
    });
  }

  return (
    <label className="flex items-center gap-1 text-foreground">
      <span className="font-medium whitespace-nowrap">{t("dtSearchLabel")}</span>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={t("dtSearchPlaceholder")}
        // No `dataTables_filter` class — forwarder-table.css forces
        // `.dataTables_filter{width:50%}` which would clamp the box; Tailwind
        // controls the width instead (w-32 mobile · w-80 desktop).
        className="w-32 md:w-80 rounded-md border border-border bg-white dark:bg-surface px-2.5 py-1 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
      />
    </label>
  );
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

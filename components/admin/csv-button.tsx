"use client";

export type CsvRow = Record<string, string | number | null | undefined>;

export function CsvButton({
  rows,
  cols,
  filename,
}: {
  rows: CsvRow[];
  cols: { key: string; label: string }[];
  filename: string;
}) {
  function download() {
    const header = cols.map((c) => `"${c.label}"`).join(",");
    const lines = rows.map((row) =>
      cols
        .map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
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

  return (
    <button
      onClick={download}
      disabled={rows.length === 0}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-40 shrink-0"
    >
      ⬇ CSV ({rows.length} แถว)
    </button>
  );
}

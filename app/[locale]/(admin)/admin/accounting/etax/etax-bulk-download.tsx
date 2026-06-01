"use client";

import { useState } from "react";

/**
 * Client island: trigger sequential XML downloads for ALL visible
 * invoices. Browser handles each blob+anchor download with a small
 * delay between (so the user's download manager + browser don't
 * race-cancel the queue).
 *
 * No external ZIP library — RD-INET workflow expects one XML per file
 * anyway (staff signs each with RD-Sign desktop tool, then bulk-uploads
 * the signed XMLs).
 */

export function EtaxBulkDownload({
  xmls,
}: {
  xmls: Array<{ serialNo: string; xml: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function downloadAll() {
    if (busy || xmls.length === 0) return;
    setBusy(true);
    setProgress({ done: 0, total: xmls.length });

    for (let i = 0; i < xmls.length; i += 1) {
      const { serialNo, xml } = xmls[i];
      const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `pacred-etax-${serialNo}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setProgress({ done: i + 1, total: xmls.length });
      // 250ms between downloads — empirically enough for Chrome/Firefox to
      // queue each without dropping or showing the multi-file prompt.
      await new Promise((res) => setTimeout(res, 250));
    }

    setBusy(false);
    setTimeout(() => setProgress(null), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={downloadAll}
        disabled={busy || xmls.length === 0}
        className="flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-4 py-2 text-sm text-primary-800 hover:bg-primary-100 disabled:opacity-40"
      >
        {busy
          ? `⏳ กำลังโหลด ${progress?.done ?? 0}/${progress?.total ?? 0}…`
          : `⬇ ดาวน์โหลด XML ทั้งหมด (${xmls.length} ไฟล์)`}
      </button>
      {progress && !busy && (
        <span className="text-xs text-emerald-600">✓ เสร็จ {progress.done}/{progress.total} ไฟล์</span>
      )}
    </div>
  );
}

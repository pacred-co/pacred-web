"use client";

/**
 * Client island for per-row e-Tax XML download. The XML string is built
 * server-side in `actions/admin/etax-export.ts:buildEtaxXml` and passed in
 * as a prop; this island just triggers the blob download.
 *
 * Why a tiny client component: the parent /admin/accounting/etax/page.tsx
 * stays a Server Component (auth + data + XML pre-build), and we only ship
 * the download click handler to the browser. Mirrors the CsvButton pattern.
 */

export function EtaxRowDownloads({
  invoiceId,
  serialNo,
  xml,
}: {
  invoiceId: number;
  serialNo:  string;
  xml:       string;
}) {
  function downloadXml() {
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `pacred-etax-${serialNo}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex justify-end gap-1.5">
      <button
        type="button"
        onClick={downloadXml}
        title={`Download Code 86 XML preview · invoice #${invoiceId}`}
        className="rounded border border-border bg-white px-2 py-1 text-[10px] font-medium hover:bg-surface-alt"
      >
        ⬇ XML
      </button>
    </div>
  );
}

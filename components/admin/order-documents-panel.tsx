import type { OrderDocuments, OrderDoc } from "@/lib/admin/order-documents";

/**
 * B3 (2026-06-22) — read-only "เอกสารของออเดอร์" panel. Renders the tax-docs /
 * receipts / ใบขน issued for one order in a single self-explaining card (§0g).
 * Pure presentational — issuance is dormant today so it shows a clean
 * "ยังไม่มีเอกสาร" state until the owner enables tax-doc issuance.
 */

const DOC_LABEL: Record<OrderDoc["kind"], string> = {
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบเสร็จรับเงิน",
  customs: "ใบขนสินค้า",
};
const DOC_CHIP: Record<OrderDoc["kind"], string> = {
  tax_invoice: "bg-blue-100 text-blue-700 border border-blue-300",
  receipt: "bg-emerald-100 text-emerald-700 border border-emerald-300",
  customs: "bg-amber-100 text-amber-800 border border-amber-300",
};

function fmtAmt(n: number | null): string {
  return n == null ? "—" : `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
}

export function OrderDocumentsPanel({ docs }: { docs: OrderDocuments }) {
  const all = [...docs.taxInvoices, ...docs.receipts, ...docs.customs];
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-2">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        🧾 เอกสารของออเดอร์ ({all.length})
      </h2>
      {all.length === 0 ? (
        <p className="text-xs text-muted">ยังไม่มีเอกสารภาษี/ใบเสร็จ/ใบขน ออกให้ออเดอร์นี้</p>
      ) : (
        <ul className="space-y-1.5">
          {all.map((d, i) => (
            <li
              key={`${d.kind}-${d.no}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-alt/30 px-3 py-2"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium whitespace-nowrap ${DOC_CHIP[d.kind]}`}>
                  {DOC_LABEL[d.kind]}
                </span>
                <span className="font-mono text-sm font-semibold text-foreground truncate">{d.no}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-foreground">{fmtAmt(d.amount)}</div>
                {d.dateIso ? (
                  <div className="text-[11px] text-muted">{new Date(d.dateIso).toLocaleDateString("th-TH")}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

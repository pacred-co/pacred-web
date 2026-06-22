import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * B3 (accounting Phase B · 2026-06-22) — per-order document registry (READ-ONLY).
 *
 * Gathers the tax/accounting documents issued for ONE order into a single
 * "เอกสารของออเดอร์" view, joining the EXISTING stores by their clean keys
 * (no new table · no migration · no mutation). Columns verified live (the
 * userimage/42703 lesson) before querying:
 *   - shop order  → tb_shop_tax_invoice.hno = <hno>  → its receipt via receipt_id
 *   - forwarder   → customs_declarations.cargo_forwarder_id = <id>
 *                 + tb_forwarder_tax_invoice via its receipt_id → tb_receipt.refid
 *
 * Issuance ships DORMANT today (all 4 stores 0-row on prod) → this returns
 * empty arrays = a clean "ยังไม่มีเอกสาร" state, and lights up automatically
 * once the owner enables tax-doc issuance. Never throws — soft-fails to [].
 */

export type OrderDoc = {
  kind: "tax_invoice" | "receipt" | "customs";
  no: string;            // serial_no / rid / declaration_no
  status: string | null;
  amount: number | null; // headline figure (net_payable / ramount / declared value)
  dateIso: string | null;
  pdfPath: string | null;
};

export type OrderDocuments = { taxInvoices: OrderDoc[]; receipts: OrderDoc[]; customs: OrderDoc[] };

const EMPTY: OrderDocuments = { taxInvoices: [], receipts: [], customs: [] };

/** Documents issued for a ฝากสั่งซื้อ (shop order) — keyed by hno. */
export async function getShopOrderDocuments(hno: string): Promise<OrderDocuments> {
  const h = (hno ?? "").trim();
  if (!h) return EMPTY;
  const admin = createAdminClient();

  const { data: tis, error: tiErr } = await admin
    .from("tb_shop_tax_invoice")
    .select("serial_no, status, net_payable, issued_at, pdf_storage_path, receipt_id")
    .eq("hno", h)
    .order("issued_at", { ascending: false, nullsFirst: false });
  if (tiErr) {
    console.error("[order-documents shop tax-invoice] failed", { hno: h, code: tiErr.code, message: tiErr.message });
  }
  const rows = (tis ?? []) as Array<{
    serial_no: string | null; status: string | null; net_payable: number | string | null;
    issued_at: string | null; pdf_storage_path: string | null; receipt_id: number | null;
  }>;
  const taxInvoices: OrderDoc[] = rows.map((r) => ({
    kind: "tax_invoice", no: r.serial_no ?? "—", status: r.status,
    amount: r.net_payable != null ? Number(r.net_payable) : null,
    dateIso: r.issued_at, pdfPath: r.pdf_storage_path,
  }));

  // Receipts linked via the tax-invoice's receipt_id (clean FK · no refid guess).
  const receiptIds = Array.from(new Set(rows.map((r) => r.receipt_id).filter((x): x is number => !!x)));
  let receipts: OrderDoc[] = [];
  if (receiptIds.length > 0) {
    const { data: rcs, error: rcErr } = await admin
      .from("tb_receipt")
      .select("rid, rstatus, ramount, rdate, statusprint")
      .in("id", receiptIds);
    if (rcErr) {
      console.error("[order-documents shop receipt] failed", { hno: h, code: rcErr.code, message: rcErr.message });
    }
    receipts = ((rcs ?? []) as Array<{ rid: string | null; rstatus: string | null; ramount: number | string | null; rdate: string | null }>)
      .map((r) => ({
        kind: "receipt", no: r.rid ?? "—", status: r.rstatus,
        amount: r.ramount != null ? Number(r.ramount) : null, dateIso: r.rdate, pdfPath: null,
      }));
  }
  return { taxInvoices, receipts, customs: [] };
}

/** Documents issued for a ฝากนำเข้า (forwarder/cargo) — keyed by forwarder id. */
export async function getForwarderDocuments(forwarderId: number | string): Promise<OrderDocuments> {
  const fid = Number(forwarderId);
  if (!Number.isFinite(fid) || fid <= 0) return EMPTY;
  const admin = createAdminClient();

  // ใบขนรวม (customs declaration) — direct key cargo_forwarder_id.
  const { data: cds, error: cdErr } = await admin
    .from("customs_declarations")
    .select("declaration_no, status, total_declared_value_thb, declared_at")
    .eq("cargo_forwarder_id", fid)
    .order("declared_at", { ascending: false, nullsFirst: false });
  if (cdErr) {
    console.error("[order-documents forwarder customs] failed", { fid, code: cdErr.code, message: cdErr.message });
  }
  const customs: OrderDoc[] = ((cds ?? []) as Array<{ declaration_no: string | null; status: string | null; total_declared_value_thb: number | string | null; declared_at: string | null }>)
    .map((r) => ({
      kind: "customs", no: r.declaration_no ?? "—", status: r.status,
      amount: r.total_declared_value_thb != null ? Number(r.total_declared_value_thb) : null,
      dateIso: r.declared_at, pdfPath: null,
    }));

  return { taxInvoices: [], receipts: [], customs };
}

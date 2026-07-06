import "server-only";

/**
 * Billing-run (ใบวางบิล) document loader (FAITHFUL PORT) — the SINGLE source of
 * the bill's data-load + WHT math. Used by BOTH:
 *   - admin   `/admin/billing-run/[id]/print`  (gated · staff reprint · via getInvoiceDetail)
 *   - public  `/b/[token]`                       (login-free · QR opens)
 *
 * Modelled on `lib/receipt/load-receipt-document.ts`: this file does NO auth
 * (the CALLER gates) and returns `null` when the invoice id isn't found. It uses
 * `createAdminClient()` (service role; bypasses RLS) so the public page can
 * render a customer's own bill without a session — the unguessable `/b/{token}`
 * capability link (see `lib/receipt/receipt-token.ts` → signBillToken /
 * verifyBillToken) is the gate.
 *
 * The header/items shape + every total / WHT / net figure is byte-identical to
 * the prior inline `getInvoiceDetail` computation (that action now delegates
 * here), so the admin print page and the public page render the SAME bill.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { computeBillWht } from "@/lib/billing/wht";

// ── Public document shape (moved here from actions/admin/billing-run.ts so the
//    public loader + the admin action share ONE definition) ─────────────────

export type BillingRunInvoiceDetail = {
  header: {
    id: number;
    doc_no: string;
    userid: string;
    buyer_name: string;
    buyer_tax_id: string;
    buyer_address: string;
    buyer_branch: string;
    is_juristic: boolean;
    date_issued: string;
    date_due: string;
    subtotal_thb: number;
    delivery_chn_thb: number;
    delivery_th_thb: number;
    other_thb: number;
    discount_thb: number;
    /** ค่าส่งเหมาๆ (PCSF flat ฿100/shipment) — its own line, included in total_thb. */
    mao_fee_thb: number;
    total_thb: number;
    status: "issued" | "paid" | "cancelled";
    note_for_customer: string;
    paid_at: string | null;
    paid_by: string | null;
    payment_method: string | null;
    payment_reference: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;
    cancel_reason: string | null;
    issued_at: string;
    issued_by: string;
    created_at: string;
    updated_at: string;
    is_overdue: boolean;
    /** WHT 1% — หัก ณ ที่จ่าย. Computed from is_juristic + total_thb. */
    wht_rate: number;
    wht_amount: number;
    /** ยอดชำระสุทธิ = total_thb − wht_amount (what the customer remits). */
    net_payable: number;
    /** สลิปแนบ (ภูม 2026-06-29) — เซลแนบ → บัญชีตรวจ+ตัดจ่าย. */
    slip_path: string | null;
    /** null=ยังไม่แนบ · pending=รอบัญชีตรวจ · verified=ยืนยันแล้ว · rejected=ถูกปฏิเสธ */
    slip_status: string | null;
    slip_uploaded_by: string | null;
    slip_uploaded_at: string | null;
    /** ภูม 2026-06-30 — สลิปหลายรูป (array path) + ตรวจรอบ 1 (2-round เหมือน wallet). */
    slip_paths: string[];
    slip_reviewed_at: string | null;
  };
  items: Array<{
    id: number;
    forwarder_id: number;
    amount_thb: number;
    /** Hydrated forwarder data — joined post-fetch (no embed FK). The cabinet /
     *  transport / rate_basis / rate mirror the ใบเสร็จ's 11-col cargo table
     *  (lib/receipt/load-receipt-document.ts) so the Peak ใบวางบิล renders the
     *  SAME columns. */
    forwarder: {
      ftrackingchn: string;
      famount: number | null;
      fweight: number | null;
      fvolume: number | null;
      fdate: string | null;
      fstatus: string | null;
      cabinet: string;
      /** "EK" (รถ) | "SEA" (เรือ) | "" */
      transport: string;
      /** "KG" | "CBM" | "" */
      rate_basis: string;
      rate: number;
    } | null;
  }>;
};

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ใบวางบิลค้างชำระ = status 'issued' และเลยกำหนดชำระแล้ว. */
export function isBillOverdue(dateDue: string, status: string): boolean {
  if (status !== "issued") return false;
  return dateDue < isoToday();
}

// ── Raw DB row shapes ────────────────────────────────────────

type HeaderRaw = {
  id: number;
  doc_no: string;
  userid: string;
  buyer_name: string;
  buyer_tax_id: string;
  buyer_address: string;
  buyer_branch: string;
  is_juristic: boolean;
  date_issued: string;
  date_due: string;
  subtotal_thb: number | string;
  delivery_chn_thb: number | string;
  delivery_th_thb: number | string;
  other_thb: number | string;
  discount_thb: number | string;
  mao_fee_thb: number | string | null;
  total_thb: number | string;
  status: "issued" | "paid" | "cancelled";
  note_for_customer: string;
  paid_at: string | null;
  paid_by: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  issued_at: string;
  issued_by: string;
  created_at: string;
  updated_at: string;
  slip_path: string | null;
  slip_status: string | null;
  slip_uploaded_by: string | null;
  slip_uploaded_at: string | null;
  slip_paths: unknown;
  slip_reviewed_at: string | null;
  slip_reviewed_by: string | null;
};

type ItemRaw = { id: number; forwarder_id: number; amount_thb: number | string };

type FwdHydRow = {
  id: number;
  ftrackingchn: string | null;
  famount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fdate: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftransporttype: string | null;
  frefprice: string | null;
  frefrate: number | string | null;
};

/**
 * Load one billing-run invoice (header + items + hydrated forwarder fields).
 *
 * Returns `null` when the id isn't found; THROWS on a real DB error (so the
 * caller renders an error boundary, never a silent 404 for a row that exists —
 * §0c). NO auth — the caller (admin gate, or the public token gate) is the gate.
 */
export async function loadBillingRunDocument(
  invoiceId: number,
): Promise<BillingRunInvoiceDetail | null> {
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return null;

  const admin = createAdminClient();

  const { data: hdrRaw, error: hdrErr } = await admin
    .from("tb_forwarder_invoice")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle<HeaderRaw>();
  if (hdrErr) {
    console.error("[loadBillingRunDocument tb_forwarder_invoice header] failed", {
      code: hdrErr.code, message: hdrErr.message,
    });
    throw new Error(hdrErr.message);
  }
  if (!hdrRaw) return null;

  const { data: itemRaw, error: itemErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("id, forwarder_id, amount_thb")
    .eq("invoice_id", invoiceId)
    .order("id", { ascending: true });
  if (itemErr) {
    console.error("[loadBillingRunDocument tb_forwarder_invoice_item] failed", {
      code: itemErr.code, message: itemErr.message,
    });
    throw new Error(itemErr.message);
  }
  const items = (itemRaw ?? []) as ItemRaw[];

  // Hydrate forwarder fields per line item
  const fids = items.map((i) => i.forwarder_id);
  const fwdByID = new Map<number, FwdHydRow>();
  if (fids.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, famount, fweight, fvolume, fdate, fstatus, fcabinetnumber, ftransporttype, frefprice, frefrate")
      .in("id", fids);
    if (fwdErr) {
      console.error("[loadBillingRunDocument tb_forwarder hydrate] failed", {
        code: fwdErr.code, message: fwdErr.message,
      });
    }
    for (const f of ((fwdRaw ?? []) as FwdHydRow[])) {
      fwdByID.set(f.id, f);
    }
  }

  return {
    header: {
      id:                 hdrRaw.id,
      doc_no:             hdrRaw.doc_no,
      userid:             hdrRaw.userid,
      buyer_name:         hdrRaw.buyer_name,
      buyer_tax_id:       hdrRaw.buyer_tax_id,
      buyer_address:      hdrRaw.buyer_address,
      buyer_branch:       hdrRaw.buyer_branch,
      is_juristic:        hdrRaw.is_juristic,
      date_issued:        hdrRaw.date_issued,
      date_due:           hdrRaw.date_due,
      subtotal_thb:       Number(hdrRaw.subtotal_thb),
      delivery_chn_thb:   Number(hdrRaw.delivery_chn_thb),
      delivery_th_thb:    Number(hdrRaw.delivery_th_thb),
      other_thb:          Number(hdrRaw.other_thb),
      discount_thb:       Number(hdrRaw.discount_thb),
      mao_fee_thb:        Number(hdrRaw.mao_fee_thb ?? 0),
      total_thb:          Number(hdrRaw.total_thb),
      status:             hdrRaw.status,
      note_for_customer:  hdrRaw.note_for_customer,
      paid_at:            hdrRaw.paid_at,
      paid_by:            hdrRaw.paid_by,
      payment_method:     hdrRaw.payment_method,
      payment_reference:  hdrRaw.payment_reference,
      cancelled_at:       hdrRaw.cancelled_at,
      cancelled_by:       hdrRaw.cancelled_by,
      cancel_reason:      hdrRaw.cancel_reason,
      issued_at:          hdrRaw.issued_at,
      issued_by:          hdrRaw.issued_by,
      created_at:         hdrRaw.created_at,
      updated_at:         hdrRaw.updated_at,
      slip_path:          hdrRaw.slip_path,
      slip_status:        hdrRaw.slip_status,
      slip_uploaded_by:   hdrRaw.slip_uploaded_by,
      slip_uploaded_at:   hdrRaw.slip_uploaded_at,
      slip_paths:         Array.isArray(hdrRaw.slip_paths)
                            ? hdrRaw.slip_paths.filter((p): p is string => typeof p === "string")
                            : [],
      slip_reviewed_at:   hdrRaw.slip_reviewed_at,
      is_overdue:         isBillOverdue(hdrRaw.date_due, hdrRaw.status),
      ...computeBillWht(hdrRaw.is_juristic, Number(hdrRaw.total_thb)),
    },
    items: items.map((i) => {
      const f = fwdByID.get(i.forwarder_id) ?? null;
      return {
        id:           i.id,
        forwarder_id: i.forwarder_id,
        amount_thb:   Number(i.amount_thb),
        forwarder:    f
          ? {
              ftrackingchn: f.ftrackingchn ?? "",
              famount:      f.famount != null ? Number(f.famount) : null,
              fweight:      f.fweight != null ? Number(f.fweight) : null,
              fvolume:      f.fvolume != null ? Number(f.fvolume) : null,
              fdate:        f.fdate,
              fstatus:      f.fstatus,
              cabinet:      f.fcabinetnumber ?? "",
              // ขนส่ง: '1'=EK(รถ) · '2'=SEA(เรือ) — mirrors load-receipt-document.ts
              transport:    f.ftransporttype === "2" ? "SEA" : f.ftransporttype === "1" ? "EK" : "",
              // คิดราคาตาม: '1'=KG · '2'=CBM
              rate_basis:   f.frefprice === "2" ? "CBM" : f.frefprice === "1" ? "KG" : "",
              rate:         f.frefrate != null ? Number(f.frefrate) : 0,
            }
          : null,
      };
    }),
  };
}

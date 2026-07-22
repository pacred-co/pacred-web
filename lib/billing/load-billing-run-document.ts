import "server-only";
import { totalCbmOf } from "@/lib/forwarder/quantities";

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
import { isCreditRow } from "@/lib/forwarder/credit-advance-guard";
import { sumNamedFees, type ForwarderFeeFields } from "@/lib/forwarder/fee-breakdown";

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
    /** DISPLAY-only ship-to snapshot (mig 0247) — distinct from buyer_address (tax identity). */
    delivery_address: string;
    buyer_branch: string;
    is_juristic: boolean;
    date_issued: string;
    date_due: string;
    /**
     * ลูกค้ารายนี้ซื้อแบบ **เครดิต** ไหม (มีแถวไหนในบิลที่ `fcredit` ถูกตั้ง · SOT `isCreditRow`).
     * 🔴 owner 2026-07-17 (ด่วน · บิล 122/PR134): "ลูกค้าเป็นเงินสดหรือเครดิต **ลิงค์กันด้วยสิ**
     * ลูกค้าเครดิตเรามีนิดเดียวเอง" → ใช้ตัดสินว่าโชว์ "ครบกำหนดชำระ" บนบิลไหม
     * (เงินสด = **ไม่โชว์เลย**). `date_due` ยังอยู่ใน DB เหมือนเดิม = display gate ล้วน ไม่แตะเงิน
     */
    is_credit: boolean;
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
    /**
     * Σ of the per-ROW named fees folded inside `subtotal_thb` (owner 2026-07-07):
     * so the paper can present each fee under its CORRECT label instead of one
     * opaque "ค่าขนส่งรายการ" that hides ค่าขนส่งในไทย (LOGISTICS). These are the
     * per-line forwarder fees; the admin-typed header adjustments (delivery_*_thb
     * / other_thb / discount_thb) are ADDED to the matching line at render.
     * amount_thb / subtotal_thb / total_thb storage is UNCHANGED (mig 0138). */
    sum_thai_shipping: number; // Σ ค่าขนส่งในไทย (ftransportprice · LOGISTICS)
    sum_chn_plus:      number; // Σ ค่าขนส่งจีน+  (ftransportpricechnthb)
    sum_crate:         number; // Σ ค่าตีลัง      (pricecrate)
    sum_update:        number; // Σ ค่าอัปเดต     (fpriceupdate)
    sum_other_rows:    number; // Σ ค่าอื่นๆ      (fshippingservice + priceother)
    sum_discount_rows: number; // Σ ส่วนลด        (fdiscount)
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
      /** ค่าขนส่งสินค้า (freight · ftotalprice) — the FREIGHT-only amount so the
       *  row's Amount reconciles with Rate × Kg (owner 2026-07-07). The stored
       *  amount_thb (GROSS incl ค่าขนส่งในไทย etc.) is unchanged; this is display. */
      freight: number;
      /** ประเภทสินค้า = รหัสภายใน g/m/a/s (owner 2026-07-18 · ลูกค้าเห็นแค่รหัสใต้ "Type"). */
      product_type: string;
      /** มิติกล่อง ก×ส×ย (ซม.) — 0 เมื่อยังไม่วัด (owner 2026-07-18 · ใบวางบิล cols). */
      fwidth: number;
      fheight: number;
      flength: number;
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

/**
 * ประเภทสินค้า → รหัสภายในตัวเดียว (owner 2026-07-18 · ใบวางบิล col "Type"):
 *   g = ทั่วไป · m = มอก. · a = อย. · s = พิเศษ
 * ลูกค้าเห็นแค่รหัส (ไม่บอกความหมาย) → ใช้เป็น "Type" แทนป้ายไทยเต็ม.
 * (fproductstype legacy: 1=ทั่วไป 2=มอก. 3=อย. 4=พิเศษ · function.php L640-650.)
 */
function productTypeCode(t: string | null): string {
  switch ((t ?? "").trim()) {
    case "1": return "g"; // ทั่วไป
    case "2": return "m"; // มอก.
    case "3": return "a"; // อย.
    case "4": return "s"; // พิเศษ
    default:  return "";
  }
}

// ── Raw DB row shapes ────────────────────────────────────────

type HeaderRaw = {
  id: number;
  doc_no: string;
  userid: string;
  buyer_name: string;
  buyer_tax_id: string;
  buyer_address: string;
  delivery_address: string | null;
  buyer_branch: string;
  is_juristic: boolean;
  date_issued: string;
  date_due: string;
  /**
   * ลูกค้ารายนี้ซื้อแบบ **เครดิต** ไหม (= มีแถวไหนในบิลที่ `fcredit` ถูกตั้ง · SOT `isCreditRow`).
   * 🔴 owner 2026-07-17 (ด่วน): "ลูกค้าเป็นเงินสดหรือเครดิต **ลิงค์กันด้วยสิ** · เครดิตเรามีนิดเดียวเอง"
   * ใช้ตัดสินว่าจะโชว์ "ครบกำหนดชำระ" บนบิลไหม — **เงินสด = ไม่โชว์เลย** (ดู billing-run-paper.tsx)
   * `date_due` ยังเก็บใน DB เหมือนเดิม (ไม่ลบข้อมูล · ไม่แตะเงิน) — นี่คือ **display gate** ล้วน
   */
  is_credit: boolean;
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
  famountcount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fdate: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  ftransporttype: string | null;
  frefprice: string | null;
  frefrate: number | string | null;
  /** '1' = ติดเครดิต (ยังไม่จ่าย · มีเทอม) · '0'/'' = เงินสด — SOT `isCreditRow` */
  fcredit: string | null;
  // ประเภทสินค้า + มิติกล่อง (owner 2026-07-18 · ใบวางบิล cols)
  fproductstype: string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  // Price columns — for the named-fee split (owner 2026-07-07). calcForwarderGross
  // reads exactly these; the paper re-presents the SAME gross with correct labels.
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
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
      .select(
        "id, ftrackingchn, famount, famountcount, fweight, fvolume, fdate, fstatus, fcabinetnumber, " +
          "ftransporttype, frefprice, frefrate, fcredit, fproductstype, fwidth, flength, fheight, " +
          // price columns for the named-fee split (owner 2026-07-07)
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error("[loadBillingRunDocument tb_forwarder hydrate] failed", {
        code: fwdErr.code, message: fwdErr.message,
      });
    }
    for (const f of ((fwdRaw ?? []) as unknown as FwdHydRow[])) {
      fwdByID.set(f.id, f);
    }
  }

  // Σ the per-row named fees folded inside subtotal_thb (owner 2026-07-07) — over
  // the LINE forwarders, so the paper can split "ค่าขนส่งรายการ" into its correctly
  // labeled parts (ค่าขนส่งในไทย · LOGISTICS distinct from ค่าส่งเหมาๆ · SERVICE). The
  // paper's ค่าขนส่งสินค้า line is the balancing remainder so Σ lines == subtotal even
  // when a per-line amount_thb override drifts from calcForwarderGross.
  const lineFwdFees: ForwarderFeeFields[] = items
    .map((i) => fwdByID.get(i.forwarder_id))
    .filter((f): f is FwdHydRow => !!f);
  const named = sumNamedFees(lineFwdFees);

  return {
    header: {
      id:                 hdrRaw.id,
      doc_no:             hdrRaw.doc_no,
      userid:             hdrRaw.userid,
      buyer_name:         hdrRaw.buyer_name,
      buyer_tax_id:       hdrRaw.buyer_tax_id,
      buyer_address:      hdrRaw.buyer_address,
      delivery_address:   hdrRaw.delivery_address ?? "",
      buyer_branch:       hdrRaw.buyer_branch,
      is_juristic:        hdrRaw.is_juristic,
      date_issued:        hdrRaw.date_issued,
      date_due:           hdrRaw.date_due,
      // 🔴 owner 2026-07-17 (ด่วน · บิล 122/PR134): "ลูกค้าเป็นเงินสดหรือเครดิต ลิงค์กันด้วยสิ".
      // เครดิต = มีแถวไหนในบิลที่ fcredit ถูกตั้ง (SOT isCreditRow · ไม่ใช่แค่ === '1' —
      // legacy เก็บ '0'/''/null ปนกัน). ไม่มีแถว hydrate มา → ถือว่า **เงินสด** (fail-safe:
      // เงินสดคือค่าปกติ · prod 2026-07-17 มีลูกค้าเครดิต 0 ราย · เดาว่าเครดิตแล้วโชว์วันครบกำหนด
      // = บอกลูกค้าว่า "ค่อยจ่ายก็ได้" = ชะลอเก็บเงินเอง อันตรายกว่า)
      is_credit:          [...fwdByID.values()].some((f) => isCreditRow(f.fcredit)),
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
      sum_thai_shipping:  named.thaiShipping,
      sum_chn_plus:       named.chnPlus,
      sum_crate:          named.crate,
      sum_update:         named.update,
      sum_other_rows:     named.other,
      sum_discount_rows:  named.discount,
      // Forward-only: a bill paid BEFORE the 2026-07-22 change keeps the old ≥ ฿1,000
      // gate (paidAt) so its printed/detail net still equals what was collected.
      ...computeBillWht(hdrRaw.is_juristic, Number(hdrRaw.total_thb), { paidAt: hdrRaw.paid_at }),
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
              fvolume:      f.fvolume != null ? totalCbmOf(f) : null, // row-TOTAL CBM (famountcount rule)
              fdate:        f.fdate,
              fstatus:      f.fstatus,
              cabinet:      f.fcabinetnumber ?? "",
              // ขนส่ง: '1'=EK(รถ) · '2'=SEA(เรือ) — mirrors load-receipt-document.ts
              transport:    f.ftransporttype === "2" ? "SEA" : f.ftransporttype === "1" ? "EK" : "",
              // คิดราคาตาม: '1'=KG · '2'=CBM
              rate_basis:   f.frefprice === "2" ? "CBM" : f.frefprice === "1" ? "KG" : "",
              rate:         f.frefrate != null ? Number(f.frefrate) : 0,
              // ค่าขนส่งสินค้า (freight-only) — the row Amount so Rate × Kg reconciles.
              freight:      f.ftotalprice != null ? Number(f.ftotalprice) : 0,
              // ประเภท (รหัส g/m/a/s) + มิติกล่อง ก×ส×ย (ซม.) — owner 2026-07-18 ใบวางบิล cols.
              product_type: productTypeCode(f.fproductstype),
              fwidth:       f.fwidth  != null ? Number(f.fwidth)  : 0,
              fheight:      f.fheight != null ? Number(f.fheight) : 0,
              flength:      f.flength != null ? Number(f.flength) : 0,
            }
          : null,
      };
    }),
  };
}

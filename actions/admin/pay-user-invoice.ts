"use server";
/**
 * pay-user-invoice.ts — ออก "ใบแจ้งหนี้ตัวจริง" จากหน้าชำระแทนลูกค้า (owner 2026-08-01)
 *
 * ราก (เคส PR187): หน้า pay-user โชว์ "ใบแจ้งหนี้" ที่เป็น **พรีวิว** (เลขที่ = ตัวอย่าง ·
 * ไม่บันทึกอะไร) → ลูกค้าโอนตามใบนั้น แล้วถ้ามีใครแก้ราคา/ขนาด/ขนส่งหลังจากนั้น
 * ยอดจริงขยับ → ตอนกดชำระแทน ยอดไม่ตรงกับที่ลูกค้าจ่าย (11,955.74 vs 12,309.14).
 *
 * FIX ที่ต้นทาง: ปุ่มนี้ mint ใบแจ้งหนี้ **ตัวจริง** ผ่าน `createBillingRunInvoice`
 * (เครื่องเดิม · atomic · เลข FRI จริง · กันบิลซ้ำ) → ทันทีที่ใบเกิด:
 *   1. ยอดถูกแช่บนใบ (ลูกค้าจ่ายตามเลขที่อ้างได้)
 *   2. **ด่านห้าม re-price แถวบนใบ live ทำงานอัตโนมัติ** (มีอยู่แล้วใน editor ทุกตัว)
 *      → ยอดจอ = ยอดใบ = ยอดที่เก็บ ตลอดชีวิตใบ
 *   3. ตอนลูกค้าจ่ายผ่านสลิป → cascade ปิดใบเป็น 'paid' เอง (close-covered-invoices)
 *
 * แถวที่ถูกวางบิลไปแล้ว = คืนเลขใบเดิมให้ลิงก์ต่อ (ไม่ mint ซ้ำ — ด่านเดิมกันอยู่).
 */
import { z } from "zod";
import { createBillingRunInvoice } from "@/actions/admin/billing-run";
import { createAdminClient } from "@/lib/supabase/admin";
import { earliestCreditDueDate } from "@/lib/credit/terms";

const inputSchema = z.object({
  userid: z.string().min(1),
  fids: z.array(z.number().int().positive()).min(1).max(500),
});

export type IssuePayUserInvoiceResult =
  | {
      ok: true;
      data: {
        invoiceId: number;
        docNo: string;
      };
    }
  | {
      ok: false;
      error: string;
      /** แถวที่มีใบ live อยู่แล้ว — ให้จอโชว์เลขใบเดิมเป็นลิงก์ */
      billedInvoices?: Array<{ forwarderId: number; docNo: string; invoiceId: number }>;
    };

/**
 * ออกใบแจ้งหนี้จริง 1 ใบครอบทุกรายการที่เลือก (1 การจ่าย = 1 บิล — กติกา owner
 * 2026-07-23). RBAC + ความถูกต้องทั้งหมดอยู่ใน createBillingRunInvoice
 * (super/accounting/ops/freight_*_doc · ตรวจ billable + ลูกค้าเดียว + กันบิลซ้ำ).
 */
export async function adminIssuePayUserInvoice(
  input: unknown,
): Promise<IssuePayUserInvoiceResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { userid, fids } = parsed.data;

  const dateIssued = new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();
  const { data: dueRows, error: dueErr } = await admin
    .from("tb_forwarder")
    .select("id, fcreditdate")
    .in("id", fids);
  if (dueErr) return { ok: false, error: `อ่านวันครบกำหนดไม่สำเร็จ: ${dueErr.message}` };
  const dateDue = earliestCreditDueDate(
    (dueRows ?? []).map((row) => row.fcreditdate as string | null),
  ) ?? dateIssued;

  const res = await createBillingRunInvoice({
    userid,
    forwarderIds: fids,
    dateIssued,
    dateDue,
    grantCreditOnIssue: false,
    deliveryChnThb: 0,
    deliveryThThb: 0,
    otherThb: 0,
    discountThb: 0,
    noteForCustomer: "ออกจากหน้าชำระเงินแทนลูกค้า — ยอดถูกล็อกตามใบนี้",
    // FAIL-CLOSED ทั้ง 3 ด่าน (ยังไม่วัดขนาด/ยังไม่กรอกค่าส่งไทย/ยังไม่อัพ packing) —
    // หน้านี้ไม่มี UI ack → แถวที่ติดด่านให้ server refuse พร้อมเหตุผลไทย แล้วไปออกที่
    // ฟอร์มวางบิลเต็ม (/admin/billing-run/add) ซึ่งมี confirm ครบ. ห้ามข้ามด่านเงียบๆ.
    allowUnmeasured: false,
    allowMissingThShip: false,
    allowUnreconciledPacking: false,
    overrides: {},
  });

  if (res.ok && res.data) {
    return { ok: true, data: { invoiceId: res.data.invoiceId, docNo: res.data.docNo } };
  }

  // แถวถูกวางบิลแล้ว → หาเลขใบเดิมมาให้จอลิงก์ (self-explaining §0g — ไม่จบที่ error ลอยๆ)
  const { data: existing, error: exErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("forwarder_id, invoice_id")
    .in("forwarder_id", fids);
  if (!exErr && (existing ?? []).length > 0) {
    const invIds = Array.from(new Set((existing ?? []).map((r) => r.invoice_id as number)));
    const { data: invs, error: invErr } = await admin
      .from("tb_forwarder_invoice")
      .select("id, doc_no, status")
      .in("id", invIds)
      .neq("status", "cancelled");
    if (!invErr) {
      const byId = new Map(
        ((invs ?? []) as Array<{ id: number; doc_no: string }>).map((i) => [i.id, i.doc_no]),
      );
      const billed = ((existing ?? []) as Array<{ forwarder_id: number; invoice_id: number }>)
        .filter((r) => byId.has(r.invoice_id))
        .map((r) => ({
          forwarderId: r.forwarder_id,
          invoiceId: r.invoice_id,
          docNo: byId.get(r.invoice_id)!,
        }));
      if (billed.length > 0) {
        return { ok: false, error: res.ok ? "unknown" : res.error, billedInvoices: billed };
      }
    }
  }
  return { ok: false, error: res.ok ? "unknown" : res.error };
}

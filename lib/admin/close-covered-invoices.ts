/**
 * close-covered-invoices.ts — ปิดใบแจ้งหนี้ FRI ที่ "การชำระเพิ่งครอบครบทั้งใบ"
 *
 * owner 2026-08-01 (เคส PR187): ใบแจ้งหนี้ที่ลูกค้าจ่ายผ่านช่องทาง wallet/สลิป
 * ไม่เคยถูกปิด — settle ฝั่ง wallet ไม่แตะ `tb_forwarder_invoice` เลย → ใบค้าง
 * 'issued' ตลอดกาล (ขึ้น "ค้างชำระ" ทั้งที่เงินเข้าแล้ว + บล็อกการวางบิลใหม่ผ่าน
 * ด่านกันบิลซ้ำ).
 *
 * กติกา: ปิดเฉพาะใบที่ **ทุกบรรทัดถูก settle ในรอบนี้/ก่อนหน้า** (fully covered) —
 * ใบที่ครอบกว้างกว่าชุดที่จ่าย = ปล่อยไว้ (ยังเก็บไม่ครบจริง). เป็นการ **ปิดเอกสาร
 * ตามการชำระที่เกิดขึ้นแล้ว** เท่านั้น — ไม่ทำ side-effect เงิน (cascade ฝั่ง wallet
 * settle แถว/เครดิต/ใบเสร็จ ไปแล้ว) ต่างจาก `markBillingRunPaid` ซึ่งเป็นทางกดมือ
 * ที่ทำครบวงจร.
 *
 * BEST-EFFORT เสมอ — ห้ามทำให้เส้นเงินล้ม (ผู้เรียกครอบ try/catch อีกชั้น).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClosedInvoice = { invoiceId: number; docNo: string };

/**
 * @param settledFids fid ที่ "จ่ายแล้ว" (รอบนี้) — ใบจะถูกปิดก็ต่อเมื่อบรรทัดของใบ
 *   ทุกบรรทัดอยู่ในชุดนี้ หรือเป็นแถวที่จ่ายแล้วก่อนหน้า (fstatus>=6/paydeposit='1')
 */
export async function closeFullyCoveredForwarderInvoices(
  admin: SupabaseClient,
  args: { settledFids: number[]; source: string },
): Promise<{ closed: ClosedInvoice[] }> {
  const closed: ClosedInvoice[] = [];
  const fids = Array.from(new Set(args.settledFids.filter((n) => Number.isInteger(n) && n > 0)));
  if (fids.length === 0) return { closed };

  // 1) ใบ 'issued' ที่มีบรรทัดแตะชุดที่เพิ่ง settle
  const { data: hitItems, error: hitErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("invoice_id")
    .in("forwarder_id", fids);
  if (hitErr) {
    console.error("[closeFullyCoveredForwarderInvoices items]", { code: hitErr.code, message: hitErr.message });
    return { closed };
  }
  const invoiceIds = Array.from(new Set(((hitItems ?? []) as Array<{ invoice_id: number }>).map((r) => r.invoice_id)));
  if (invoiceIds.length === 0) return { closed };

  const { data: invRaw, error: invErr } = await admin
    .from("tb_forwarder_invoice")
    .select("id, doc_no, status")
    .in("id", invoiceIds)
    .eq("status", "issued");
  if (invErr) {
    console.error("[closeFullyCoveredForwarderInvoices invoices]", { code: invErr.code, message: invErr.message });
    return { closed };
  }
  const invoices = (invRaw ?? []) as Array<{ id: number; doc_no: string; status: string }>;
  if (invoices.length === 0) return { closed };

  // 2) โหลดบรรทัดทั้งหมดของใบเหล่านั้น → เช็ค fully-covered
  const { data: allItemsRaw, error: allErr } = await admin
    .from("tb_forwarder_invoice_item")
    .select("invoice_id, forwarder_id")
    .in("invoice_id", invoices.map((i) => i.id));
  if (allErr) {
    console.error("[closeFullyCoveredForwarderInvoices all-items]", { code: allErr.code, message: allErr.message });
    return { closed };
  }
  const allItems = (allItemsRaw ?? []) as Array<{ invoice_id: number; forwarder_id: number }>;

  // แถวนอกชุด settle รอบนี้ → เช็คว่าจ่ายแล้วก่อนหน้าไหม (fstatus>=6 หรือ paydeposit='1')
  const settledSet = new Set(fids);
  const outside = Array.from(new Set(allItems.map((i) => i.forwarder_id).filter((f) => !settledSet.has(f))));
  const paidBefore = new Set<number>();
  for (let i = 0; i < outside.length; i += 200) {
    const { data: fw, error: fwErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, paydeposit")
      .in("id", outside.slice(i, i + 200));
    if (fwErr) {
      console.error("[closeFullyCoveredForwarderInvoices fw]", { code: fwErr.code, message: fwErr.message });
      return { closed }; // อ่านไม่ได้ = ตัดสินไม่ได้ → ไม่ปิดอะไรเลย (ปลอดภัยกว่า)
    }
    for (const r of (fw ?? []) as Array<{ id: number; fstatus: string | null; paydeposit: string | null }>) {
      if (Number(r.fstatus) >= 6 || r.paydeposit === "1") paidBefore.add(r.id);
    }
  }

  const nowIso = new Date().toISOString();
  for (const inv of invoices) {
    const items = allItems.filter((i) => i.invoice_id === inv.id);
    if (items.length === 0) continue;
    const covered = items.every((i) => settledSet.has(i.forwarder_id) || paidBefore.has(i.forwarder_id));
    if (!covered) continue;
    // TOCTOU: ปิดเฉพาะที่ยัง 'issued' อยู่ตอนเขียน
    const { data: upd, error: updErr } = await admin
      .from("tb_forwarder_invoice")
      .update({ status: "paid", paid_at: nowIso })
      .eq("id", inv.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();
    if (updErr) {
      console.error("[closeFullyCoveredForwarderInvoices update]", { code: updErr.code, message: updErr.message, invoiceId: inv.id });
      continue;
    }
    if (upd) closed.push({ invoiceId: inv.id, docNo: inv.doc_no });
  }

  if (closed.length > 0) {
    console.info(`[closeFullyCoveredForwarderInvoices] closed ${closed.length} invoice(s) via ${args.source}`, {
      docs: closed.map((c) => c.docNo),
    });
  }
  return { closed };
}

"use server";

/**
 * MOMO supplier-invoice → cost ingestion.
 *
 * Sets tb_forwarder.fcosttotalprice from the ACTUAL MOMO (ฮุย ไท่ต๋า) bill: paste
 * the invoice text → match each line's tracking to a forwarder row → PREVIEW the
 * cost deltas → apply. The invoice's per-line "รวม (Total)" is the real cost (more
 * exact than the 2,500/CBM default — some lines are 4,700 or 0.00/149.00).
 *
 * Money-safety: gated to cost-roles (ultra/accounting/pricing · canViewCostProfit,
 * NOT super), preview-before-apply, apply RE-DERIVES from the same text server-side
 * (never trusts a client-passed cost), writes ONLY fcosttotalprice (+fprofittotal=0
 * so reports re-derive), skips PAID containers (their cost is locked — use the
 * paid-container cost editor), idempotent, and logged.
 *
 * 🔴 RECONCILE GATE (2026-07-17): apply REFUSES the whole file unless Σ(lineTotal)
 * foots the invoice's printed Sub-total. A parse that drops a line (the confirmed
 * ฿181.42 CBM-wrap bug) must never write cost — better to refuse the file than to
 * ingest 38 of 39 lines and have nobody know. The preview still SHOWS the mismatch
 * so the accountant can see why; the refusal is re-asserted server-side on apply.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit, COST_PROFIT_ROLES } from "@/lib/admin/money-visibility";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoInvoiceText } from "@/lib/admin/momo-invoice-parser";

const ingestSchema = z.object({ text: z.string().min(10).max(200_000) });

async function assertCanEditCost(): Promise<string | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) return "ไม่มีสิทธิ์แก้ไขต้นทุน (เฉพาะ ultra / accounting / pricing)";
  return null;
}

export type MomoIngestPreviewRow = {
  tracking: string;
  invoiceCost: number;
  unitPrice: number;
  cbm: number;
  qty: number;
  totalMismatch: boolean;
  matched: boolean;
  fid: number | null;
  fcabinetnumber: string | null;
  userid: string | null;
  currentCost: number | null;
  cabinetPaid: boolean;
  willApply: boolean;
  /** ตู้ที่ MOMO ระบุบนใบ (null บนใบรุ่นเก่าที่ไม่พิมพ์ตู้). */
  invoiceCabinet: string | null;
  /** รหัสสมาชิกบนใบ (null = "No Code"). */
  invoiceMemberCode: string | null;
  /** MOMO ระบุตู้ไม่ตรงกับ fcabinetnumber ของเรา — tracking↔ตู้ = "หัวใจ" ของการตรวจ. */
  cabinetConflict: boolean;
};

export type MomoIngestPreview = {
  invoiceNo: string | null;
  grandTotal: number | null;
  rows: MomoIngestPreviewRow[];
  summary: { total: number; matched: number; willApply: number; unmatched: number; paidSkipped: number; cabinetConflicts: number };
  /** Sub-total ที่พิมพ์บนใบ (null = อ่านไม่เจอ). */
  subTotal: number | null;
  /** Σ ต้นทุนทุกบรรทัดที่แกะได้. */
  linesTotal: number;
  /** Σ ตรงกับ Sub-total — ถ้า false การบันทึกจะถูกปฏิเสธทั้งไฟล์. */
  reconciles: boolean;
};

async function buildPreview(text: string): Promise<MomoIngestPreview> {
  const parsed = parseMomoInvoiceText(text);
  const admin = createAdminClient();
  const trackings = Array.from(new Set(parsed.lines.map((l) => l.tracking)));

  // Match forwarder rows by exact tracking.
  const fByTracking = new Map<string, { id: number; fcabinetnumber: string | null; userid: string | null; fcosttotalprice: number }>();
  if (trackings.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fcabinetnumber, userid, fcosttotalprice")
      .in("ftrackingchn", trackings);
    if (error) console.error(`[momo-ingest match] failed`, { code: error.code, message: error.message });
    for (const r of (data ?? []) as Array<{ id: number; ftrackingchn: string | null; fcabinetnumber: string | null; userid: string | null; fcosttotalprice: number | string | null }>) {
      // first match per tracking wins (invoice trackings are 1:1 incl -N splits)
      if (r.ftrackingchn && !fByTracking.has(r.ftrackingchn)) {
        fByTracking.set(r.ftrackingchn, { id: r.id, fcabinetnumber: r.fcabinetnumber, userid: r.userid, fcosttotalprice: Number(r.fcosttotalprice ?? 0) });
      }
    }
  }

  // Which matched cabinets are PAID (tb_cnt_item present) → skip those.
  const cabs = Array.from(new Set(Array.from(fByTracking.values()).map((v) => v.fcabinetnumber).filter((c): c is string => !!c)));
  const paidCabs = new Set<string>();
  if (cabs.length > 0) {
    const { data: paid, error } = await admin.from("tb_cnt_item").select("fCabinetNumber").in("fCabinetNumber", cabs);
    if (error) console.error(`[momo-ingest paid] failed`, { code: error.code, message: error.message });
    for (const r of (paid ?? []) as Array<{ fCabinetNumber: string | null }>) if (r.fCabinetNumber) paidCabs.add(r.fCabinetNumber);
  }

  const rows: MomoIngestPreviewRow[] = parsed.lines.map((l) => {
    const f = fByTracking.get(l.tracking) ?? null;
    const cabinetPaid = f?.fcabinetnumber ? paidCabs.has(f.fcabinetnumber) : false;
    const currentCost = f ? f.fcosttotalprice : null;
    const willApply = !!f && !cabinetPaid && Math.abs((currentCost ?? 0) - l.lineTotal) > 0.005;
    return {
      tracking: l.tracking,
      invoiceCost: l.lineTotal,
      unitPrice: l.unitPrice,
      cbm: l.cbm,
      qty: l.qty,
      totalMismatch: l.totalMismatch,
      matched: !!f,
      fid: f?.id ?? null,
      fcabinetnumber: f?.fcabinetnumber ?? null,
      userid: f?.userid ?? null,
      currentCost,
      cabinetPaid,
      willApply,
      invoiceCabinet: l.cabinet,
      invoiceMemberCode: l.memberCode,
      // เทียบเฉพาะเมื่อมีทั้ง 2 ฝั่ง (ใบรุ่นเก่าไม่พิมพ์ตู้ → ไม่ถือว่าขัดแย้ง)
      cabinetConflict: !!l.cabinet && !!f?.fcabinetnumber && l.cabinet !== f.fcabinetnumber,
    };
  });

  return {
    invoiceNo: parsed.invoiceNo,
    grandTotal: parsed.grandTotal,
    rows,
    summary: {
      total: rows.length,
      matched: rows.filter((r) => r.matched).length,
      willApply: rows.filter((r) => r.willApply).length,
      unmatched: rows.filter((r) => !r.matched).length,
      paidSkipped: rows.filter((r) => r.matched && r.cabinetPaid).length,
      cabinetConflicts: rows.filter((r) => r.cabinetConflict).length,
    },
    subTotal: parsed.subTotal,
    linesTotal: parsed.linesTotal,
    reconciles: parsed.reconciles,
  };
}

/** ข้อความปฏิเสธเมื่อยอดที่แกะได้ไม่ตรง Sub-total บนใบ — บอกส่วนต่างจริง (§0f: อย่ามั่ว). */
function reconcileRefusal(p: MomoIngestPreview): string | null {
  if (p.reconciles) return null;
  const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p.subTotal == null) {
    return `อ่านยอด "ค่าขนส่งทั้งหมด (Sub-total)" บนใบไม่เจอ — ปฏิเสธทั้งไฟล์ (กันเขียนต้นทุนผิด) · แกะได้ ${p.rows.length} บรรทัด Σ ฿${baht(p.linesTotal)} · กรุณาวางข้อความจากใบให้ครบทั้งใบ รวมส่วนท้าย`;
  }
  const diff = Math.round((p.subTotal - p.linesTotal) * 100) / 100;
  return `ยอดที่แกะได้ไม่ตรงกับ Sub-total บนใบ — ปฏิเสธทั้งไฟล์ (กันเขียนต้นทุนผิด) · แกะได้ ${p.rows.length} บรรทัด Σ ฿${baht(p.linesTotal)} vs Sub-total ฿${baht(p.subTotal)} · ${diff > 0 ? "ขาด" : "เกิน"} ฿${baht(Math.abs(diff))} (มีบรรทัดตกหล่นหรือรูปแบบใบเปลี่ยน — อย่าเพิ่งบันทึก)`;
}

/** Read-only preview — parse + match + compute deltas. No writes. */
export async function previewMomoInvoiceCost(input: unknown): Promise<AdminActionResult<MomoIngestPreview>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await buildPreview(parsed.data.text) };
  });
}

/** Apply — re-derives from the SAME text server-side, writes fcosttotalprice on the
 *  willApply rows (matched · unpaid · cost differs). Idempotent + logged. */
export async function applyMomoInvoiceCost(input: unknown): Promise<AdminActionResult<{ applied: number; skipped: number; invoiceNo: string | null }>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };

    const preview = await buildPreview(parsed.data.text);
    // 🔴 fail-closed: a parse that doesn't foot the printed Sub-total never writes money.
    const refusal = reconcileRefusal(preview);
    if (refusal) {
      await logAdminAction(adminId, "momo_invoice.ingest_refused", "tb_forwarder", preview.invoiceNo ?? "", {
        invoiceNo: preview.invoiceNo,
        reason: "subtotal_mismatch",
        lines: preview.rows.length,
        linesTotal: preview.linesTotal,
        subTotal: preview.subTotal,
      });
      return { ok: false, error: refusal };
    }
    const admin = createAdminClient();
    let applied = 0;
    for (const r of preview.rows) {
      if (!r.willApply || r.fid == null) continue;
      const { error } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: r.invoiceCost, fprofittotal: 0 })
        .eq("id", r.fid)
        .neq("fcosttotalprice", r.invoiceCost); // optimistic — skip if already set
      if (error) {
        console.error(`[momo-ingest apply] fid ${r.fid}`, { code: error.code, message: error.message });
        continue;
      }
      applied += 1;
    }
    await logAdminAction(adminId, "momo_invoice.ingest_cost", "tb_forwarder", preview.invoiceNo ?? "", {
      invoiceNo: preview.invoiceNo,
      applied,
      candidates: preview.summary.willApply,
      unmatched: preview.summary.unmatched,
      cabinetConflicts: preview.summary.cabinetConflicts,
      linesTotal: preview.linesTotal,
      subTotal: preview.subTotal,
    });
    return { ok: true, data: { applied, skipped: preview.summary.total - applied, invoiceNo: preview.invoiceNo } };
  });
}

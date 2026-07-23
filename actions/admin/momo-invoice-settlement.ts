"use server";

/**
 * MOMO-bill SETTLEMENT (ตัดจ่าย) — owner 2026-07-22.
 *
 * The register of "we PAID a MOMO bill". A MOMO bill is billed PER TRACKING and one bill
 * can span MULTIPLE containers (proven prod: INV-20260708-0002 spans GZS260620-2 +
 * GZE260701-1), so settlement is keyed to the BILL, not the ตู้ — the owner rejected the
 * legacy per-container "ตัดจ่ายตู้" concept ("มันไม่ใช่ทั้งตู้ · บางบิลมีหลายตู้").
 *
 * Money-safety (§0e): recording a settlement moves ZERO baht in-app — the real payment is a
 * bank transfer; the slip is the evidence (same model as tb_cnt / the billing-run slip
 * register). It writes ONLY momo_invoice_settlement(+_line) — NEVER fcosttotalprice (that is
 * the บันทึกต้นทุน path = applyMomoInvoiceCost), fstatus, wallet, or the pay register. Gated
 * canViewCostProfit (ultra/accounting/pricing). Every settle RE-DERIVES the bill from its
 * source server-side (via previewMomoInvoiceCost) — the client never hands us a settleable
 * amount. Create-side double-pay guard: refuses any fid already covered by a non-void
 * settlement (the cnt-hs 2026-06-14 lesson).
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit, COST_PROFIT_ROLES } from "@/lib/admin/money-visibility";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { previewMomoInvoiceCost } from "./momo-invoice-ingest";
import { extractMomoInvoicePdfText } from "@/lib/admin/momo-invoice-pdf";
import { detectMomoDocNo, momoAttachmentBaseName } from "@/lib/admin/momo-doc-name";
import { MOMO_INVOICE_PDF_MAX_BYTES } from "@/lib/admin/momo-invoice-pdf-text";
import {
  nextMomoSettlementSeq,
  momoSettlementDocNoFor,
  yyMmToken,
  selectSettleableLines,
  decideDoublePayRefusal,
  round2,
  type SettlePreviewLine,
} from "@/lib/admin/momo-invoice-settlement-core";

const MAX_PDF_BASE64 = Math.ceil((MOMO_INVOICE_PDF_MAX_BYTES * 4) / 3) + 1024;
const SLIP_BUCKET = "slips";

async function assertCanEditCost(): Promise<string | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) return "ไม่มีสิทธิ์ตัดจ่ายบิล MOMO (เฉพาะ ultra / accounting / pricing)";
  return null;
}

/** Resolve the legacy admin username (for the register's created_by/paid_by), mirroring the
 *  cnt-payment / billing-run pattern. Falls back to the email localpart. */
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error("[momo-settlement auth.getUser] failed", { message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email).maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error("[momo-settlement tb_admin] failed", { message: aErr.message });
  return safeLegacyAdminId(data?.adminID ?? (email.split("@")[0] || "system"), 50);
}

// ── source (text XOR pdf) + optional fid selection ──
const settleSchema = z
  .object({
    text: z.string().min(10).max(200_000).optional(),
    fileBase64: z.string().min(1).max(MAX_PDF_BASE64).optional(),
    /** Settle ONLY these fids (per-line ตัดจ่ายตามรายการ / a chosen set). Omitted = every
     *  eligible line on the bill (ตัดจ่ายทั้งบิล). */
    fids: z.array(z.number().int().positive()).max(2000).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((v) => (v.text != null) !== (v.fileBase64 != null), {
    message: "ต้องส่งข้อความจากใบ หรือไฟล์ PDF อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่)",
  });

export type MomoSettlementResult = {
  settlementId: number;
  docNo: string;
  invoiceNo: string | null;
  lineCount: number;
  totalThb: number;
};

/**
 * Query which of `fids` are already covered by a NON-VOID settlement → fid → doc_no. Two
 * plain queries (no embed ambiguity). Read-only; a void frees a fid so it can re-settle.
 */
async function loadPaidFidMap(
  admin: ReturnType<typeof createAdminClient>,
  fids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (fids.length === 0) return out;
  const { data: lines, error: lErr } = await admin
    .from("momo_invoice_settlement_line")
    .select("fid, settlement_id")
    .in("fid", fids);
  if (lErr) { console.error("[momo-settlement paidmap lines] failed", { message: lErr.message }); return out; }
  const bySettlement = new Map<number, number[]>();
  for (const r of (lines ?? []) as Array<{ fid: number; settlement_id: number }>) {
    const arr = bySettlement.get(r.settlement_id) ?? [];
    arr.push(r.fid);
    bySettlement.set(r.settlement_id, arr);
  }
  if (bySettlement.size === 0) return out;
  const { data: heads, error: hErr } = await admin
    .from("momo_invoice_settlement")
    .select("id, doc_no, status")
    .in("id", [...bySettlement.keys()]);
  if (hErr) { console.error("[momo-settlement paidmap heads] failed", { message: hErr.message }); return out; }
  for (const h of (heads ?? []) as Array<{ id: number; doc_no: string; status: string }>) {
    if (h.status === "void") continue; // a void frees the fid
    for (const fid of bySettlement.get(h.id) ?? []) if (!out.has(fid)) out.set(fid, h.doc_no);
  }
  return out;
}

/**
 * ตัดจ่ายบิล MOMO — record a settlement for the whole bill or a chosen set of lines. The
 * owner's naming rule: NEVER "ตัดจ่ายตู้" (a bill spans containers) — this is "ตัดจ่ายบิล".
 */
export async function createMomoInvoiceSettlement(input: unknown): Promise<AdminActionResult<MomoSettlementResult>> {
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<MomoSettlementResult>([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };

    // Re-derive the whole bill from its source (server-side) — never trust a client amount.
    const source = parsed.data.fileBase64 != null ? { fileBase64: parsed.data.fileBase64 } : { text: parsed.data.text };
    const pv = await previewMomoInvoiceCost(source);
    if (!pv.ok || !pv.data) return { ok: false, error: pv.ok ? "อ่านใบไม่สำเร็จ" : pv.error };
    const preview = pv.data;

    // File-level gates — the same doors บันทึกต้นทุน uses: Σ must foot the Sub-total AND the
    // CBM basis must be readable. A bill we can't trust the numbers on cannot be settled.
    if (!preview.canApply) {
      const why = !preview.reconciles
        ? "ยอดรวมของบรรทัดไม่ตรง Sub-total บนใบ — ตรวจที่หน้าบันทึกต้นทุนก่อน"
        : "อ่านวิธีคิดคิวของใบนี้ไม่ชัด — ตรวจที่หน้าบันทึกต้นทุนก่อน";
      return { ok: false, error: `ยังตัดจ่ายบิลนี้ไม่ได้: ${why}` };
    }

    const rows: SettlePreviewLine[] = preview.rows.map((r) => ({
      fid: r.fid,
      tracking: r.tracking,
      fcabinetnumber: r.fcabinetnumber,
      invoiceCost: r.invoiceCost,
      currentCost: r.currentCost,
      matched: r.matched,
      cabinetConflict: r.cabinetConflict,
      duplicateFid: r.duplicateFid,
    }));
    const { eligible, blocked } = selectSettleableLines(rows, parsed.data.fids);

    // A line the user EXPLICITLY chose but that can't settle → refuse, naming it (§0f: อย่ามั่ว).
    if (blocked.length > 0) {
      const list = blocked.slice(0, 5).map((b) => `${b.tracking} — ${b.reason}`).join(" · ");
      return { ok: false, error: `มีรายการที่ตัดจ่ายไม่ได้: ${list}${blocked.length > 5 ? " …" : ""}` };
    }
    if (eligible.length === 0) {
      return { ok: false, error: "ไม่มีรายการที่ตัดจ่ายได้ในใบนี้ (ต้องจับคู่รายการนำเข้าได้ · ตู้ตรง · ไม่ชี้ซ้ำ)" };
    }

    const admin = createAdminClient();

    // Create-side double-pay guard — refuse any fid already covered by a non-void settlement.
    const paidByFid = await loadPaidFidMap(admin, eligible.map((e) => e.fid));
    const dupRefusal = decideDoublePayRefusal(eligible, paidByFid);
    if (dupRefusal) return { ok: false, error: dupRefusal };

    const legacyAdminId = await resolveLegacyAdminId();
    const sourceKind = parsed.data.fileBase64 != null ? "pdf" : "text";
    const totalThb = round2(eligible.reduce((a, e) => a + e.amount, 0));
    const nowIso = new Date().toISOString();

    // ── mint MCS{yyMM}-{NNNN} with retry-on-collision (doc_no is UNIQUE) ──
    const yyMm = yyMmToken(new Date());
    let inserted: { id: number; doc_no: string } | null = null;
    for (let attempt = 0; attempt < 4 && !inserted; attempt++) {
      const { data: existing, error: exErr } = await admin
        .from("momo_invoice_settlement")
        .select("doc_no")
        .ilike("doc_no", `${momoSettlementDocNoFor(yyMm, 0).slice(0, -4)}%`) // "MCS2607-%"
        .limit(2000);
      if (exErr) console.error("[momo-settlement doc_no lookup] failed", { message: exErr.message });
      const seq = nextMomoSettlementSeq((existing ?? []).map((r) => r.doc_no as string), yyMm) + attempt;
      const docNo = momoSettlementDocNoFor(yyMm, seq);
      const { data: head, error: insErr } = await admin
        .from("momo_invoice_settlement")
        .insert({
          doc_no: docNo,
          invoice_no: preview.invoiceNo ?? "",
          supplier: "MOMO",
          total_thb: totalThb,
          line_count: eligible.length,
          status: "paid",
          slip_paths: [],
          note: parsed.data.note ?? null,
          source_kind: sourceKind,
          created_by: legacyAdminId,
          created_at: nowIso,
          paid_by: legacyAdminId,
          paid_at: nowIso,
        })
        .select("id, doc_no")
        .single<{ id: number; doc_no: string }>();
      if (insErr) {
        if (insErr.code === "23505") continue; // doc_no collision → re-mint
        console.error("[momo-settlement header insert] failed", { code: insErr.code, message: insErr.message });
        return { ok: false, error: insErr.message };
      }
      inserted = head;
    }
    if (!inserted) return { ok: false, error: "ออกเลขเอกสารตัดจ่ายไม่สำเร็จ (ชนกันหลายครั้ง) — ลองอีกครั้ง" };

    // ── insert the lines ──
    const lineRows = eligible.map((e) => ({
      settlement_id: inserted!.id,
      fid: e.fid,
      tracking: e.tracking,
      cabinet: e.cabinet,
      amount_thb: e.amount,
      cost_written: e.costWritten,
    }));
    const { error: lineErr } = await admin.from("momo_invoice_settlement_line").insert(lineRows);
    if (lineErr) {
      // Roll back the header so we never leave a 0-line settlement (cascade deletes lines).
      await admin.from("momo_invoice_settlement").delete().eq("id", inserted.id);
      console.error("[momo-settlement lines insert] failed", { code: lineErr.code, message: lineErr.message });
      if (lineErr.code === "23505") {
        return { ok: false, error: "มีรายการซ้ำในบิลนี้ — ตัดจ่ายไม่สำเร็จ (โหลดใบใหม่แล้วลองอีกครั้ง)" };
      }
      return { ok: false, error: lineErr.message };
    }

    await logAdminAction(adminId, "momo_settlement.create", "momo_invoice_settlement", String(inserted.id), {
      docNo: inserted.doc_no,
      invoiceNo: preview.invoiceNo,
      lineCount: eligible.length,
      totalThb,
      whole_bill: parsed.data.fids == null,
      source: sourceKind,
      by: legacyAdminId,
    });

    revalidatePath("/admin/api-forwarder-momo/invoice-cost");
    revalidatePath("/admin/api-forwarder-momo/invoice-cost/history");
    return {
      ok: true,
      data: { settlementId: inserted.id, docNo: inserted.doc_no, invoiceNo: preview.invoiceNo, lineCount: eligible.length, totalThb },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID — reverse a settlement, keeping the row for history (append-only truth · a void
// frees its fids to re-settle). Per [[status-rollback-on-cancel]] a void never deletes.
// ─────────────────────────────────────────────────────────────────────────────
const voidSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(1, { message: "กรุณาระบุเหตุผลการยกเลิก" }).max(500),
});

export async function voidMomoInvoiceSettlement(input: unknown): Promise<AdminActionResult<{ id: number }>> {
  const parsed = voidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<{ id: number }>([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { id, reason } = parsed.data;

    const { data: cur, error: curErr } = await admin
      .from("momo_invoice_settlement").select("id, doc_no, status").eq("id", id).maybeSingle<{ id: number; doc_no: string; status: string }>();
    if (curErr) { console.error("[momo-settlement void load] failed", { message: curErr.message }); return { ok: false, error: curErr.message }; }
    if (!cur) return { ok: false, error: "ไม่พบรายการตัดจ่าย" };
    if (cur.status === "void") return { ok: false, error: `บิลตัดจ่าย ${cur.doc_no} ถูกยกเลิกไปแล้ว` };

    const legacyAdminId = await resolveLegacyAdminId();
    // ATOMIC claim — only flip a still-'paid' row (guards a double-void / stale page).
    const { data: upd, error: updErr } = await admin
      .from("momo_invoice_settlement")
      .update({ status: "void", void_by: legacyAdminId, void_at: new Date().toISOString(), void_reason: reason })
      .eq("id", id).eq("status", "paid")
      .select("id").maybeSingle<{ id: number }>();
    if (updErr) { console.error("[momo-settlement void update] failed", { message: updErr.message }); return { ok: false, error: updErr.message }; }
    if (!upd) return { ok: false, error: "รายการนี้เพิ่งถูกยกเลิกไปแล้ว — ลองรีเฟรช" };

    await logAdminAction(adminId, "momo_settlement.void", "momo_invoice_settlement", String(id), { docNo: cur.doc_no, reason, by: legacyAdminId });
    revalidatePath("/admin/api-forwarder-momo/invoice-cost");
    revalidatePath("/admin/api-forwarder-momo/invoice-cost/history");
    return { ok: true, data: { id } };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACH — a settlement doc's evidence, retroactively. owner 2026-07-23: "เปิด tag ประวัติ
// … เอาไว้ใส่ แนบใบเสร็จ และ สลิป ได้ทีหลัง". Two KINDS, two columns (never mixed):
//   · slip    = the bank transfer slip (proof we paid)       → slip_paths (0273/0275)
//   · receipt = MOMO's ใบเสร็จ/ใบกำกับภาษี REC-… (proof they received) → receipt_paths (0276)
// A PDF is named by its printed NO (REC-…/INV-…) so files stop colliding as "…(15).pdf".
// The File is uploaded server-side (uploadToBucket) and appended to the right column.
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadMomoSettlementDoc(
  input: { settlementId: number; kind: "receipt" | "slip" },
  file: File | null,
): Promise<AdminActionResult<{ id: number; path: string; detectedNo: string | null }>> {
  const id = Number(input?.settlementId);
  const kind = input?.kind === "receipt" ? "receipt" : "slip";
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_settlement_id" };
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: kind === "receipt" ? "กรุณาเลือกไฟล์ใบเสร็จ MOMO (รูป หรือ PDF)" : "กรุณาเลือกไฟล์สลิป (รูป หรือ PDF)" };
  }

  return withAdmin<{ id: number; path: string; detectedNo: string | null }>([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();

    const col = kind === "receipt" ? "receipt_paths" : "slip_paths";
    const { data: cur, error: curErr } = await admin
      .from("momo_invoice_settlement").select(`id, doc_no, ${col}`).eq("id", id).maybeSingle<Record<string, unknown>>();
    if (curErr) { console.error("[momo-settlement attach load] failed", { message: curErr.message }); return { ok: false, error: curErr.message }; }
    if (!cur) return { ok: false, error: "ไม่พบรายการตัดจ่าย" };

    // ตั้งชื่อไฟล์ตามเลขในเอกสาร (owner 2026-07-23) — อ่าน NO จาก PDF ถ้าเป็น PDF; รูปสลิป
    // ไม่มี NO อยู่แล้ว → ใช้ label "slip". อ่านไม่ออก = ไม่พัง แค่ไม่มีชื่อสวย (uploadToBucket
    // ยังเติม ms prefix กันชนอยู่ดี).
    let detectedNo: string | null = null;
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
      try {
        const ex = await extractMomoInvoicePdfText(new Uint8Array(await file.arrayBuffer()));
        if (ex.ok) detectedNo = detectMomoDocNo(ex.text).no;
      } catch (e) {
        console.error("[momo-settlement attach pdf-no] failed", { message: (e as Error).message });
      }
    }
    const baseName = momoAttachmentBaseName(kind, detectedNo);

    const upload = await uploadToBucket(file, SLIP_BUCKET, `admin/momo-settlement/${id}`, baseName);
    if (!upload.ok) return { ok: false, error: upload.error };

    const prev = Array.isArray(cur[col]) ? (cur[col] as unknown[]).filter((p): p is string => typeof p === "string") : [];
    const next = [...prev, upload.filename].slice(-10); // keep last 10
    const { error: updErr } = await admin.from("momo_invoice_settlement").update({ [col]: next }).eq("id", id);
    if (updErr) { console.error("[momo-settlement attach update] failed", { message: updErr.message }); return { ok: false, error: updErr.message }; }

    await logAdminAction(adminId, `momo_settlement.${kind}_upload`, "momo_invoice_settlement", String(id), { docNo: cur.doc_no as string, path: upload.filename, detectedNo });
    revalidatePath("/admin/api-forwarder-momo/invoice-cost/history");
    return { ok: true, data: { id, path: upload.filename, detectedNo } };
  });
}

/** @deprecated ใช้ uploadMomoSettlementDoc({kind:'slip'}) — เก็บไว้กัน caller เดิมพัง. */
export async function uploadMomoSettlementSlip(input: { settlementId: number }, file: File | null) {
  return uploadMomoSettlementDoc({ settlementId: input?.settlementId, kind: "slip" }, file);
}

// ─────────────────────────────────────────────────────────────────────────────
// READERS — history list, one settlement (with signed slip URLs), and the settled-fid map
// that powers the "ตัดจ่ายแล้ว · MCS…" chips + the "ตัดจ่ายทั้งบิล = ที่เหลือ" computation.
// ─────────────────────────────────────────────────────────────────────────────
export type MomoSettlementHeader = {
  id: number;
  docNo: string;
  invoiceNo: string;
  /** วันที่บนใบแจ้งหนี้ MOMO (อาจว่างถ้าใบไม่พิมพ์). */
  invoiceDate: string | null;
  totalThb: number;
  lineCount: number;
  status: "paid" | "void";
  slipCount: number;
  /** จำนวนใบเสร็จ MOMO (REC-…) ที่แนบไว้ — แยกจาก slipCount (สลิปการโอน). */
  receiptCount: number;
  createdBy: string | null;
  createdAt: string | null;
  voidReason: string | null;
};

export async function listMomoInvoiceSettlements(input?: { limit?: number }): Promise<AdminActionResult<{ rows: MomoSettlementHeader[] }>> {
  const limit = Math.min(Math.max(Number(input?.limit ?? 100), 1), 500);
  return withAdmin<{ rows: MomoSettlementHeader[] }>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("momo_invoice_settlement")
      .select("id, doc_no, invoice_no, invoice_date, total_thb, line_count, status, slip_paths, receipt_paths, created_by, created_at, void_reason")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) { console.error("[momo-settlement list] failed", { message: error.message }); return { ok: false, error: error.message }; }
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((r): MomoSettlementHeader => ({
      id: r.id as number,
      docNo: (r.doc_no as string) ?? "",
      invoiceNo: (r.invoice_no as string) ?? "",
      invoiceDate: (r.invoice_date as string | null) ?? null,
      totalThb: Number(r.total_thb ?? 0),
      lineCount: Number(r.line_count ?? 0),
      status: (r.status as "paid" | "void") ?? "paid",
      slipCount: Array.isArray(r.slip_paths) ? r.slip_paths.length : 0,
      receiptCount: Array.isArray(r.receipt_paths) ? r.receipt_paths.length : 0,
      createdBy: (r.created_by as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      voidReason: (r.void_reason as string | null) ?? null,
    }));
    return { ok: true, data: { rows } };
  });
}

export type MomoSettlementLine = { fid: number; tracking: string; cabinet: string | null; amountThb: number; costWritten: boolean };
export type MomoSettlementDetail = MomoSettlementHeader & {
  note: string | null;
  paidBy: string | null;
  paidAt: string | null;
  voidBy: string | null;
  voidAt: string | null;
  lines: MomoSettlementLine[];
  /** Signed URLs (1h) for the slip paths — for inline preview in the history detail. */
  slipUrls: string[];
  /** Signed URLs (1h) + ชื่อไฟล์ ของใบเสร็จ MOMO (REC-…) — ชื่อไฟล์ = เลขในเอกสาร (0276). */
  receiptFiles: { url: string; name: string }[];
};

export async function getMomoInvoiceSettlement(input: { id: number }): Promise<AdminActionResult<MomoSettlementDetail>> {
  const id = Number(input?.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_id" };
  return withAdmin<MomoSettlementDetail>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { data: h, error: hErr } = await admin
      .from("momo_invoice_settlement")
      .select("id, doc_no, invoice_no, invoice_date, total_thb, line_count, status, slip_paths, receipt_paths, note, created_by, created_at, paid_by, paid_at, void_by, void_at, void_reason")
      .eq("id", id).maybeSingle<Record<string, unknown>>();
    if (hErr) { console.error("[momo-settlement detail head] failed", { message: hErr.message }); return { ok: false, error: hErr.message }; }
    if (!h) return { ok: false, error: "ไม่พบรายการตัดจ่าย" };

    const { data: lines, error: lErr } = await admin
      .from("momo_invoice_settlement_line")
      .select("fid, tracking, cabinet, amount_thb, cost_written")
      .eq("settlement_id", id)
      .order("id", { ascending: true });
    if (lErr) console.error("[momo-settlement detail lines] failed", { message: lErr.message });

    const slipPaths = Array.isArray(h.slip_paths) ? (h.slip_paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
    const slipUrls: string[] = [];
    for (const p of slipPaths) {
      const { data: signed, error: sErr } = await admin.storage.from(SLIP_BUCKET).createSignedUrl(p, 3600);
      if (sErr) { console.error("[momo-settlement slip sign] failed", { path: p, message: sErr.message }); continue; }
      if (signed?.signedUrl) slipUrls.push(signed.signedUrl);
    }

    const receiptPaths = Array.isArray(h.receipt_paths) ? (h.receipt_paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
    const receiptFiles: { url: string; name: string }[] = [];
    for (const p of receiptPaths) {
      const { data: signed, error: sErr } = await admin.storage.from(SLIP_BUCKET).createSignedUrl(p, 3600);
      if (sErr) { console.error("[momo-settlement receipt sign] failed", { path: p, message: sErr.message }); continue; }
      if (signed?.signedUrl) {
        // ชื่อที่โชว์ = เลขเอกสารที่เราตั้งไว้ตอนแนบ (ตัด ms prefix + นามสกุลออก)
        const base = (p.split("/").pop() ?? "").replace(/^\d+-/, "").replace(/\.[A-Za-z0-9]{1,8}$/, "");
        receiptFiles.push({ url: signed.signedUrl, name: base || "ใบเสร็จ" });
      }
    }

    return {
      ok: true,
      data: {
        id: h.id as number,
        docNo: (h.doc_no as string) ?? "",
        invoiceNo: (h.invoice_no as string) ?? "",
        invoiceDate: (h.invoice_date as string | null) ?? null,
        totalThb: Number(h.total_thb ?? 0),
        lineCount: Number(h.line_count ?? 0),
        status: (h.status as "paid" | "void") ?? "paid",
        slipCount: slipPaths.length,
        receiptCount: receiptPaths.length,
        receiptFiles,
        note: (h.note as string | null) ?? null,
        createdBy: (h.created_by as string | null) ?? null,
        createdAt: (h.created_at as string | null) ?? null,
        paidBy: (h.paid_by as string | null) ?? null,
        paidAt: (h.paid_at as string | null) ?? null,
        voidBy: (h.void_by as string | null) ?? null,
        voidAt: (h.void_at as string | null) ?? null,
        voidReason: (h.void_reason as string | null) ?? null,
        lines: ((lines ?? []) as Array<Record<string, unknown>>).map((r): MomoSettlementLine => ({
          fid: r.fid as number,
          tracking: (r.tracking as string) ?? "",
          cabinet: (r.cabinet as string | null) ?? null,
          amountThb: Number(r.amount_thb ?? 0),
          costWritten: !!r.cost_written,
        })),
        slipUrls,
      },
    };
  });
}

/** fid → { docNo, settlementId } for every fid covered by a NON-VOID settlement. Powers the
 *  "ตัดจ่ายแล้ว · MCS…" chip on the workspace + the client's "ตัดจ่ายทั้งบิล = ที่เหลือ" set. */
export async function getMomoSettledFids(input: { fids: number[] }): Promise<AdminActionResult<{ settled: { fid: number; docNo: string; settlementId: number }[] }>> {
  const fids = Array.isArray(input?.fids) ? input.fids.filter((n) => Number.isInteger(n) && n > 0).slice(0, 4000) : [];
  return withAdmin<{ settled: { fid: number; docNo: string; settlementId: number }[] }>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    if (fids.length === 0) return { ok: true, data: { settled: [] } };
    const admin = createAdminClient();
    const { data: lines, error: lErr } = await admin
      .from("momo_invoice_settlement_line").select("fid, settlement_id").in("fid", fids);
    if (lErr) { console.error("[momo-settled-fids lines] failed", { message: lErr.message }); return { ok: false, error: lErr.message }; }
    const bySettlement = new Map<number, number[]>();
    for (const r of (lines ?? []) as Array<{ fid: number; settlement_id: number }>) {
      const arr = bySettlement.get(r.settlement_id) ?? []; arr.push(r.fid); bySettlement.set(r.settlement_id, arr);
    }
    if (bySettlement.size === 0) return { ok: true, data: { settled: [] } };
    const { data: heads, error: hErr } = await admin
      .from("momo_invoice_settlement").select("id, doc_no, status").in("id", [...bySettlement.keys()]);
    if (hErr) { console.error("[momo-settled-fids heads] failed", { message: hErr.message }); return { ok: false, error: hErr.message }; }
    const settled: { fid: number; docNo: string; settlementId: number }[] = [];
    const seen = new Set<number>();
    for (const h of (heads ?? []) as Array<{ id: number; doc_no: string; status: string }>) {
      if (h.status === "void") continue;
      for (const fid of bySettlement.get(h.id) ?? []) {
        if (seen.has(fid)) continue;
        seen.add(fid);
        settled.push({ fid, docNo: h.doc_no, settlementId: h.id });
      }
    }
    return { ok: true, data: { settled } };
  });
}

"use server";

/**
 * ประวัติการอัพ "ใบวางบิล MOMO" (invoice) — owner 2026-07-29.
 *
 * owner (verbatim): *"ที่จริงใบวางบิล momo ที่อัพเข้าไป ทำประวัติเก็บไว้ บันทึกให้เองเลย
 *   เหมือนฝั่งอัพ แพคกิ้งลิสตู้ไปเลยด้วยก็ดีครับ ทำให้ใช้ได้จริงและเสถียรนะครับ"*
 *
 * ก่อนหน้านี้: หน้า invoice-cost แกะ PDF → โชว์ผล → **ทิ้งไฟล์ทิ้งผล** (ไม่มีตาราง ไม่มี
 * bucket) ต่างจากฝั่งแพคกิ้งลิสที่เก็บครบ (`momo_packing_upload` · 0254). บัญชีจึงตอบไม่ได้ว่า
 * "ใบรอบที่แล้วอัพไปยัง / ใครอัพ / บันทึกต้นทุนไปแล้วหรือยัง" นอกจากไปขุดเมลมาอัพซ้ำ.
 *
 * ไฟล์นี้ = ขาบันทึกประวัติ (mirror ของ momo-packing-history.ts):
 *   • เก็บ PDF ต้นฉบับ → bucket `csv-imports` prefix `momo-invoice/` (ดาวน์โหลดย้อนหลังได้)
 *   • เก็บ parsed_snapshot = **ผลตรวจตอนที่อัพ** → กด "ดูอีกครั้ง" ได้ทันที ไม่ต้องแกะ PDF ใหม่
 *   • เก็บยอดของใบ + จับคู่ได้/ไม่พบ/ตู้ไม่ตรง + ใครอัพ + บันทึกต้นทุนแล้วยัง
 *
 * 🔒 ISOLATION (§0e): เขียน **เฉพาะ** `momo_invoice_upload` (mig 0283) + ไฟล์ใน bucket.
 *    ไม่แตะ tb_forwarder / fcosttotalprice / momo_invoice_line / momo_invoice_settlement /
 *    fstatus / wallet เลยแม้แต่คอลัมน์เดียว. gate เดียวกับหน้า (canViewCostProfit).
 *    `recordMomoInvoiceUpload` เป็น **best-effort** — พังก็แค่ไม่มีแถวประวัติ ผลตรวจบนจอ
 *    ยังใช้งานได้ปกติ (ตัวเรียกยิงแบบ fire-and-forget).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit, COST_PROFIT_ROLES } from "@/lib/admin/money-visibility";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { previewMomoInvoiceCost, type MomoIngestPreview } from "./momo-invoice-ingest";
import { extractMomoInvoicePdfText } from "@/lib/admin/momo-invoice-pdf";
import { MOMO_INVOICE_PDF_MAX_BYTES } from "@/lib/admin/momo-invoice-pdf-text";
import { invoiceDateFromNo, supplierFromInvoiceText } from "@/lib/admin/momo-invoice-doc-meta";
import {
  MOMO_INVOICE_UPLOAD_TABLE,
  stampMomoInvoiceUploadApplied,
} from "@/lib/admin/momo-invoice-upload-stamp";
import {
  decideInvoiceUploadDedupe,
  type UploadDedupeCandidate,
} from "@/lib/admin/momo-invoice-upload-dedupe";

const BUCKET = "csv-imports";
const PREFIX = "momo-invoice";
const MAX_PDF_BASE64 = Math.ceil((MOMO_INVOICE_PDF_MAX_BYTES * 4) / 3) + 1024;
const LIST_CAP = 50;
/** แถวในสแนปช็อต — ใบจริงยาวสุด 39 บรรทัด · 400 = เผื่อไว้เยอะแล้ว กัน jsonb บวม. */
const SNAPSHOT_ROW_CAP = 400;

const recordSchema = z
  .object({
    text: z.string().min(10).max(200_000).optional(),
    fileBase64: z.string().min(1).max(MAX_PDF_BASE64).optional(),
    fileName: z.string().max(200).optional(),
  })
  .refine((v) => (v.text != null) !== (v.fileBase64 != null), {
    message: "ต้องส่งข้อความจากใบ หรือไฟล์ PDF อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่)",
  });

export type InvoiceUploadSource = "pdf_upload" | "paste";

/** หนึ่งบรรทัดของใบ ตามที่ระบบเห็น **ตอนที่อัพ** (แช่ไว้ดูย้อนหลัง ไม่ใช่สถานะสด). */
export type InvoiceUploadSnapshotRow = {
  tracking: string;
  matchedTracking: string | null;
  fid: number | null;
  userid: string | null;
  fcabinetnumber: string | null;
  invoiceCabinet: string | null;
  qty: number;
  invoiceCost: number;
  currentCost: number | null;
  ourCbm: number | null;
  invoiceCbm: number;
  ourSell: number | null;
  /** 🔴 ขายต่ำกว่าทุนที่ MOMO เก็บ ณ เวลาที่อัพ (owner 2026-07-30). */
  lossVsInvoice: boolean;
  /** ขาดไปเท่าไร ณ เวลานั้น. */
  lossShortfall: number;
  matched: boolean;
  cabinetConflict: boolean;
  duplicateFid: boolean;
  cabinetPaid: boolean;
  willApply: boolean;
  blockReason: string | null;
  /** คำตอบ "พัสดุนี้อยู่ตู้ไหน" จากแพคกิ้งลิส ณ เวลาที่อัพ (null = ตอบไม่ได้). */
  containerTruth: string | null;
};

export type InvoiceUploadSnapshot = {
  invoiceNo: string | null;
  invoiceDate: string | null;
  supplier: string | null;
  source: InvoiceUploadSource;
  grandTotal: number | null;
  subTotal: number | null;
  linesTotal: number;
  reconciles: boolean;
  cbmBasis: string | null;
  cbmBasisReason: string;
  whtThb: number | null;
  summary: MomoIngestPreview["summary"];
  reconcile: MomoIngestPreview["reconcile"];
  rows: InvoiceUploadSnapshotRow[];
};

export type MomoInvoiceUploadRow = {
  id: number;
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  supplier: string | null;
  source: InvoiceUploadSource | null;
  lineCount: number;
  subTotal: number | null;
  linesTotal: number | null;
  reconciles: boolean | null;
  cbmBasis: string | null;
  matchedCount: number;
  unmatchedCount: number;
  conflictCount: number;
  uploadedBy: string | null;
  /** ชื่อพนักงานที่อัพ (null = ระบบ/หาไม่เจอ). */
  uploadedByName: string | null;
  uploadedAt: string;
  appliedAt: string | null;
  status: string;
};

export type RecordInvoiceUploadResult = {
  id: number;
  invoiceNo: string | null;
  lineCount: number;
  fileStored: boolean;
  /** true = ไฟล์นี้เคยอัพไว้แล้ว (เลขใบเดิม + เนื้อไฟล์เดิม) → ไม่เก็บแถว/ไฟล์ซ้ำ · `id` ชี้แถวเดิม. */
  deduped: boolean;
  /** เป็นการอัพครั้งที่เท่าไรของเลขใบนี้ (1 = ครั้งแรก · ≥2 = ใบถูกแก้ไข/ออกใหม่). */
  revision: number;
};

export type MomoInvoiceUploadDetail = {
  row: MomoInvoiceUploadRow;
  snapshot: InvoiceUploadSnapshot;
};

async function assertCanEditCost(): Promise<string | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) return "ไม่มีสิทธิ์ดูประวัติใบวางบิล MOMO (เฉพาะ ultra / accounting / pricing)";
  return null;
}

const safeName = (n: string | undefined) =>
  (n && n.trim() ? n : "invoice.pdf").replace(/[^\w.\-]+/g, "_").slice(0, 120);

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ลายนิ้วมือเนื้อไฟล์ — ตัวชี้ขาด "ไฟล์เดียวกัน" (ไม่ใช่ชื่อ/ขนาด · ดู momo-invoice-upload-dedupe.ts). */
const sha256Hex = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * รหัส error ที่แปลว่า **คอลัมน์ `file_hash` ยังไม่มีบน DB** (ยังไม่ได้ apply mig 0284).
 *   · `42703` = undefined_column ของ Postgres (ตอน SELECT)
 *   · `PGRST204` = PostgREST ไม่รู้จักคอลัมน์ใน schema cache (ตอน INSERT)
 * เจอสองตัวนี้ = ถอยไปทำงานแบบเดิม (เก็บทุกครั้ง เหมือน 0283) ไม่ใช่ error ที่ต้องรายงาน —
 * แอปต้องใช้ได้ทั้งก่อนและหลัง migration (deploy สลับลำดับกันได้).
 */
const isMissingHashColumn = (code: string | null | undefined): boolean =>
  code === "42703" || code === "PGRST204";

type HashLookup =
  | { supported: false }
  | { supported: true; existing: UploadDedupeCandidate[] };

/**
 * แถวประวัติเดิมของ "เลขที่ใบนี้" พร้อมแฮช — วัตถุดิบของ `decideInvoiceUploadDedupe`.
 *
 * ค้นด้วย `invoice_no` เท่านั้น (ไม่ค้นด้วยแฮชตรงๆ) เพราะต้องรู้ **จำนวนเวอร์ชันที่มีอยู่**
 * ด้วย เพื่อบอกได้ว่าใบใหม่นี้คือ "แก้ไขครั้งที่เท่าไร".
 *
 * fail-soft: อ่านไม่ได้ (คอลัมน์ยังไม่มี / DB มีปัญหา) → `supported:false` = ไม่ dedupe
 * และ **ไม่ใส่ file_hash ตอน INSERT** (ผูกกันโดยตั้งใจ: ถ้าอ่านคอลัมน์ไม่ได้ ก็อย่าเขียนมัน).
 */
async function loadUploadsForDedupe(
  admin: ReturnType<typeof createAdminClient>,
  invoiceNo: string | null,
): Promise<HashLookup> {
  if (!invoiceNo) return { supported: false };
  const { data, error } = await admin
    .from(MOMO_INVOICE_UPLOAD_TABLE)
    .select("id, invoice_no, file_hash")
    .eq("invoice_no", invoiceNo)
    .order("uploaded_at", { ascending: true })
    .limit(LIST_CAP);
  if (error) {
    if (!isMissingHashColumn(error.code)) {
      console.error("[momo-invoice-history] dedupe lookup failed", { code: error.code, message: error.message });
    }
    return { supported: false };
  }
  const rows = (data ?? []) as Array<{ id: number; invoice_no: string | null; file_hash: string | null }>;
  return {
    supported: true,
    existing: rows.map((r) => ({ id: r.id, invoiceNo: r.invoice_no, fileHash: r.file_hash })),
  };
}

/** ผลตรวจ → สแนปช็อตที่เก็บลง jsonb (คัดเฉพาะช่องที่หน้าประวัติต้องใช้ · กัน jsonb บวม). */
function buildSnapshot(
  p: MomoIngestPreview,
  meta: { source: InvoiceUploadSource; supplier: string | null; invoiceDate: string | null },
): InvoiceUploadSnapshot {
  return {
    invoiceNo: p.invoiceNo,
    invoiceDate: meta.invoiceDate,
    supplier: meta.supplier,
    source: meta.source,
    grandTotal: p.grandTotal,
    subTotal: p.subTotal,
    linesTotal: p.linesTotal,
    reconciles: p.reconciles,
    cbmBasis: p.cbmBasis,
    cbmBasisReason: p.cbmBasisReason,
    whtThb: p.whtThb,
    summary: p.summary,
    reconcile: p.reconcile,
    rows: p.rows.slice(0, SNAPSHOT_ROW_CAP).map((r) => ({
      tracking: r.tracking,
      matchedTracking: r.matchedTracking,
      fid: r.fid,
      userid: r.userid,
      fcabinetnumber: r.fcabinetnumber,
      invoiceCabinet: r.invoiceCabinet,
      qty: r.qty,
      invoiceCost: r.invoiceCost,
      currentCost: r.currentCost,
      ourCbm: r.ourCbm,
      invoiceCbm: r.invoiceCbm,
      ourSell: r.ourSell,
      lossVsInvoice: r.lossVsInvoice,
      lossShortfall: r.lossShortfall,
      matched: r.matched,
      cabinetConflict: r.cabinetConflict,
      duplicateFid: r.duplicateFid,
      cabinetPaid: r.cabinetPaid,
      willApply: r.willApply,
      blockReason: r.blockReason,
      containerTruth: r.containerTruth?.message ?? null,
    })),
  };
}

/**
 * บันทึกประวัติการอัพใบวางบิล 1 ครั้ง (ไฟล์ + ผลตรวจ + ยอด).
 *
 * ตัวเรียก = หน้า invoice-cost ยิงแบบ fire-and-forget หลังพรีวิวสำเร็จ → ห้ามทำให้ flow
 * หลักล้ม: ทุก error คืน `{ ok:false }` เฉยๆ ไม่ throw. ผลตรวจที่เก็บมาจาก
 * `previewMomoInvoiceCost` ฝั่ง server ตัวเดิม (ไม่รับตัวเลขจาก client เลย).
 */
export async function recordMomoInvoiceUpload(input: unknown): Promise<AdminActionResult<RecordInvoiceUploadResult>> {
  const parsedInput = recordSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: parsedInput.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<RecordInvoiceUploadResult>([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };

    const source: InvoiceUploadSource = parsedInput.data.fileBase64 != null ? "pdf_upload" : "paste";

    // แกะข้อความของใบ **ครั้งเดียว** แล้วส่งต่อให้ preview ใช้ (ไม่ให้แกะ PDF 2 รอบ) ·
    // ต้องมีข้อความดิบไว้อ่าน "ผู้วางบิล" ซึ่ง parser ไม่ได้คืนมา
    let text: string;
    let bytes: Buffer | null = null;
    if (parsedInput.data.fileBase64 != null) {
      try {
        bytes = Buffer.from(parsedInput.data.fileBase64, "base64");
      } catch {
        return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
      }
      const ext = await extractMomoInvoicePdfText(new Uint8Array(bytes));
      if (!ext.ok) return { ok: false, error: ext.error };
      text = ext.text;
    } else {
      text = parsedInput.data.text ?? "";
    }

    const pv = await previewMomoInvoiceCost({ text });
    if (!pv.ok || !pv.data) return { ok: false, error: pv.ok ? "อ่านใบไม่สำเร็จ" : pv.error };
    const preview = pv.data;

    const invoiceDate = invoiceDateFromNo(preview.invoiceNo);
    const supplier = supplierFromInvoiceText(text);
    const admin = createAdminClient();

    // ── กันเก็บซ้ำ (owner 2026-07-30) ────────────────────────────────────
    // "ไฟล์เดียวกัน เปลืองพื้นที่ครับ … อัพมาดูได้แหละ แต่ไม่ได้เซฟ".
    // ตัดสิน **ก่อน**อัพไฟล์ขึ้น bucket โดยตั้งใจ — ถ้าอัพก่อนแล้วค่อยพบว่าซ้ำ จะเหลือ
    // ไฟล์กำพร้าลอยอยู่ใน storage (คือปัญหาเดียวกับที่ owner บ่น แค่ย้ายที่).
    const fileHash = bytes ? sha256Hex(bytes) : null;
    const lookup = await loadUploadsForDedupe(admin, preview.invoiceNo);
    const decision = decideInvoiceUploadDedupe({
      invoiceNo: preview.invoiceNo,
      fileHash: lookup.supported ? fileHash : null, // อ่านคอลัมน์ไม่ได้ = เทียบไม่ได้ → เก็บ
      existing: lookup.supported ? lookup.existing : [],
    });

    if (decision.action === "skip") {
      // ไม่เขียนแถว ไม่อัพไฟล์ — แต่ผลตรวจบนจอยังใช้ได้ปกติ (นี่คือ "ดูได้ แต่ไม่ได้เซฟ")
      return {
        ok: true,
        data: {
          id: decision.existingId,
          invoiceNo: preview.invoiceNo,
          lineCount: preview.rows.length,
          fileStored: false,
          deduped: true,
          revision: lookup.supported
            ? lookup.existing.findIndex((e) => e.id === decision.existingId) + 1
            : 1,
        },
      };
    }

    // ── เก็บไฟล์ต้นฉบับ (best-effort — เก็บไม่ได้ก็ยังบันทึกสแนปช็อต) ──
    let filePath: string | null = null;
    if (bytes) {
      const folder = (preview.invoiceNo ?? "unknown").replace(/[^\w.\-]+/g, "_");
      const path = `${PREFIX}/${folder}/${Date.now()}-${safeName(parsedInput.data.fileName)}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) console.error("[momo-invoice-history] file store failed", { message: upErr.message });
      else filePath = path;
    }

    const { data: ins, error: insErr } = await admin
      .from(MOMO_INVOICE_UPLOAD_TABLE)
      .insert({
        file_path: filePath,
        file_name: parsedInput.data.fileName ?? null,
        file_size: bytes?.length ?? null,
        // ใส่เฉพาะเมื่อรู้ว่าคอลัมน์มีจริง (mig 0284 apply แล้ว) — ไม่งั้น INSERT ทั้งก้อนจะล้ม
        // = ประวัติหายทุกใบเพียงเพราะ migration ยังไม่ลง
        ...(lookup.supported && fileHash ? { file_hash: fileHash } : {}),
        invoice_no: preview.invoiceNo,
        invoice_date: invoiceDate,
        supplier,
        source,
        line_count: preview.rows.length,
        sub_total: preview.subTotal,
        lines_total: round2(preview.linesTotal),
        reconciles: preview.reconciles,
        cbm_basis: preview.cbmBasis,
        matched_count: preview.summary.matched,
        unmatched_count: preview.summary.unmatched,
        conflict_count: preview.summary.cabinetConflicts,
        parsed_snapshot: buildSnapshot(preview, { source, supplier, invoiceDate }),
        // เก็บ auth uuid เต็ม (คอลัมน์เป็น text ไม่จำกัดความยาว) → resolve ชื่อพนักงานได้
        // ด้วยการ match ตรงๆ กับ profiles.id · ต่างจากฝั่งแพคกิ้งที่ตัด 20 ตัวแล้วต้องเดา prefix
        uploaded_by: adminId ? String(adminId) : null,
        status: "uploaded",
      })
      .select("id")
      .maybeSingle<{ id: number }>();
    if (insErr || !ins) {
      console.error("[momo-invoice-history] insert failed", { code: insErr?.code, message: insErr?.message });
      // เก็บไฟล์ขึ้นไปแล้วแต่แถวไม่เกิด = ไฟล์กำพร้าใน bucket (ไม่มีใครชี้ถึง ลบเองไม่ได้) →
      // เก็บกวาดทันที. ลบไม่สำเร็จก็แค่ log ต่อ — ห้ามกลบ error จริงของ INSERT
      if (filePath) {
        const { error: rmErr } = await admin.storage.from(BUCKET).remove([filePath]);
        if (rmErr) console.error("[momo-invoice-history] orphan cleanup failed", { filePath, message: rmErr.message });
      }
      return { ok: false, error: `บันทึกประวัติไม่สำเร็จ${insErr?.code ? ` (${insErr.code})` : ""}` };
    }

    await logAdminAction(adminId, "momo_invoice.record_upload", MOMO_INVOICE_UPLOAD_TABLE, String(ins.id), {
      invoiceNo: preview.invoiceNo,
      source,
      lines: preview.rows.length,
      linesTotal: preview.linesTotal,
      subTotal: preview.subTotal,
      reconciles: preview.reconciles,
      matched: preview.summary.matched,
      unmatched: preview.summary.unmatched,
      conflicts: preview.summary.cabinetConflicts,
      fileStored: !!filePath,
      revision: decision.revision,
    });

    return {
      ok: true,
      data: {
        id: ins.id,
        invoiceNo: preview.invoiceNo,
        lineCount: preview.rows.length,
        fileStored: !!filePath,
        deduped: false,
        revision: decision.revision,
      },
    };
  });
}

const SELECT_COLS =
  "id, file_name, file_path, file_size, invoice_no, invoice_date, supplier, source, line_count, sub_total, lines_total, reconciles, cbm_basis, matched_count, unmatched_count, conflict_count, uploaded_by, uploaded_at, applied_at, status";

type RawUploadRow = Record<string, unknown>;

function mapRow(r: RawUploadRow, uploaderName: string | null): MomoInvoiceUploadRow {
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    id: r.id as number,
    fileName: (r.file_name as string | null) ?? null,
    filePath: (r.file_path as string | null) ?? null,
    fileSize: num(r.file_size),
    invoiceNo: (r.invoice_no as string | null) ?? null,
    invoiceDate: (r.invoice_date as string | null) ?? null,
    supplier: (r.supplier as string | null) ?? null,
    source: (r.source as InvoiceUploadSource | null) ?? null,
    lineCount: num(r.line_count) ?? 0,
    subTotal: num(r.sub_total),
    linesTotal: num(r.lines_total),
    reconciles: (r.reconciles as boolean | null) ?? null,
    cbmBasis: (r.cbm_basis as string | null) ?? null,
    matchedCount: num(r.matched_count) ?? 0,
    unmatchedCount: num(r.unmatched_count) ?? 0,
    conflictCount: num(r.conflict_count) ?? 0,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    uploadedByName: uploaderName,
    uploadedAt: r.uploaded_at as string,
    appliedAt: (r.applied_at as string | null) ?? null,
    status: (r.status as string | null) ?? "uploaded",
  };
}

/** ชื่อพนักงานจาก auth uuid (uploaded_by) — match ตรงกับ profiles.id (ไม่ต้องเดา prefix). */
async function resolveUploaderNames(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;
  const { data, error } = await admin.from("profiles").select("id, first_name, last_name").in("id", uniq);
  if (error) {
    console.error("[momo-invoice-history] uploader resolve failed", { code: error.code, message: error.message });
    return out;
  }
  for (const p of (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    const name = `${(p.first_name ?? "").trim()} ${(p.last_name ?? "").trim()}`.trim();
    if (name) out.set(p.id, name);
  }
  return out;
}

const listSchema = z.object({ limit: z.number().int().positive().max(LIST_CAP).optional() }).optional();

/** ประวัติการอัพใบวางบิล — ใหม่→เก่า (สูงสุด 50). */
export async function listMomoInvoiceUploads(input?: unknown): Promise<AdminActionResult<MomoInvoiceUploadRow[]>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const limit = parsed.data?.limit ?? LIST_CAP;

  return withAdmin<MomoInvoiceUploadRow[]>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(MOMO_INVOICE_UPLOAD_TABLE)
      .select(SELECT_COLS)
      .order("uploaded_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[momo-invoice-history] list failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดประวัติไม่สำเร็จ" };
    }
    const rows = (data ?? []) as RawUploadRow[];
    const names = await resolveUploaderNames(
      admin,
      rows.map((r) => String(r.uploaded_by ?? "")),
    );
    return { ok: true, data: rows.map((r) => mapRow(r, names.get(String(r.uploaded_by ?? "").trim()) ?? null)) };
  });
}

const idSchema = z.object({ id: z.number().int().positive() });

const EMPTY_SNAPSHOT: InvoiceUploadSnapshot = {
  invoiceNo: null,
  invoiceDate: null,
  supplier: null,
  source: "paste",
  grandTotal: null,
  subTotal: null,
  linesTotal: 0,
  reconciles: false,
  cbmBasis: null,
  cbmBasisReason: "",
  whtThb: null,
  summary: {
    total: 0, matched: 0, willApply: 0, unmatched: 0, paidSkipped: 0,
    cabinetConflicts: 0, cabinetUnlinked: 0, matchedViaBase: 0, duplicateBlocked: 0,
    blocked: 0, totalMismatches: 0,
  },
  reconcile: {
    lines: 0, matchedLines: 0, unmatchedLines: 0,
    invoiceCbmAll: 0, invoiceCbm: 0, ourCbm: 0, cbmDiff: 0,
    invoiceCostAll: 0, invoiceCost: 0, unmatchedCost: 0, currentCost: 0, costDiff: 0,
    sell: 0, sellMissingLines: 0, profitNow: 0, profitAfter: 0, profitDiff: 0,
    lossLines: 0, lossAmount: 0,
  },
  rows: [],
};

/**
 * ใบหนึ่งในประวัติ — สแนปช็อตผลตรวจ "ตอนที่อัพ" (READ-ONLY · ไม่ใช่สถานะสด).
 * ไม่แกะ PDF ใหม่ · ไม่แตะระบบ.
 */
export async function getMomoInvoiceUpload(input: unknown): Promise<AdminActionResult<MomoInvoiceUploadDetail>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  return withAdmin<MomoInvoiceUploadDetail>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(MOMO_INVOICE_UPLOAD_TABLE)
      .select(`${SELECT_COLS}, parsed_snapshot`)
      .eq("id", parsed.data.id)
      .maybeSingle();
    if (error) {
      console.error("[momo-invoice-history] get failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดไม่สำเร็จ" };
    }
    if (!data) return { ok: false, error: "ไม่พบรายการ" };
    const raw = data as RawUploadRow;
    const names = await resolveUploaderNames(admin, [String(raw.uploaded_by ?? "")]);
    const snap = raw.parsed_snapshot as Partial<InvoiceUploadSnapshot> | null;
    const snapshot: InvoiceUploadSnapshot =
      snap && Array.isArray(snap.rows) ? { ...EMPTY_SNAPSHOT, ...snap } : EMPTY_SNAPSHOT;
    return {
      ok: true,
      data: { row: mapRow(raw, names.get(String(raw.uploaded_by ?? "").trim()) ?? null), snapshot },
    };
  });
}

/** ลิงก์ดาวน์โหลดไฟล์ต้นฉบับ (signed 1 ชม.) — เซ็นสดตอนกด ไม่ค้างหมดอายุ. */
export async function signMomoInvoiceUpload(input: unknown): Promise<AdminActionResult<{ url: string }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  return withAdmin<{ url: string }>([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(MOMO_INVOICE_UPLOAD_TABLE)
      .select("file_path")
      .eq("id", parsed.data.id)
      .maybeSingle<{ file_path: string | null }>();
    if (error) {
      console.error("[momo-invoice-history] sign lookup failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดไม่สำเร็จ" };
    }
    const fp = data?.file_path ?? null;
    if (!fp) return { ok: false, error: "ใบนี้ไม่มีไฟล์ต้นฉบับเก็บไว้ (อัพก่อนมีระบบประวัติ หรือเข้ามาทางวางข้อความ)" };
    const { data: signed, error: sErr } = await admin.storage.from(BUCKET).createSignedUrl(fp, 3600);
    if (sErr || !signed?.signedUrl) {
      console.error("[momo-invoice-history] sign failed", { message: sErr?.message });
      return { ok: false, error: "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ" };
    }
    return { ok: true, data: { url: signed.signedUrl } };
  });
}

/**
 * ประทับว่าใบนี้ถูกนำไป "บันทึกต้นทุน" แล้ว.
 *
 * ปกติ `applyMomoInvoiceCost` ประทับให้เองฝั่ง server (เสถียรกว่า) — ตัวนี้เป็นทางที่
 * client เรียกได้ (มี gate + audit) เผื่อกดบันทึกจากเส้นทางที่ไม่ได้ส่ง uploadId มา.
 * ประทับด้วย **id** เท่านั้น + idempotent (ดู lib/admin/momo-invoice-upload-stamp.ts).
 */
export async function markMomoInvoiceUploadApplied(input: unknown): Promise<AdminActionResult<{ stamped: boolean }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_id" };

  return withAdmin<{ stamped: boolean }>([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    const stamped = await stampMomoInvoiceUploadApplied(parsed.data.id);
    if (stamped) {
      await logAdminAction(adminId, "momo_invoice.mark_applied", MOMO_INVOICE_UPLOAD_TABLE, String(parsed.data.id), {});
    }
    return { ok: true, data: { stamped } };
  });
}

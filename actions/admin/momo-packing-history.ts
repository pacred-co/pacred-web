"use server";

/**
 * MOMO packing-list upload HISTORY + preview + reverse-check (ภูม 2026-07-14).
 *
 * Owner brief: "อัพ packing list ได้แล้ว แต่ไม่มีประวัติ + อยากพรีวิวย้อนดู +
 * เช็คว่าแทร็กที่ MOMO API ไม่มี แต่มีใน packing list". This file RECORDS every
 * upload — the original .xlsx (→ `csv-imports` bucket) + a parsed snapshot (→ instant
 * re-preview) + the reverse-check (packing trackings NOT in the MOMO API staging
 * `momo_import_tracks`).
 *
 * 🔒 ISOLATION: does NOT touch tb_forwarder / money / the apply logic in
 * momo-packing-reconcile.ts. Reads momo_import_tracks (staging) + writes ONLY the
 * new reference table momo_packing_upload + stores a file. Gated ops/super/warehouse.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoPackingXlsx } from "@/lib/admin/momo-packing-xlsx-parser";
import { computeReverseCheck, type ReverseCheck } from "@/lib/admin/momo-packing-reverse-check";

const BUCKET = "csv-imports";
const PREFIX = "momo-packing";
const RAWGRID_ROW_CAP = 3000;

const recordSchema = z.object({
  fileBase64: z.string().min(1).max(70_000_000),
  fileName: z.string().max(200).optional(),
});

/** One row's parsed packing line (kept in the snapshot for re-preview). */
export type PackingSnapshotRow = {
  baseTracking: string;
  subCount: number;
  code: string | null;
  productType: string | null;
  cg: string | null;
  boxes: number | null;
  weight: number | null;
  cbm: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
};

export type PackingUploadSnapshot = {
  listTitle: string | null;
  container: string | null;
  containerCode: string | null;
  transportHint: "SEA" | "EK" | null;
  totals: { trackingCount: number | null; qty: number | null; totalWeight: number | null; totalCbm: number | null };
  warnings: string[];
  rows: PackingSnapshotRow[];
  rawGrid?: { header: string[]; rows: (string | number | null)[][] };
};

export type MomoPackingUploadRow = {
  id: number;
  fileName: string | null;
  filePath: string | null;
  fileSize: number | null;
  containerNo: string | null;
  containerCode: string | null;
  transportHint: string | null;
  rowCount: number;
  trackingCount: number | null;
  totalWeight: number | null;
  totalCbm: number | null;
  reverseCheck: ReverseCheck;
  uploadedBy: string | null;
  /** Resolved staff display name for uploadedBy (Audit P2 · null = ระบบ/ไม่พบ). */
  uploadedByName: string | null;
  uploadedAt: string;
  appliedAt: string | null;
  status: string;
};

export type RecordUploadResult = {
  id: number;
  container: string | null;
  rowCount: number;
  reverseCheck: ReverseCheck;
  fileStored: boolean;
};

const safeName = (n: string | undefined) =>
  (n && n.trim() ? n : "packing.xlsx").replace(/[^\w.\-]+/g, "_").slice(0, 120);

/**
 * Parse + reverse-check + store an uploaded packing list, then record it in the
 * history table. Read-only vs money (never writes tb_forwarder). Idempotent per
 * upload (each call = one history row · the same file can be uploaded again).
 */
export async function recordMomoPackingUpload(input: unknown): Promise<AdminActionResult<RecordUploadResult>> {
  const parsedInput = recordSchema.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: parsedInput.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin<RecordUploadResult>(["ops", "super", "warehouse"], async ({ adminId }) => {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(parsedInput.data.fileBase64, "base64");
    } catch {
      return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
    }

    const parsed = parseMomoPackingXlsx(new Uint8Array(bytes));
    const admin = createAdminClient();

    // ── reverse-check vs the MOMO API staging (momo_import_tracks) ──
    // candidates = every base + sub tracking the packing list carries.
    const candidates = Array.from(
      new Set([
        ...parsed.aggregated.map((a) => a.baseTracking),
        ...parsed.rows.map((r) => r.tracking),
      ].filter(Boolean) as string[]),
    );
    const apiTrackings: string[] = [];
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500);
      const { data, error } = await admin
        .from("momo_import_tracks")
        .select("momo_tracking_no")
        .in("momo_tracking_no", chunk);
      if (error) {
        console.error("[momo-packing-history] staging lookup failed", { code: error.code, message: error.message });
        break; // reverse-check degrades gracefully (fewer 'present') — never fail the record
      }
      for (const r of (data ?? []) as { momo_tracking_no: string | null }[]) {
        if (r.momo_tracking_no) apiTrackings.push(r.momo_tracking_no);
      }
    }
    const reverseCheck = computeReverseCheck(
      parsed.aggregated.map((a) => a.baseTracking),
      apiTrackings,
    );

    // ── store the original file (best-effort — a store fail still records the snapshot) ──
    const fileName = safeName(parsedInput.data.fileName);
    const path = `${PREFIX}/${(parsed.container ?? "unknown").replace(/[^\w.\-]+/g, "_")}/${Date.now()}-${fileName}`;
    let filePath: string | null = null;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    if (upErr) console.error("[momo-packing-history] file store failed", { message: upErr.message });
    else filePath = path;

    // ── snapshot for instant re-preview ──
    const snapshot: PackingUploadSnapshot = {
      listTitle: parsed.listTitle,
      container: parsed.container,
      containerCode: parsed.containerCode,
      transportHint: parsed.transportHint,
      totals: parsed.totals,
      warnings: parsed.warnings,
      rows: parsed.aggregated.map((a) => ({
        baseTracking: a.baseTracking,
        subCount: a.subTrackings.length,
        code: a.code,
        productType: a.productType,
        cg: a.cg,
        boxes: a.parcelCount,
        weight: a.totalWeight,
        cbm: a.totalCbm,
        width: a.width,
        length: a.length,
        height: a.height,
      })),
      rawGrid: parsed.rawGrid
        ? { header: parsed.rawGrid.header, rows: parsed.rawGrid.rows.slice(0, RAWGRID_ROW_CAP) }
        : undefined,
    };

    const { data: ins, error: insErr } = await admin
      .from("momo_packing_upload")
      .insert({
        file_path: filePath,
        file_name: parsedInput.data.fileName ?? null,
        file_size: bytes.length,
        container_no: parsed.container,
        container_code: parsed.containerCode,
        transport_hint: parsed.transportHint,
        row_count: parsed.aggregated.length,
        tracking_count: parsed.totals.trackingCount,
        total_boxes: parsed.totals.qty,
        total_weight: parsed.totals.totalWeight,
        total_cbm: parsed.totals.totalCbm,
        parsed_snapshot: snapshot,
        reverse_check: reverseCheck,
        uploaded_by: adminId ? String(adminId).slice(0, 20) : null,
        status: "uploaded",
      })
      .select("id")
      .maybeSingle<{ id: number }>();
    if (insErr || !ins) {
      console.error("[momo-packing-history] insert failed", { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `บันทึกประวัติไม่สำเร็จ${insErr?.code ? ` (${insErr.code})` : ""}` };
    }

    await logAdminAction(adminId, "momo_packing.record", "momo_packing_upload", String(ins.id), {
      container: parsed.container,
      rowCount: parsed.aggregated.length,
      reverseMissing: reverseCheck.missing.length,
      fileStored: !!filePath,
    });

    return { ok: true, data: { id: ins.id, container: parsed.container, rowCount: parsed.aggregated.length, reverseCheck, fileStored: !!filePath } };
  });
}

/** List recent packing-list uploads (optionally filtered to one container). */
export async function listMomoPackingUploads(containerNo?: string): Promise<AdminActionResult<MomoPackingUploadRow[]>> {
  return withAdmin<MomoPackingUploadRow[]>(["ops", "super", "warehouse"], async () => {
    const admin = createAdminClient();
    let q = admin
      .from("momo_packing_upload")
      .select("id, file_name, file_path, file_size, container_no, container_code, transport_hint, row_count, tracking_count, total_weight, total_cbm, reverse_check, uploaded_by, uploaded_at, applied_at, status")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    if (containerNo && containerNo.trim()) q = q.eq("container_no", containerNo.trim());
    const { data, error } = await q;
    if (error) {
      console.error("[momo-packing-history] list failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดประวัติไม่สำเร็จ" };
    }
    // Audit P2 — resolve uploaded_by (an admin id) → a staff display name.
    // uploaded_by is stored as the legacy adminid; profiles.employee_code carries
    // the same code for staff. Batch-resolve, fall back to the raw id.
    const uploaderIds = Array.from(
      new Set(((data ?? []) as Array<{ uploaded_by: string | null }>).map((r) => (r.uploaded_by ?? "").trim()).filter(Boolean)),
    );
    // uploaded_by is the admin's auth UUID TRUNCATED to 20 chars (momo-packing-
    // history.ts INSERT). Resolve by PREFIX-matching profiles.id — 20 uuid chars are
    // unique enough. Fetch the small staff set once (admins) + prefix-match locally.
    const nameById = new Map<string, string>();
    if (uploaderIds.length > 0) {
      const { data: profs, error: pErr } = await admin
        .from("profiles")
        .select("id, first_name, last_name")
        .not("employee_code", "is", null)
        .limit(2000);
      if (pErr) console.error("[momo-packing-history] uploader resolve failed", { code: pErr.code, message: pErr.message });
      const staff = (profs ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>;
      for (const up of uploaderIds) {
        const hit = staff.find((s) => (s.id ?? "").startsWith(up));
        if (hit) nameById.set(up, `${(hit.first_name ?? "").trim()} ${(hit.last_name ?? "").trim()}`.trim() || up);
      }
    }
    const rows: MomoPackingUploadRow[] = (data ?? []).map((r) => {
      const upBy = (r.uploaded_by as string | null) ?? null;
      return {
        id: r.id as number,
        fileName: (r.file_name as string | null) ?? null,
        filePath: (r.file_path as string | null) ?? null,
        fileSize: (r.file_size as number | null) ?? null,
        containerNo: (r.container_no as string | null) ?? null,
        containerCode: (r.container_code as string | null) ?? null,
        transportHint: (r.transport_hint as string | null) ?? null,
        rowCount: (r.row_count as number | null) ?? 0,
        trackingCount: (r.tracking_count as number | null) ?? null,
        totalWeight: (r.total_weight as number | null) ?? null,
        totalCbm: (r.total_cbm as number | null) ?? null,
        reverseCheck: normalizeReverse(r.reverse_check),
        uploadedBy: upBy,
        uploadedByName: upBy ? (nameById.get(upBy.trim()) ?? null) : null,
        uploadedAt: r.uploaded_at as string,
        appliedAt: (r.applied_at as string | null) ?? null,
        status: (r.status as string | null) ?? "uploaded",
      };
    });
    return { ok: true, data: rows };
  });
}

export type MomoPackingUploadDetail = {
  row: MomoPackingUploadRow;
  snapshot: PackingUploadSnapshot;
  downloadUrl: string | null;
};

/** One upload — the parsed snapshot (re-preview) + a fresh signed download URL. */
export async function getMomoPackingUpload(id: number): Promise<AdminActionResult<MomoPackingUploadDetail>> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid_id" };
  return withAdmin<MomoPackingUploadDetail>(["ops", "super", "warehouse"], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("momo_packing_upload")
      .select("id, file_name, file_path, file_size, container_no, container_code, transport_hint, row_count, tracking_count, total_weight, total_cbm, parsed_snapshot, reverse_check, uploaded_by, uploaded_at, applied_at, status")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[momo-packing-history] get failed", { code: error.code, message: error.message });
      return { ok: false, error: "โหลดไม่สำเร็จ" };
    }
    if (!data) return { ok: false, error: "ไม่พบรายการ" };

    let downloadUrl: string | null = null;
    const fp = data.file_path as string | null;
    if (fp) {
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(fp, 600);
      downloadUrl = signed?.signedUrl ?? null;
    }
    const row: MomoPackingUploadRow = {
      id: data.id as number,
      fileName: (data.file_name as string | null) ?? null,
      filePath: fp,
      fileSize: (data.file_size as number | null) ?? null,
      containerNo: (data.container_no as string | null) ?? null,
      containerCode: (data.container_code as string | null) ?? null,
      transportHint: (data.transport_hint as string | null) ?? null,
      rowCount: (data.row_count as number | null) ?? 0,
      trackingCount: (data.tracking_count as number | null) ?? null,
      totalWeight: (data.total_weight as number | null) ?? null,
      totalCbm: (data.total_cbm as number | null) ?? null,
      reverseCheck: normalizeReverse(data.reverse_check),
      uploadedBy: (data.uploaded_by as string | null) ?? null,
      uploadedByName: null,
      uploadedAt: data.uploaded_at as string,
      appliedAt: (data.applied_at as string | null) ?? null,
      status: (data.status as string | null) ?? "uploaded",
    };
    const snapshot = (data.parsed_snapshot as PackingUploadSnapshot) ?? {
      listTitle: null, container: null, containerCode: null, transportHint: null,
      totals: { trackingCount: null, qty: null, totalWeight: null, totalCbm: null },
      warnings: [], rows: [],
    };
    return { ok: true, data: { row, snapshot, downloadUrl } };
  });
}

function normalizeReverse(v: unknown): ReverseCheck {
  const o = (v ?? {}) as Partial<ReverseCheck>;
  return {
    checked: typeof o.checked === "number" ? o.checked : 0,
    present: typeof o.present === "number" ? o.present : 0,
    missing: Array.isArray(o.missing) ? o.missing.filter((m): m is string => typeof m === "string") : [],
  };
}

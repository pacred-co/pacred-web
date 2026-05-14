"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Papa from "papaparse";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sweepStaleImportingRows } from "@/lib/admin/csv-import-sweep";
import { logger } from "@/lib/logger";

/**
 * Admin CSV bulk import actions (P-19).
 *
 * Lifecycle:
 *   uploadCsv → parsePreviewCsvImport → confirmCsvImport
 *
 * Target tables (extensible): currently only 'forwarders'.
 * CSV column convention: first row = header matching DB column names.
 * Required columns for forwarders import:
 *   profile_id (uuid), source_warehouse, transport_type, product_type
 * Optional: weight_kg, volume_cbm, total_price, tracking_china, ...
 *
 * Storage: 'csv-imports' bucket (admin-only RLS, see migration 0029).
 * Folder convention: {admin_uuid}/{timestamp}.csv
 */

const ALLOWED_TARGETS = ["forwarders"] as const;
type TargetTable = (typeof ALLOWED_TARGETS)[number];

const MAX_SIZE   = 5 * 1024 * 1024;                              // 5 MB cap
const MAX_PREVIEW_ROWS = 5;
const MAX_IMPORT_ROWS  = 1000;                                   // safety: prevent multi-MB imports in one go
// P-19-followup-stale: sweep impl moved to lib/admin/csv-import-sweep.ts
// so admin pages (server components, no "use server" directive) can call
// it too without violating the action-only export contract here.

// ────────────────────────────────────────────────────────────
// 1. UPLOAD CSV
// ────────────────────────────────────────────────────────────
export async function uploadCsv(
  formData: FormData,
): Promise<AdminActionResult<{ id: string }>> {
  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const file       = formData.get("file");
    const targetRaw  = String(formData.get("target_table") ?? "");

    if (!file || !(file instanceof File)) {
      return { ok: false, error: "no_file" };
    }
    if (!ALLOWED_TARGETS.includes(targetRaw as TargetTable)) {
      return { ok: false, error: "invalid_target_table" };
    }
    if (file.size > MAX_SIZE) {
      return { ok: false, error: "file_too_large" };
    }
    if (
      file.type !== "text/csv" &&
      file.type !== "application/vnd.ms-excel" &&  // some browsers tag .csv as this
      !file.name.toLowerCase().endsWith(".csv")
    ) {
      return { ok: false, error: "not_a_csv" };
    }

    const target  = targetRaw as TargetTable;
    const ts      = Date.now();
    const safeNm  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-50);
    const path    = `${adminId}/${ts}_${safeNm}`;
    const buffer  = Buffer.from(await file.arrayBuffer());

    const admin = createAdminClient();

    // Upload file
    const { error: uploadErr } = await admin.storage
      .from("csv-imports")
      .upload(path, buffer, {
        contentType: file.type || "text/csv",
        upsert: false,
      });
    if (uploadErr) {
      // Translate the most common infra error into actionable language —
      // "Bucket not found" = migration 0029_csv_imports.sql hasn't been
      // run on this Supabase project yet.
      const msg = uploadErr.message || "";
      if (/bucket\s*not\s*found/i.test(msg)) {
        return {
          ok: false,
          error:
            "Storage bucket 'csv-imports' ยังไม่มีในโปรเจค Supabase นี้ — กรุณารัน migration `0029_csv_imports.sql` ใน SQL Editor ก่อนใช้งาน (ดู supabase/migrations/README.md)",
        };
      }
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    // Insert staging row
    const { data: row, error: insertErr } = await admin
      .from("csv_imports")
      .insert({
        uploader_id:  adminId,
        filename:     file.name,
        storage_path: path,
        target_table: target,
        size_bytes:   file.size,
        mime_type:    file.type || "text/csv",
        status:       "uploaded",
      })
      .select("id")
      .single<{ id: string }>();

    if (insertErr || !row) {
      // Best-effort cleanup of orphaned file
      await admin.storage.from("csv-imports").remove([path]);
      return { ok: false, error: insertErr?.message ?? "insert_failed" };
    }

    await logAdminAction(adminId, "csv_import.upload", "csv_import", row.id, {
      filename:     file.name,
      target_table: target,
      size_bytes:   file.size,
    });

    revalidatePath("/admin/csv-imports");
    return { ok: true, data: { id: row.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2. PARSE PREVIEW (first 5 rows)
// ────────────────────────────────────────────────────────────
const idSchema = z.object({ id: z.string().uuid() });

export async function parsePreviewCsvImport(
  input: z.infer<typeof idSchema>,
): Promise<AdminActionResult<{ row_count: number; preview_rows: Record<string, string>[] }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const text  = await downloadCsvText(admin, parsed.data.id);
    if (!text.ok) return text;

    const result = Papa.parse<Record<string, string>>(text.data, {
      header:           true,
      skipEmptyLines:   true,
      dynamicTyping:    false,                         // keep all values as strings; DB will coerce
    });

    if (result.errors && result.errors.length > 0) {
      const firstErr = result.errors[0];
      await admin
        .from("csv_imports")
        .update({
          status:        "failed",
          error_message: `CSV parse error at row ${firstErr.row}: ${firstErr.message}`,
        })
        .eq("id", parsed.data.id);
      return { ok: false, error: `parse_error: ${firstErr.message}` };
    }

    const rows         = result.data;
    const preview_rows = rows.slice(0, MAX_PREVIEW_ROWS);

    const { error: updErr } = await admin
      .from("csv_imports")
      .update({
        status:       "previewed",
        row_count:    rows.length,
        preview_rows: preview_rows,
      })
      .eq("id", parsed.data.id);

    if (updErr) return { ok: false, error: updErr.message };

    await logAdminAction(adminId, "csv_import.preview", "csv_import", parsed.data.id, {
      row_count: rows.length,
    });

    revalidatePath(`/admin/csv-imports/${parsed.data.id}`);
    return { ok: true, data: { row_count: rows.length, preview_rows } };
  });
}

// ────────────────────────────────────────────────────────────
// 3. CONFIRM IMPORT (parse full + insert to target table)
// ────────────────────────────────────────────────────────────
export async function confirmCsvImport(
  input: z.infer<typeof idSchema>,
): Promise<AdminActionResult<{ imported: number; skipped: number }>> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Recover any stuck 'importing' rows before we check status, so a
    // crashed previous attempt by the same admin doesn't permanently
    // block the row.  See P-19-followup-stale + migration 0032.
    await sweepStaleImportingRows(admin);

    const { data: meta } = await admin
      .from("csv_imports")
      .select("id, status, target_table")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; status: string; target_table: TargetTable }>();
    if (!meta) return { ok: false, error: "not_found" };
    if (meta.status === "imported") return { ok: false, error: "already_imported" };
    if (meta.status === "importing") return { ok: false, error: "import_in_progress" };

    // Mark as in-progress before heavy work.  started_at lets the
    // sweepStaleImportingRows reaper recover this row if the process
    // crashes mid-insert (P-19-followup-stale).
    await admin
      .from("csv_imports")
      .update({ status: "importing", started_at: new Date().toISOString() })
      .eq("id", meta.id);

    const text = await downloadCsvText(admin, meta.id);
    if (!text.ok) {
      await admin
        .from("csv_imports")
        .update({ status: "failed", error_message: text.error })
        .eq("id", meta.id);
      return text;
    }

    const result = Papa.parse<Record<string, string>>(text.data, {
      header:         true,
      skipEmptyLines: true,
      dynamicTyping:  false,
    });

    const allRows = result.data;
    if (allRows.length === 0) {
      await admin
        .from("csv_imports")
        .update({ status: "failed", error_message: "no_rows_in_csv" })
        .eq("id", meta.id);
      return { ok: false, error: "no_rows_in_csv" };
    }
    if (allRows.length > MAX_IMPORT_ROWS) {
      await admin
        .from("csv_imports")
        .update({
          status:        "failed",
          error_message: `too_many_rows: ${allRows.length} > ${MAX_IMPORT_ROWS}`,
        })
        .eq("id", meta.id);
      return { ok: false, error: `too_many_rows_${MAX_IMPORT_ROWS}_max` };
    }

    let imported = 0;
    let skipped  = 0;
    let lastError: string | null = null;

    if (meta.target_table === "forwarders") {
      // P-19-followup-batch: 2-pass approach.
      //   Pass 1: validate every row + collect valid payloads.  Skipped
      //           rows (missing/invalid required fields) never hit DB.
      //   Pass 2: chunk-insert valid payloads in batches of 100.
      //
      // Why 100/batch: balances roundtrip overhead vs Supabase request
      // size limit (~1MB body) and Postgres prepared-statement param
      // ceiling (~65535 / cols-per-row).  For ~10 forwarder columns,
      // 100 rows ≈ 1000 params — comfortably under both ceilings.
      //
      // Required: profile_id, source_warehouse, transport_type, product_type.
      // Everything else is best-effort optional.
      const num = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };

      type ForwarderRow = {
        profile_id: string;
        source_warehouse: string;
        transport_type: string;
        product_type: string;
        weight_kg?: number;
        volume_cbm?: number;
        total_price?: number;
        tracking_china?: string;
        note?: string;
      };

      const validPayloads: ForwarderRow[] = [];
      for (const r of allRows) {
        const profile_id = String(r.profile_id ?? "").trim();
        if (!profile_id) { skipped++; continue; }

        const source_warehouse = String(r.source_warehouse ?? "").trim().toLowerCase();
        const transport_type   = String(r.transport_type   ?? "").trim().toLowerCase();
        const product_type     = String(r.product_type     ?? "general").trim().toLowerCase();

        if (!["guangzhou", "yiwu"].includes(source_warehouse))   { skipped++; continue; }
        if (!["truck", "ship", "air"].includes(transport_type))  { skipped++; continue; }
        if (!["general", "tisi", "fda", "special"].includes(product_type)) { skipped++; continue; }

        const payload: ForwarderRow = {
          profile_id,
          source_warehouse,
          transport_type,
          product_type,
        };
        if (r.weight_kg !== undefined)   payload.weight_kg      = num(r.weight_kg)   ?? 0;
        if (r.volume_cbm !== undefined)  payload.volume_cbm     = num(r.volume_cbm)  ?? 0;
        if (r.total_price !== undefined) payload.total_price    = num(r.total_price) ?? 0;
        if (r.tracking_china)            payload.tracking_china = String(r.tracking_china).trim();
        if (r.note)                      payload.note           = String(r.note).trim();

        validPayloads.push(payload);
      }

      // Chunk-insert.  On chunk failure: count the whole chunk as
      // skipped + remember last error.  We don't fall back to per-row
      // because the most likely chunk-failure causes (FK violation on
      // profile_id, NOT NULL on a column we forgot) would just produce
      // N more identical errors per row — pointless.
      const CHUNK = 100;
      for (let i = 0; i < validPayloads.length; i += CHUNK) {
        const slice = validPayloads.slice(i, i + CHUNK);
        const { error } = await admin.from("forwarders").insert(slice);
        if (error) {
          lastError = error.message;
          skipped += slice.length;
        } else {
          imported += slice.length;
        }
      }
    } else {
      await admin
        .from("csv_imports")
        .update({ status: "failed", error_message: `unsupported_target: ${meta.target_table}` })
        .eq("id", meta.id);
      return { ok: false, error: "unsupported_target_table" };
    }

    const finalStatus = imported > 0 ? "imported" : "failed";
    await admin
      .from("csv_imports")
      .update({
        status:         finalStatus,
        imported_count: imported,
        imported_at:    new Date().toISOString(),
        error_message:  lastError && imported === 0 ? `all_failed: ${lastError}` : null,
      })
      .eq("id", meta.id);

    await logAdminAction(adminId, "csv_import.confirm", "csv_import", meta.id, {
      target_table: meta.target_table,
      imported,
      skipped,
    });

    logger.info("admin.csv_import.confirm", "import done", {
      id: meta.id,
      target: meta.target_table,
      imported,
      skipped,
    });

    revalidatePath("/admin/csv-imports");
    revalidatePath(`/admin/csv-imports/${meta.id}`);
    revalidatePath(`/admin/${meta.target_table}`);

    return { ok: true, data: { imported, skipped } };
  });
}

// ────────────────────────────────────────────────────────────
// 4. DELETE (file + row)
// ────────────────────────────────────────────────────────────
export async function deleteCsvImport(
  input: z.infer<typeof idSchema>,
): Promise<AdminActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: meta } = await admin
      .from("csv_imports")
      .select("id, storage_path, status")
      .eq("id", parsed.data.id)
      .maybeSingle<{ id: string; storage_path: string; status: string }>();
    if (!meta) return { ok: false, error: "not_found" };
    if (meta.status === "importing") return { ok: false, error: "cannot_delete_while_importing" };

    await admin.storage.from("csv-imports").remove([meta.storage_path]);
    const { error } = await admin.from("csv_imports").delete().eq("id", meta.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "csv_import.delete", "csv_import", meta.id, {
      storage_path: meta.storage_path,
    });

    revalidatePath("/admin/csv-imports");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Internal helper — download CSV text from storage
// ────────────────────────────────────────────────────────────
async function downloadCsvText(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  const { data: meta } = await admin
    .from("csv_imports")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle<{ storage_path: string }>();
  if (!meta) return { ok: false, error: "not_found" };

  const { data: blob, error } = await admin.storage
    .from("csv-imports")
    .download(meta.storage_path);
  if (error || !blob) return { ok: false, error: error?.message ?? "download_failed" };

  const text = await blob.text();
  return { ok: true, data: text };
}

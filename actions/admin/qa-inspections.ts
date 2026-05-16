"use server";

/**
 * QA/QC inspection admin actions — V-E10.
 *
 * Per port-spec [docs/port-specs/freight-qa-qc-inspection.md].
 *
 * V1 admin surface area:
 *   - createQaInspection — record inspection (with photo upload + optional notify)
 *   - updateQaInspectionNotes — limited mutation (outcome is immutable; record a
 *     new inspection for re-checks)
 *   - uploadQaPhoto helper — admin-side multi-part upload to bucket
 *
 * Outcome lifecycle:
 *   pass        → billing unlocked
 *   fail_minor  → billing unlocked + customer notified
 *   fail_major  → billing BLOCKED until super does corrective action / waives
 *   waived      → billing unlocked + super-only override + reason
 *
 * Gate is consumed by V-E7 freight_invoices issuance (when V-E7 ships).
 *
 * V1 cargo-only — freight_shipment_id reserved nullable until V-E1 ships.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import {
  createQaInspectionSchema, type CreateQaInspectionInput,
  updateQaInspectionSchema, type UpdateQaInspectionInput,
} from "@/lib/validators/qa-inspection";

// ────────────────────────────────────────────────────────────
// 1) Create QA inspection
// ────────────────────────────────────────────────────────────

type CreateResult = {
  id:             string;
  inspection_no:  string;
};

export async function createQaInspection(
  input: CreateQaInspectionInput,
): Promise<AdminActionResult<CreateResult>> {
  const parsed = createQaInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // V1 — freight side not implemented yet.
  if (d.freight_shipment_id) {
    return { ok: false, error: "freight_side_not_implemented_v1" };
  }
  if (!d.cargo_shipment_id) {
    return { ok: false, error: "cargo_shipment_id_required" };
  }

  // Waived outcome → super-only (extra check beyond withAdmin role list).
  // We accept warehouse/super/accounting for general create, but require super
  // when the outcome is `waived`. The simplest split: warehouse role can record
  // pass / fail_*; waive needs super (or accounting per chat-derived waiver
  // pattern from ADR-0015 Q3 — keep symmetric across modules).
  const allowedRoles = d.outcome === "waived"
    ? (["super"] as const)
    : (["super", "accounting", "warehouse"] as const);

  return withAdmin([...allowedRoles], async ({ adminId }) => {
    const admin = createAdminClient();

    // Look up shipment → profile_id (for customer notification).
    const { data: shipment, error: shErr } = await admin
      .from("cargo_shipments")
      .select("id, profile_id, shipment_code, status")
      .eq("id", d.cargo_shipment_id!)
      .maybeSingle<{
        id:             string;
        profile_id:     string;
        shipment_code:  string;
        status:         string;
      }>();
    if (shErr)    return { ok: false, error: shErr.message };
    if (!shipment) return { ok: false, error: "shipment_not_found" };

    // Reserve serial.
    const { data: inspectionNo, error: rpcErr } = await admin.rpc("next_qa_inspection_no");
    if (rpcErr || !inspectionNo || typeof inspectionNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${rpcErr?.message ?? "rpc returned non-string"}` };
    }

    const now = new Date().toISOString();
    const isWaived = d.outcome === "waived";

    const insertPayload = {
      cargo_shipment_id:     d.cargo_shipment_id,
      freight_shipment_id:   null,                    // V1
      inspection_no:         inspectionNo,
      inspected_by_admin_id: adminId,
      inspected_at:          now,
      outcome:               d.outcome,
      damage_level:          d.damage_level ?? null,
      missing_items:         d.missing_items ?? 0,
      notes:                 d.notes ?? null,
      photo_paths:           [] as string[],          // caller uploads + updates after
      waived_reason:         isWaived ? d.waived_reason : null,
      waived_by_admin_id:    isWaived ? adminId       : null,
      waived_at:             isWaived ? now           : null,
    };

    const { data: inserted, error: insErr } = await admin
      .from("freight_qa_inspections")
      .insert(insertPayload)
      .select("id, inspection_no")
      .single<{ id: string; inspection_no: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "qa_inspection.create", "qa_inspection", inserted.id, {
      inspection_no:     inspectionNo,
      cargo_shipment_id: d.cargo_shipment_id,
      shipment_code:     shipment.shipment_code,
      outcome:           d.outcome,
      damage_level:      d.damage_level ?? null,
      missing_items:     d.missing_items ?? 0,
      waived_reason:     isWaived ? d.waived_reason : null,
    });

    // Notify customer when outcome is fail_minor / fail_major.
    // (Notification template may not exist yet — wrap in try/catch defensively.)
    if (d.outcome === "fail_minor" || d.outcome === "fail_major") {
      try {
        await sendNotification(
          shipment.profile_id,
          notify.qaFailed({
            shipmentCode: shipment.shipment_code,
            inspectionNo: inspectionNo,
            outcome:      d.outcome,
            notes:        d.notes ?? "",
          }),
        );
        // Record notification timestamp.
        await admin
          .from("freight_qa_inspections")
          .update({ customer_notified_at: new Date().toISOString() })
          .eq("id", inserted.id);
      } catch (e) {
        // Soft-fail — inspection already recorded; admin can resend notification
        // manually if needed.
        await logAdminAction(adminId, "qa_inspection.notify_failed", "qa_inspection", inserted.id, {
          error: (e as Error).message ?? "unknown",
        });
      }
    }

    revalidatePath("/admin/warehouse/qa-inspections");
    revalidatePath(`/admin/warehouse/qa-inspections/${inserted.id}`);
    revalidatePath(`/shipments/${shipment.shipment_code}`);

    return { ok: true, data: { id: inserted.id, inspection_no: inserted.inspection_no } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update inspection notes (immutable outcome)
// ────────────────────────────────────────────────────────────

export async function updateQaInspectionNotes(
  input: UpdateQaInspectionInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateQaInspectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error: updErr } = await admin
      .from("freight_qa_inspections")
      .update({ notes: d.notes ?? null })
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "qa_inspection.update_notes", "qa_inspection", d.id, {
      notes_length: (d.notes ?? "").length,
    });

    revalidatePath(`/admin/warehouse/qa-inspections/${d.id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Upload QA photo
// ────────────────────────────────────────────────────────────

export async function uploadQaPhoto(
  inspectionId: string,
  file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!inspectionId || typeof inspectionId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }

  return withAdmin(["super", "accounting", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Look up inspection → cargo_shipment_id (for storage folder).
    const { data: row, error: readErr } = await admin
      .from("freight_qa_inspections")
      .select("id, cargo_shipment_id, photo_paths")
      .eq("id", inspectionId)
      .maybeSingle<{
        id:                string;
        cargo_shipment_id: string | null;
        photo_paths:       string[] | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (!row.cargo_shipment_id) {
      return { ok: false, error: "no_cargo_shipment_link" };
    }

    const ext   = inferImageExtension(file);
    const stamp = photoTimestamp();
    const path  = `${row.cargo_shipment_id}/${inspectionId}/photo-${stamp}${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("qa-inspection-photos")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert:      false,
      });
    if (uploadErr) {
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    // Append the new path to the photo_paths array. We use a server-side
    // read-modify-write — concurrent uploads are rare enough that we can
    // tolerate the small race window (DB-level array_append would be nicer
    // but requires raw SQL).
    const nextPaths = [...(row.photo_paths ?? []), path];
    const { error: updErr } = await admin
      .from("freight_qa_inspections")
      .update({ photo_paths: nextPaths })
      .eq("id", inspectionId);
    if (updErr) {
      // The file is uploaded but the array wasn't appended — log so admin
      // can recover manually. Don't fail the action — the file does exist.
      await logAdminAction(adminId, "qa_inspection.photo_path_append_failed", "qa_inspection", inspectionId, {
        storage_path: path,
        error:        updErr.message,
      });
    }

    await logAdminAction(adminId, "qa_inspection.photo_upload", "qa_inspection", inspectionId, {
      storage_path: path,
      filename:     file.name,
      size_bytes:   file.size,
    });

    revalidatePath(`/admin/warehouse/qa-inspections/${inspectionId}`);
    return { ok: true, data: { storage_path: path } };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Module-scope timestamp helper — React Compiler `react-hooks/purity` rule
 * flags Date.now() inside components. Same pattern as wht.ts.
 */
function photoTimestamp(): string {
  return String(Date.now());
}

function inferImageExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                           return ".png";
  if (name.endsWith(".webp"))                          return ".webp";
  if (name.endsWith(".heic"))                          return ".heic";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("png"))                       return ".png";
  if (t.includes("webp"))                      return ".webp";
  if (t.includes("heic"))                      return ".heic";
  return ".bin";
}

// ────────────────────────────────────────────────────────────
// 4) READ helper for V-E7 billing gate consumer
// ────────────────────────────────────────────────────────────

/**
 * Returns true if a cargo_shipment is cleared for billing per QA gate:
 *   - At least one inspection exists with outcome in {pass, fail_minor, waived}
 *
 * fail_major or no inspection at all → false (billing must be blocked).
 *
 * V-E7 (when shipped) will call this from adminCreateFreightInvoice.
 */
export async function isCargoShipmentQaPassed(
  cargo_shipment_id: string,
): Promise<boolean> {
  if (!cargo_shipment_id) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("freight_qa_inspections")
    .select("id, outcome")
    .eq("cargo_shipment_id", cargo_shipment_id)
    .in("outcome", ["pass", "fail_minor", "waived"])
    .limit(1)
    .maybeSingle<{ id: string; outcome: string }>();
  if (error) return false;
  return !!data;
}

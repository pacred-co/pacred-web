"use server";

/**
 * V-A6.1 — Customer-side WHT cert upload.
 *
 * Per ADR-0015 Q2 — V1.1 customer self-upload of the หนังสือรับรองหัก
 * ณ ที่จ่าย (50 ทวิ).
 *
 * V1 (commit e95c0bc) shipped admin-only upload. V1.1 (this) opens the
 * upload to the customer themselves — closes the WHT loop so juristic
 * customers can self-serve.
 *
 * Flow:
 *   1. Admin creates withholding_tax_entries row (cert_status='pending')
 *      via admin panel on /admin/tax-invoices/[id]
 *   2. Customer sees WHT banner on their receipt page (/service-(order|
 *      import)/[id]/receipt) — already shipped in V-A6
 *   3. NEW V-A6.1: customer sees "อัพโหลดใบ 50 ทวิ" button on receipt
 *      page when cert_status='pending' + row belongs to them
 *   4. Customer uploads PDF/JPG → this action verifies ownership via
 *      RLS-scoped SELECT (profile_id = auth.uid()), uploads via admin
 *      client, flips cert_status to 'received'
 *   5. Admin can later override via /admin/tax-invoices/[id] WHT panel
 *      if customer uploaded wrong cert (V-A6 admin flow still works)
 *
 * Security:
 *   - RLS-scoped SELECT verifies customer owns the WHT row before write
 *   - Upload uses admin client because customer doesn't have direct
 *     Storage write permission (per 0044 RLS — no INSERT policy for users)
 *   - File size + MIME type validated (10 MB ceiling, PDF/JPG/PNG only)
 *
 * Audit: writes admin_audit_log row with customer's profile_id as the
 * "admin_id" — slight abuse but the audit log table doesn't have a
 * separate customer-actor field. The action string 'wht.customer_cert_upload'
 * makes it grep-able. Future migration could add actor_type column.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, redactId } from "@/lib/logger";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Customer uploads their 50 ทวิ certificate for an OWN WHT entry.
 *
 * @param whtEntryId   uuid of the withholding_tax_entries row
 * @param file         PDF / JPG / PNG (≤10 MB)
 * @param certNumber   Optional 50 ทวิ running no. printed on the cert
 */
export async function customerUploadWhtCert(
  whtEntryId: string,
  file: File,
  certNumber?: string,
): Promise<ActionResult<{ storage_path: string; received_at: string }>> {
  if (!whtEntryId || typeof whtEntryId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }

  // MIME validation — only accept PDF + common image formats.
  const validMimes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  const mime = (file.type ?? "").toLowerCase();
  if (mime && !validMimes.includes(mime)) {
    return { ok: false, error: "invalid_mime_type" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // 1. RLS-scoped SELECT verifies the customer owns this WHT entry.
  //    (withholding_tax_entries RLS allows SELECT when profile_id = auth.uid())
  const { data: row, error: readErr } = await supabase
    .from("withholding_tax_entries")
    .select("id, profile_id, cert_status, order_h_no, forwarder_f_no")
    .eq("id", whtEntryId)
    .maybeSingle<{
      id:             string;
      profile_id:     string;
      cert_status:    "pending" | "received" | "waived";
      order_h_no:     string | null;
      forwarder_f_no: string | null;
    }>();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row)    return { ok: false, error: "not_found_or_unauthorised" };
  // Defense-in-depth: RLS already filters, but re-check explicitly.
  if (row.profile_id !== user.id) {
    return { ok: false, error: "not_owner" };
  }
  if (row.cert_status === "received") return { ok: false, error: "already_received" };
  if (row.cert_status === "waived")   return { ok: false, error: "already_waived" };

  // 2. Upload via admin client (Storage RLS only allows admin/service_role writes).
  const admin = createAdminClient();
  const parentKey = row.order_h_no ?? row.forwarder_f_no ?? "unknown";
  const ext       = inferExtension(file);
  const stamp     = certTimestamp();
  const path      = `${user.id}/${parentKey}/cert-${stamp}${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("wht-certs")
    .upload(path, bytes, {
      contentType: mime || "application/octet-stream",
      upsert:      false,
    });
  if (uploadErr) {
    return { ok: false, error: `upload_failed: ${uploadErr.message}` };
  }

  // 3. Flip cert_status → received atomically.
  const receivedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from("withholding_tax_entries")
    .update({
      cert_status:       "received",
      cert_number:       certNumber?.trim() || null,
      cert_storage_path: path,
      cert_received_at:  receivedAt,
    })
    .eq("id", whtEntryId)
    .eq("cert_status", "pending")
    .eq("profile_id", user.id);                                    // belt-and-braces
  if (updErr) {
    return {
      ok: false,
      error: `update_failed: ${updErr.message} (storage upload at ${path} stays — admin can recover via /admin/tax-invoices)`,
    };
  }

  // 4. Best-effort audit log.
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    user.id,                                        // customer-as-actor (see header comment)
      action:      "wht.customer_cert_upload",
      target_type: "withholding_tax_entry",
      target_id:   whtEntryId,
      payload: {
        cert_number:  certNumber ?? null,
        storage_path: path,
        filename:     file.name,
        size_bytes:   file.size,
      },
    });
  } catch (e) {
    logger.error("audit", "wht customer-upload audit insert failed", e, {
      userId:    redactId(user.id),
      target_id: redactId(whtEntryId),
    });
  }

  // Revalidate the receipt page(s) so customer sees updated banner.
  if (row.forwarder_f_no) {
    revalidatePath(`/service-import/${row.forwarder_f_no}/receipt`);
  }
  if (row.order_h_no) {
    revalidatePath(`/service-order/${row.order_h_no}/receipt`);
  }

  return { ok: true, data: { storage_path: path, received_at: receivedAt } };
}

// ────────────────────────────────────────────────────────────
// Helpers (mirror actions/admin/wht.ts pattern)
// ────────────────────────────────────────────────────────────

/** Module-scope Date.now() per React Compiler purity rule. */
function certTimestamp(): string {
  return String(Date.now());
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                            return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                            return ".png";
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))                                return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg"))          return ".jpg";
  if (t.includes("png"))                                return ".png";
  return ".bin";
}

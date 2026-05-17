"use server";

/**
 * Withholding-tax (ภาษีหัก ณ ที่จ่าย) admin actions — V-A6.
 *
 * Per ADR-0015 (locked 2026-05-16 night).
 *
 * V1 surface area (admin-only, customer self-upload deferred to V1.1):
 *   - createWhtEntry        — record a new WHT row against a parent order
 *   - markWhtCertReceived   — admin uploaded the 50 ทวิ cert; flip to received
 *   - waiveWhtCert          — super/accounting only; reason required
 *   - cancelWhtEntry        — created in error (only while cert_status='pending')
 *   - uploadWhtCert         — helper that takes a File and returns the storage path
 *
 * Receipt + tax-invoice issuance is gated on `cert_status` by the caller
 * (`issueTaxInvoice` in `actions/admin/tax-invoices.tsx`) — this file owns
 * the lifecycle of the WHT row itself.
 *
 * All mutations log to admin_audit_log per ADR-0014 pattern.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createWhtEntrySchema,   type CreateWhtEntryInput,
  markCertReceivedSchema, type MarkCertReceivedInput,
  waiveCertSchema,        type WaiveCertInput,
  cancelWhtEntrySchema,   type CancelWhtEntryInput,
  computeWhtNumbers,
} from "@/lib/validators/withholding-tax";

// ────────────────────────────────────────────────────────────
// 1) Create WHT entry — admin records the customer's WHT info
// ────────────────────────────────────────────────────────────

type CreateResult = {
  id:                string;
  wht_amount_thb:    number;
  net_expected_thb:  number;
};

export async function createWhtEntry(
  input: CreateWhtEntryInput,
): Promise<AdminActionResult<CreateResult>> {
  const parsed = createWhtEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── Resolve parent order → profile_id snapshot (3-way XOR per U2-3) ──
    let profileId: string | null = null;
    if (d.order_type === "forwarder") {
      const { data, error } = await admin
        .from("forwarders")
        .select("profile_id")
        .eq("f_no", d.order_id)
        .maybeSingle<{ profile_id: string }>();
      if (error) return { ok: false, error: error.message };
      if (!data)  return { ok: false, error: "forwarder_not_found" };
      profileId = data.profile_id;
    } else if (d.order_type === "service_order") {
      const { data, error } = await admin
        .from("service_orders")
        .select("profile_id")
        .eq("h_no", d.order_id)
        .maybeSingle<{ profile_id: string }>();
      if (error) return { ok: false, error: error.message };
      if (!data)  return { ok: false, error: "service_order_not_found" };
      profileId = data.profile_id;
    } else {
      // freight_invoice (U2-3 / migration 0053)
      const { data, error } = await admin
        .from("freight_invoices")
        .select("profile_id")
        .eq("id", d.order_id)
        .maybeSingle<{ profile_id: string }>();
      if (error) return { ok: false, error: error.message };
      if (!data)  return { ok: false, error: "freight_invoice_not_found" };
      profileId = data.profile_id;
    }

    // ── Idempotency guard: refuse duplicate per parent ──
    // The DB enforces this via partial-unique indexes too — this just
    // gives a nicer error than 23505.
    {
      const q = admin
        .from("withholding_tax_entries")
        .select("id")
        .limit(1);
      const lookup =
        d.order_type === "forwarder"       ? q.eq("forwarder_f_no",     d.order_id)
        : d.order_type === "service_order" ? q.eq("order_h_no",         d.order_id)
        :                                    q.eq("freight_invoice_id", d.order_id);
      const { data: existing, error } = await lookup.maybeSingle<{ id: string }>();
      if (error)    return { ok: false, error: error.message };
      if (existing) return { ok: false, error: "wht_entry_exists" };
    }

    // ── Compute derived amounts server-side (don't trust client math) ──
    const { wht_amount_thb, net_expected_thb } = computeWhtNumbers({
      gross_invoice_thb: d.gross_invoice_thb,
      wht_base_thb:      d.wht_base_thb,
      wht_rate_pct:      d.wht_rate_pct,
    });

    if (net_expected_thb <= 0) {
      return { ok: false, error: "net_expected_non_positive" };
    }

    // ── Insert (3-way XOR per U2-3) ──
    const payload = {
      profile_id:           profileId,
      order_h_no:           d.order_type === "service_order"   ? d.order_id : null,
      forwarder_f_no:       d.order_type === "forwarder"       ? d.order_id : null,
      freight_invoice_id:   d.order_type === "freight_invoice" ? d.order_id : null,
      gross_invoice_thb:    d.gross_invoice_thb,
      wht_base_thb:         d.wht_base_thb,
      wht_rate_pct:         d.wht_rate_pct,
      wht_amount_thb,
      net_expected_thb,
      cert_status:          "pending" as const,
      recorded_by_admin:    adminId,
    };

    const { data: inserted, error: insErr } = await admin
      .from("withholding_tax_entries")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "wht.create", "withholding_tax_entry", inserted.id, {
      order_type:        d.order_type,
      order_id:          d.order_id,
      gross_invoice_thb: d.gross_invoice_thb,
      wht_base_thb:      d.wht_base_thb,
      wht_rate_pct:      d.wht_rate_pct,
      wht_amount_thb,
      net_expected_thb,
    });

    revalidateParent(d.order_type, d.order_id);

    return {
      ok: true,
      data: { id: inserted.id, wht_amount_thb, net_expected_thb },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Mark WHT cert received — admin has uploaded the 50 ทวิ
// ────────────────────────────────────────────────────────────

export async function markWhtCertReceived(
  input: MarkCertReceivedInput,
): Promise<AdminActionResult<{ received_at: string }>> {
  const parsed = markCertReceivedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status, order_h_no, forwarder_f_no, freight_invoice_id")
      .eq("id", d.id)
      .maybeSingle<{
        id:                  string;
        cert_status:         "pending" | "received" | "waived";
        order_h_no:          string | null;
        forwarder_f_no:      string | null;
        freight_invoice_id:  string | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.cert_status === "received") return { ok: false, error: "already_received" };
    if (row.cert_status === "waived")   return { ok: false, error: "already_waived" };

    const receivedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("withholding_tax_entries")
      .update({
        cert_status:       "received",
        cert_number:       d.cert_number ?? null,
        cert_storage_path: d.cert_storage_path,
        cert_received_at:  receivedAt,
      })
      .eq("id", d.id)
      .eq("cert_status", "pending");                 // optimistic race-guard
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "wht.cert_received", "withholding_tax_entry", d.id, {
      cert_number:       d.cert_number ?? null,
      cert_storage_path: d.cert_storage_path,
    });

    revalidateParentFromRow(row);

    return { ok: true, data: { received_at: receivedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Waive WHT cert — super/accounting only, reason required
// ────────────────────────────────────────────────────────────

export async function waiveWhtCert(
  input: WaiveCertInput,
): Promise<AdminActionResult<{ waived_at: string }>> {
  const parsed = waiveCertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // Same role set as create — super OR accounting (per ADR-0015 Q3 resolved).
  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status, order_h_no, forwarder_f_no, freight_invoice_id")
      .eq("id", d.id)
      .maybeSingle<{
        id:                  string;
        cert_status:         "pending" | "received" | "waived";
        order_h_no:          string | null;
        forwarder_f_no:      string | null;
        freight_invoice_id:  string | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.cert_status === "received") return { ok: false, error: "already_received" };
    if (row.cert_status === "waived")   return { ok: false, error: "already_waived" };

    const waivedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("withholding_tax_entries")
      .update({
        cert_status:     "waived",
        waived_reason:   d.waived_reason,
        waived_by_admin: adminId,
        waived_at:       waivedAt,
      })
      .eq("id", d.id)
      .eq("cert_status", "pending");                 // optimistic race-guard
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "wht.cert_waive", "withholding_tax_entry", d.id, {
      waived_reason: d.waived_reason,
    });

    revalidateParentFromRow(row);

    return { ok: true, data: { waived_at: waivedAt } };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Cancel WHT entry — admin created in error
// ────────────────────────────────────────────────────────────
// Only allowed while still `pending`. After received/waived we keep the
// row for audit (delete would leave no trail of the cert's existence).

export async function cancelWhtEntry(
  input: CancelWhtEntryInput,
): Promise<AdminActionResult<void>> {
  const parsed = cancelWhtEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: readErr } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status, order_h_no, forwarder_f_no, freight_invoice_id")
      .eq("id", d.id)
      .maybeSingle<{
        id:                  string;
        cert_status:         "pending" | "received" | "waived";
        order_h_no:          string | null;
        forwarder_f_no:      string | null;
        freight_invoice_id:  string | null;
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.cert_status !== "pending") {
      return { ok: false, error: "cannot_cancel_after_settled" };
    }

    const { error: delErr } = await admin
      .from("withholding_tax_entries")
      .delete()
      .eq("id", d.id)
      .eq("cert_status", "pending");
    if (delErr) {
      return { ok: false, error: `delete_failed: ${delErr.message}` };
    }

    await logAdminAction(adminId, "wht.cancel", "withholding_tax_entry", d.id, {
      reason: "admin_cancelled_pending_entry",
    });

    revalidateParentFromRow(row);

    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Upload WHT cert file — admin-side multi-part upload to Storage
// ────────────────────────────────────────────────────────────
// Caller passes a File from a form. We write to bucket 'wht-certs' under
// the customer's profile_id folder, then return the path so the caller
// can pass it to markWhtCertReceived.

export async function uploadWhtCert(
  whtEntryId: string,
  file: File,
): Promise<AdminActionResult<{ storage_path: string }>> {
  if (!whtEntryId || typeof whtEntryId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no_file" };
  }
  // 10 MB ceiling — 50 ทวิ certs are usually small PDFs/JPEGs.
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "file_too_large" };
  }

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Look up the parent row so we know which customer-folder to write to
    // (storage policy uses the first folder segment as profile_id).
    const { data: row, error: readErr } = await admin
      .from("withholding_tax_entries")
      .select("id, profile_id, order_h_no, forwarder_f_no, freight_invoice_id, cert_status")
      .eq("id", whtEntryId)
      .maybeSingle<{
        id:                  string;
        profile_id:          string;
        order_h_no:          string | null;
        forwarder_f_no:      string | null;
        freight_invoice_id:  string | null;
        cert_status:         "pending" | "received" | "waived";
      }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "not_found" };
    if (row.cert_status !== "pending") {
      return { ok: false, error: "cannot_upload_after_settled" };
    }

    // U2-3 — 3-way parent: order_h_no | forwarder_f_no | freight_invoice_id
    const parentKey = row.order_h_no
      ?? row.forwarder_f_no
      ?? (row.freight_invoice_id ? `fi-${row.freight_invoice_id.slice(0, 8)}` : "unknown");
    const ext       = inferExtension(file);
    const stamp     = certTimestamp();
    const path      = `${row.profile_id}/${parentKey}/cert-${stamp}${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("wht-certs")
      .upload(path, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert:      false,
      });
    if (uploadErr) {
      return { ok: false, error: `upload_failed: ${uploadErr.message}` };
    }

    await logAdminAction(adminId, "wht.cert_upload", "withholding_tax_entry", whtEntryId, {
      storage_path: path,
      filename:     file.name,
      size_bytes:   file.size,
    });

    return { ok: true, data: { storage_path: path } };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Module-scope timestamp helper.
 * React Compiler `react-hooks/purity` rule flags `Date.now()` inside JSX —
 * keep our impure-time-source isolated to module scope per the codebase
 * pattern (see docs/learnings/nextjs-16-quirks.md).
 */
function certTimestamp(): string {
  return String(Date.now());
}

function inferExtension(file: File): string {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf"))                 return ".pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return ".jpg";
  if (name.endsWith(".png"))                 return ".png";
  // Fall through by MIME.
  const t = (file.type ?? "").toLowerCase();
  if (t.includes("pdf"))   return ".pdf";
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("png"))   return ".png";
  return ".bin";
}

function revalidateParent(
  orderType: "forwarder" | "service_order" | "freight_invoice",
  orderId:   string,
): void {
  if (orderType === "forwarder") {
    revalidatePath(`/admin/forwarders/${orderId}`);
    revalidatePath(`/service-import/${orderId}/receipt`);
  } else if (orderType === "service_order") {
    revalidatePath(`/admin/service-orders/${orderId}`);
    revalidatePath(`/service-order/${orderId}/receipt`);
  } else {
    // U2-3 — freight_invoice id; the freight invoice lives on the parent
    // freight_shipments detail page (no dedicated /admin/freight/invoices/[id]).
    // V-E1.1 customer freight portal not yet shipped — skip customer revalidate.
    revalidatePath("/admin/freight/shipments");
    // Specific shipment id is the parent of the invoice; broad invalidate is
    // safer than computing FK chain here.
  }
  revalidatePath("/admin/tax-invoices");
}

function revalidateParentFromRow(row: {
  order_h_no:          string | null;
  forwarder_f_no:      string | null;
  freight_invoice_id?: string | null;
}): void {
  if (row.forwarder_f_no) {
    revalidateParent("forwarder", row.forwarder_f_no);
  } else if (row.order_h_no) {
    revalidateParent("service_order", row.order_h_no);
  } else if (row.freight_invoice_id) {
    revalidateParent("freight_invoice", row.freight_invoice_id);
  }
}

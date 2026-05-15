"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";
import { registerPdfFonts } from "@/lib/pdf/register-fonts";
import { TaxInvoice, type TaxInvoiceData } from "@/components/pdf/tax-invoice";

/**
 * Admin-side tax invoice actions (T-P4 G2c).
 *
 * Per ADR-0006 §1.4 + ADR-0005 K-7:
 *   - Approver gate: super OR accounting (RLS already enforces; withAdmin
 *     gate adds explicit app-layer check + audit trail).
 *   - Issuance is one-way (pending → issued); the row + PDF + serial are
 *     immutable thereafter (RD Code 86 compliance). Errors use
 *     cancellation + credit-note flow (G2e — TODO).
 *
 * Issuance steps in `issueTaxInvoice`:
 *   1. Read header + lines (admin client — RLS allows super/accounting).
 *   2. Validate status='pending' + financial snapshot non-zero.
 *   3. Reserve serial via `next_tax_invoice_serial()` RPC (atomic upsert
 *      on tax_invoice_seq inside Postgres — concurrent calls serialise).
 *   4. Render PDF buffer with `@react-pdf/renderer` (Sarabun font already
 *      registered idempotently).
 *   5. Upload PDF to `tax-invoices/{profile_id}/{INV-...}.pdf`.
 *   6. UPDATE row: status='issued' + serial + issued_at + issued_by_admin
 *      + pdf_storage_path. The constraint
 *      `tax_invoices_issued_has_serial` defends against partial updates.
 *   7. Audit log + notify customer + revalidate paths.
 *
 * Failure modes:
 *   - If serial reserved but PDF render fails → serial number is "lost"
 *     (gap in sequence). RD Code 86 is OK with documented gaps; we log
 *     the failure for audit.
 *   - If PDF uploaded but DB update fails → orphan PDF in storage. The
 *     pdf_storage_path is null on the row so customer can't fetch it;
 *     admin can retry the issue (will call next_tax_invoice_serial again
 *     since status is still 'pending').
 *
 * Both failure modes prefer "consistent ledger over wasted serial" per
 * the wallet/accounting reasoning that's used elsewhere in this codebase.
 */

const issueSchema = z.object({
  id: z.string().uuid(),
});
export type IssueTaxInvoiceInput = z.infer<typeof issueSchema>;

type IssueResult = {
  serial_no: string;
  pdf_storage_path: string;
};

export async function issueTaxInvoice(
  input: IssueTaxInvoiceInput,
): Promise<AdminActionResult<IssueResult>> {
  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── 1. Read header ──
    const { data: header, error: headErr } = await admin
      .from("tax_invoices")
      .select("id, profile_id, status, serial_no, order_h_no, forwarder_f_no, buyer_name, buyer_address, buyer_tax_id, buyer_branch, subtotal_thb, vat_thb, total_thb, vat_mode, payment_method, created_at")
      .eq("id", parsed.data.id)
      .maybeSingle<HeaderRow>();
    if (headErr)   return { ok: false, error: headErr.message };
    if (!header)   return { ok: false, error: "not_found" };
    if (header.status === "issued")    return { ok: false, error: "already_issued" };
    if (header.status === "cancelled") return { ok: false, error: "cancelled" };

    if (Number(header.total_thb) <= 0) {
      return { ok: false, error: "zero_total" };
    }

    // ── Read lines ──
    const { data: linesRaw, error: linesErr } = await admin
      .from("tax_invoice_lines")
      .select("position, description, qty, unit_price_thb, amount_thb, vat_thb")
      .eq("tax_invoice_id", header.id)
      .order("position", { ascending: true });
    if (linesErr) return { ok: false, error: linesErr.message };
    const lines = (linesRaw ?? []) as LineRow[];
    if (lines.length === 0) return { ok: false, error: "no_lines" };

    // ── 2. Reserve serial ──
    const { data: serialNo, error: serialErr } = await admin.rpc("next_tax_invoice_serial");
    if (serialErr || !serialNo || typeof serialNo !== "string") {
      return {
        ok: false,
        error: `serial_reserve_failed: ${serialErr?.message ?? "rpc returned non-string"}`,
      };
    }

    // ── 3. Render PDF ──
    registerPdfFonts();
    const pdfData: TaxInvoiceData = {
      serial_no:     serialNo,
      status:        "issued",                 // future: render with this status (no watermark)
      issued_at:     new Date().toISOString(), // tentative; DB will own the canonical value
      created_at:    header.created_at,
      buyer_name:    header.buyer_name,
      buyer_address: header.buyer_address,
      buyer_tax_id:  header.buyer_tax_id,
      buyer_branch:  header.buyer_branch,
      subtotal_thb:  Number(header.subtotal_thb),
      vat_thb:       Number(header.vat_thb),
      total_thb:     Number(header.total_thb),
      vat_mode:      header.vat_mode,
      payment_method: header.payment_method,
      lines: lines.map((l) => ({
        position:       l.position,
        description:    l.description,
        qty:            Number(l.qty),
        unit_price_thb: Number(l.unit_price_thb),
        amount_thb:     Number(l.amount_thb),
        vat_thb:        Number(l.vat_thb),
      })),
      order_h_no:     header.order_h_no,
      forwarder_f_no: header.forwarder_f_no,
    };

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderToBuffer(<TaxInvoice data={pdfData} />);
    } catch (e) {
      return {
        ok: false,
        error: `pdf_render_failed: ${(e as Error).message ?? "unknown"} (serial ${serialNo} reserved — gap will be logged)`,
      };
    }

    // ── 4. Upload to Storage ──
    const pdfPath = `${header.profile_id}/${serialNo}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from("tax-invoices")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert:      false,                       // first issuance — must not exist
      });
    if (uploadErr) {
      return {
        ok: false,
        error: `pdf_upload_failed: ${uploadErr.message} (serial ${serialNo} reserved — gap will be logged)`,
      };
    }

    // ── 5. UPDATE row → issued ──
    const issuedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("tax_invoices")
      .update({
        status:           "issued",
        serial_no:        serialNo,
        issued_at:        issuedAt,
        issued_by_admin:  adminId,
        pdf_storage_path: pdfPath,
      })
      .eq("id", header.id)
      .eq("status", "pending");                  // optimistic — don't double-issue
    if (updErr) {
      return {
        ok: false,
        error: `update_failed: ${updErr.message} (serial ${serialNo} + PDF orphan at ${pdfPath} — admin can manually clean up)`,
      };
    }

    // ── 6. Audit + notify + revalidate ──
    await logAdminAction(adminId, "tax_invoice.issue", "tax_invoice", header.id, {
      serial_no:  serialNo,
      total_thb:  Number(header.total_thb),
      buyer_name: header.buyer_name,
    });

    const orderRef = header.order_h_no ?? header.forwarder_f_no ?? "";
    if (orderRef) {
      void sendNotification(
        header.profile_id,
        notify.taxInvoiceIssued({
          serialNo,
          totalThb: Number(header.total_thb),
          orderRef,
        }),
      );
    }

    revalidatePath("/admin/tax-invoices");
    revalidatePath(`/admin/tax-invoices/${header.id}`);
    if (header.order_h_no)     revalidatePath(`/service-order/${header.order_h_no}/receipt`);
    if (header.forwarder_f_no) revalidatePath(`/service-import/${header.forwarder_f_no}/receipt`);

    return {
      ok: true,
      data: { serial_no: serialNo, pdf_storage_path: pdfPath },
    };
  });
}

// ────────────────────────────────────────────────────────────
// CANCEL tax invoice (admin) — T-P4 G2e-1
// ────────────────────────────────────────────────────────────
//
// Per ADR-0006 §7: Once status='issued', the row is immutable per RD
// Code 86. To correct an error, admin marks the row 'cancelled' (with
// reason) — the original PDF stays in Storage but the download route
// re-renders it with a CANCELLED watermark.
//
// After cancellation:
//   - Customer can request a NEW tax invoice for the same order (G2b
//     idempotency check uses .neq("status","cancelled") so cancelled
//     rows don't block new requests).
//   - Admin issues the new invoice with a fresh serial via G2c flow.
//
// Credit note (ใบลดหนี้, G2e-2) is a separate action for actual money
// refunds — defer to follow-up. The cancel flow alone covers the common
// typo-correction case.

const cancelSchema = z.object({
  id:     z.string().uuid(),
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(500),
});
export type CancelTaxInvoiceInput = z.infer<typeof cancelSchema>;

export async function cancelTaxInvoice(
  input: CancelTaxInvoiceInput,
): Promise<AdminActionResult<{ cancelled_at: string }>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: header, error: headErr } = await admin
      .from("tax_invoices")
      .select("id, profile_id, status, serial_no, order_h_no, forwarder_f_no")
      .eq("id", d.id)
      .maybeSingle<{
        id:             string;
        profile_id:     string;
        status:         "pending" | "issued" | "cancelled";
        serial_no:      string | null;
        order_h_no:     string | null;
        forwarder_f_no: string | null;
      }>();
    if (headErr) return { ok: false, error: headErr.message };
    if (!header) return { ok: false, error: "not_found" };

    if (header.status === "cancelled") {
      return { ok: false, error: "already_cancelled" };
    }
    // Pending invoices haven't consumed a serial — admin can still cancel
    // (acts as "reject the request"). Issued invoices are the typical case
    // (typo correction). Either path: metadata-only mutation, no PDF/storage
    // change needed (download route re-renders with watermark for cancelled).

    const cancelledAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("tax_invoices")
      .update({
        status:              "cancelled",
        cancelled_at:        cancelledAt,
        cancelled_by_admin:  adminId,
        cancellation_reason: d.reason,
      })
      .eq("id", header.id)
      .neq("status", "cancelled");                 // optimistic — race-safe
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "tax_invoice.cancel", "tax_invoice", header.id, {
      serial_no:  header.serial_no,
      reason:     d.reason,
      before:     { status: header.status },
    });

    // Notify customer — only when cancelling an ISSUED invoice (pending
    // cancellation = silent rejection; usually preceded by a back-channel
    // conversation about the issue).
    if (header.status === "issued" && header.serial_no) {
      const orderRef = header.order_h_no ?? header.forwarder_f_no ?? "";
      if (orderRef) {
        void sendNotification(
          header.profile_id,
          notify.taxInvoiceCancelled({
            serialNo: header.serial_no,
            reason:   d.reason,
            orderRef,
          }),
        );
      }
    }

    revalidatePath("/admin/tax-invoices");
    revalidatePath(`/admin/tax-invoices/${header.id}`);
    if (header.order_h_no)     revalidatePath(`/service-order/${header.order_h_no}/receipt`);
    if (header.forwarder_f_no) revalidatePath(`/service-import/${header.forwarder_f_no}/receipt`);

    return { ok: true, data: { cancelled_at: cancelledAt } };
  });
}

// ────────────────────────────────────────────────────────────
// Internal types — not re-exported (admin pages query directly).
// ────────────────────────────────────────────────────────────

type HeaderRow = {
  id:               string;
  profile_id:       string;
  status:           "pending" | "issued" | "cancelled";
  serial_no:        string | null;
  order_h_no:       string | null;
  forwarder_f_no:   string | null;
  buyer_name:       string;
  buyer_address:    string;
  buyer_tax_id:     string;
  buyer_branch:     string;
  subtotal_thb:     number;
  vat_thb:          number;
  total_thb:        number;
  vat_mode:         "inclusive" | "exclusive";
  payment_method:   string;
  created_at:       string;
};

type LineRow = {
  position:       number;
  description:    string;
  qty:            number;
  unit_price_thb: number;
  amount_thb:     number;
  vat_thb:        number;
};

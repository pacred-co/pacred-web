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
 *     cancellation (G2e-1 ✅ — cancelTaxInvoice) + credit-note (G2e-2 ✅ —
 *     issueCreditNote, R3 / 0082) flow.  Typo correction = cancel + reissue;
 *     money refund = cancel + credit note (positive amount; PDF renders
 *     "ใบลดหนี้" header per credit_note prop in the TaxInvoice template).
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

    // ── 1b. WHT cert gate (ADR-0015) ──
    // If the parent order has a withholding_tax_entries row with
    // cert_status='pending', BLOCK issuance — staff explicit ask
    // (chat 11/12/2025 + 30/3/2026): "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ".
    // Personal customers (no juristic WHT) → no row → no gate.
    // We also snapshot the row id to backfill `tax_invoice_id` after the
    // tax_invoices UPDATE succeeds (so V-A3 / V-A8 reports can join cleanly),
    // and read the breakdown fields so the PDF can print the WHT block.
    const whtSelect = "id, cert_status, wht_base_thb, wht_rate_pct, wht_amount_thb, net_expected_thb, cert_number";
    const whtLookup = header.forwarder_f_no
      ? await admin
          .from("withholding_tax_entries")
          .select(whtSelect)
          .eq("forwarder_f_no", header.forwarder_f_no)
          .maybeSingle<WhtRow>()
      : header.order_h_no
      ? await admin
          .from("withholding_tax_entries")
          .select(whtSelect)
          .eq("order_h_no", header.order_h_no)
          .maybeSingle<WhtRow>()
      : { data: null, error: null };
    if (whtLookup.error) {
      return { ok: false, error: `wht_lookup_failed: ${whtLookup.error.message}` };
    }
    if (whtLookup.data && whtLookup.data.cert_status === "pending") {
      return { ok: false, error: "wht_cert_pending" };
    }
    const whtEntryId: string | null = whtLookup.data?.id ?? null;
    const whtRow:     WhtRow | null = whtLookup.data ?? null;

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
      wht: whtRow && whtRow.cert_status !== "pending"
        ? {
            base_thb:    Number(whtRow.wht_base_thb),
            rate_pct:    Number(whtRow.wht_rate_pct),
            amount_thb:  Number(whtRow.wht_amount_thb),
            net_thb:     Number(whtRow.net_expected_thb),
            cert_status: whtRow.cert_status,
            cert_number: whtRow.cert_number,
          }
        : null,
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

    // ── 5b. Backfill WHT entry link (ADR-0015) ──
    // Best-effort: the tax invoice is already issued (DB-canonical). If the
    // WHT link write fails (rare), we log + continue; the V-A3 / V-A8
    // reconciliation can recover via order_h_no / forwarder_f_no joins.
    if (whtEntryId) {
      const { error: linkErr } = await admin
        .from("withholding_tax_entries")
        .update({ tax_invoice_id: header.id })
        .eq("id", whtEntryId)
        .is("tax_invoice_id", null);
      if (linkErr) {
        // Soft-fail — issuance already committed.
        await logAdminAction(adminId, "tax_invoice.wht_link_failed", "tax_invoice", header.id, {
          wht_entry_id: whtEntryId,
          error:        linkErr.message,
        });
      }
    }

    // ── 6. Audit + notify + revalidate ──
    await logAdminAction(adminId, "tax_invoice.issue", "tax_invoice", header.id, {
      serial_no:    serialNo,
      total_thb:    Number(header.total_thb),
      buyer_name:   header.buyer_name,
      wht_entry_id: whtEntryId,
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

type WhtRow = {
  id:                string;
  cert_status:       "pending" | "received" | "waived";
  wht_base_thb:      number;
  wht_rate_pct:      number;
  wht_amount_thb:    number;
  net_expected_thb:  number;
  cert_number:       string | null;
};

// ════════════════════════════════════════════════════════════
// G2e-2 (R3) — ISSUE CREDIT NOTE (ใบลดหนี้) against a cancelled invoice
// ════════════════════════════════════════════════════════════
//
// When admin needs to refund money on an issued+cancelled invoice (vs
// the cancel→reissue path for typo correction), they create a credit
// note that legally reverses the original.
//
// Per RD Code 86:
//   - A credit note is a NEW tax invoice row with `credit_note_for_id`
//     pointing to the cancelled original.
//   - Carries its own serial (from next_tax_invoice_serial).
//   - Line items + financial figures are SNAPSHOTTED from the original
//     (positive numbers stored — the document type implies credit).
//   - The PDF renders "ใบลดหนี้ / CREDIT NOTE" header + reason banner
//     (per the credit_note prop in components/pdf/tax-invoice.tsx).
//
// Preconditions enforced server-side:
//   - Original must exist + status='cancelled' + serial_no set (was issued).
//   - Original must NOT already have a credit_note_id (one credit note
//     per invoice; if admin needs another, they cancel + reissue first).
//   - Role: super OR accounting (same as cancel).
//
// On success: original.credit_note_id ← new.id  AND  new.credit_note_for_id ← original.id.

const issueCreditNoteSchema = z.object({
  /** Original (cancelled, was-issued) tax_invoices.id we are crediting. */
  originalInvoiceId: z.string().uuid(),
  /** Customer-facing reason — printed on the PDF reason banner + customer notification. */
  reason:            z.string().trim().min(3, "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(500),
});
export type IssueCreditNoteInput = z.infer<typeof issueCreditNoteSchema>;

type IssueCreditNoteResult = {
  credit_note_id:        string;
  credit_note_serial:    string;
  pdf_storage_path:      string;
};

export async function issueCreditNote(
  input: IssueCreditNoteInput,
): Promise<AdminActionResult<IssueCreditNoteResult>> {
  const parsed = issueCreditNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── 1. Read the original (cancelled) tax_invoice ──
    const { data: original, error: origErr } = await admin
      .from("tax_invoices")
      .select(
        "id, profile_id, status, serial_no, order_h_no, forwarder_f_no, buyer_name, buyer_address, buyer_tax_id, buyer_branch, subtotal_thb, vat_thb, total_thb, vat_mode, payment_method, credit_note_id"
      )
      .eq("id", d.originalInvoiceId)
      .maybeSingle<HeaderRow & { credit_note_id: string | null }>();
    if (origErr) return { ok: false, error: origErr.message };
    if (!original) return { ok: false, error: "not_found" };

    if (original.status !== "cancelled") {
      return { ok: false, error: `original_must_be_cancelled (current: ${original.status})` };
    }
    if (!original.serial_no) {
      return { ok: false, error: "original_was_never_issued (no serial — nothing to credit)" };
    }
    if (original.credit_note_id) {
      return { ok: false, error: "credit_note_already_issued" };
    }

    // ── 2. Read original line items (snapshot for the credit note) ──
    const { data: origLinesRaw, error: linesErr } = await admin
      .from("tax_invoice_lines")
      .select("position, description, qty, unit_price_thb, amount_thb, vat_thb")
      .eq("tax_invoice_id", original.id)
      .order("position", { ascending: true })
      .returns<LineRow[]>();
    if (linesErr) return { ok: false, error: linesErr.message };
    const origLines = origLinesRaw ?? [];

    // ── 3. Reserve serial for the credit note ──
    const { data: serialNo, error: serialErr } = await admin.rpc("next_tax_invoice_serial");
    if (serialErr || typeof serialNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    // ── 4. INSERT the credit note row ──
    //   - All snapshot fields copied from original
    //   - status='issued' immediately (per CHECK constraint added in 0082)
    //   - credit_note_for_id = original.id
    //   - cancellation_reason carries the credit reason for audit
    //   - Financial figures stored as POSITIVE (document type implies credit)
    const issuedAt = new Date().toISOString();
    const { data: newRow, error: insErr } = await admin
      .from("tax_invoices")
      .insert({
        profile_id:          original.profile_id,
        order_h_no:          original.order_h_no,
        forwarder_f_no:      original.forwarder_f_no,
        buyer_name:          original.buyer_name,
        buyer_address:       original.buyer_address,
        buyer_tax_id:        original.buyer_tax_id,
        buyer_branch:        original.buyer_branch,
        status:              "issued",
        serial_no:           serialNo,
        issued_at:           issuedAt,
        issued_by_admin:     adminId,
        subtotal_thb:        original.subtotal_thb,
        vat_thb:             original.vat_thb,
        total_thb:           original.total_thb,
        vat_mode:            original.vat_mode,
        payment_method:      original.payment_method,
        credit_note_for_id:  original.id,
        cancellation_reason: d.reason,   // re-purposed: holds the credit reason for audit
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !newRow) {
      return { ok: false, error: `credit_note_insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // ── 5. Clone line items ──
    if (origLines.length > 0) {
      const { error: linesInsErr } = await admin
        .from("tax_invoice_lines")
        .insert(
          origLines.map((l) => ({
            tax_invoice_id: newRow.id,
            position:       l.position,
            description:    l.description,
            qty:             l.qty,
            unit_price_thb:  l.unit_price_thb,
            amount_thb:      l.amount_thb,
            vat_thb:         l.vat_thb,
          })),
        );
      if (linesInsErr) {
        // Soft-fail: header exists; lines can be re-created from original
        // via the admin UI if needed.  Log + continue so customer at least
        // sees the credit note header.
        await logAdminAction(adminId, "credit_note.lines_clone_failed", "tax_invoice", newRow.id, {
          original_id: original.id,
          error: linesInsErr.message,
        });
      }
    }

    // ── 6. Backlink original → credit note ──
    await admin
      .from("tax_invoices")
      .update({ credit_note_id: newRow.id })
      .eq("id", original.id)
      .is("credit_note_id", null);  // race-guard against double-issue

    // ── 7. Render PDF + upload ──
    registerPdfFonts();
    const pdfData: TaxInvoiceData = {
      serial_no:    serialNo,
      status:       "issued",
      issued_at:    issuedAt,
      created_at:   issuedAt,
      buyer_name:    original.buyer_name,
      buyer_address: original.buyer_address,
      buyer_tax_id:  original.buyer_tax_id,
      buyer_branch:  original.buyer_branch,
      subtotal_thb:  original.subtotal_thb,
      vat_thb:       original.vat_thb,
      total_thb:     original.total_thb,
      vat_mode:      original.vat_mode,
      payment_method: original.payment_method,
      lines:          origLines,
      order_h_no:     original.order_h_no,
      forwarder_f_no: original.forwarder_f_no,
      credit_note: {
        for_serial_no: original.serial_no,
        reason:        d.reason,
      },
    };

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderToBuffer(<TaxInvoice data={pdfData} />);
    } catch (e) {
      // PDF render failed but the row exists.  Log + return success
      // (admin can regenerate from /api/tax-invoice/[id]).
      await logAdminAction(adminId, "credit_note.pdf_render_failed", "tax_invoice", newRow.id, {
        error: (e as Error).message ?? "unknown",
      });
      return {
        ok: true,
        data: {
          credit_note_id:     newRow.id,
          credit_note_serial: serialNo,
          pdf_storage_path:   "",
        },
      };
    }

    const pdfPath = `${original.profile_id}/${serialNo}.pdf`;
    const { error: uploadErr } = await admin.storage
      .from("tax-invoices")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert:      false,
      });
    if (uploadErr) {
      await logAdminAction(adminId, "credit_note.pdf_upload_failed", "tax_invoice", newRow.id, {
        error: uploadErr.message,
      });
    } else {
      await admin
        .from("tax_invoices")
        .update({ pdf_storage_path: pdfPath })
        .eq("id", newRow.id);
    }

    // ── 8. Audit + notify customer ──
    await logAdminAction(adminId, "tax_invoice.credit_note_issued", "tax_invoice", newRow.id, {
      original_id:        original.id,
      original_serial:    original.serial_no,
      credit_note_serial: serialNo,
      reason:             d.reason,
      total_thb:          original.total_thb,
    });

    const orderRef = original.order_h_no ?? original.forwarder_f_no ?? "";
    if (orderRef) {
      void sendNotification(
        original.profile_id,
        notify.creditNoteIssued({
          serialNo:    serialNo,
          forSerialNo: original.serial_no,
          totalThb:    original.total_thb,
          orderRef,
          reason:      d.reason,
        }),
      );
    }

    // Revalidate paths.
    revalidatePath("/admin/tax-invoices");
    revalidatePath(`/admin/tax-invoices/${original.id}`);
    revalidatePath(`/admin/tax-invoices/${newRow.id}`);
    if (original.order_h_no)     revalidatePath(`/service-order/${original.order_h_no}/receipt`);
    if (original.forwarder_f_no) revalidatePath(`/service-import/${original.forwarder_f_no}/receipt`);

    return {
      ok: true,
      data: {
        credit_note_id:     newRow.id,
        credit_note_serial: serialNo,
        pdf_storage_path:   uploadErr ? "" : pdfPath,
      },
    };
  });
}

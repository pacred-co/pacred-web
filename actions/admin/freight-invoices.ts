"use server";

/**
 * V-E1 — Freight invoices admin actions.
 *
 * Per [docs/port-specs/freight-document-suite.md] + ADR-0016.
 *
 * Surface area V1:
 *   adminCreateFreightInvoice   — create a draft invoice for a shipment
 *   adminAddFreightInvoiceLine  — add a line item (draft only)
 *   adminUpdateFreightInvoiceLine — edit line (draft only)
 *   adminDeleteFreightInvoiceLine — delete line (draft only)
 *   adminIssueFreightInvoice    — draft → issued (reserve serial, snapshot
 *     header from parent shipment + parties, freeze value block)
 *   adminCancelFreightInvoice   — issued → cancelled (with reason); allows
 *     re-issuance of a new invoice for the same shipment
 *
 * RBAC: super, ops, accounting.
 *
 * Issuance freezes:
 *   - invoice_no reserved via next_freight_invoice_serial()
 *   - parties snapshotted from freight_parties → *_snapshot columns
 *   - logistics snapshotted from freight_shipments → *_snapshot columns
 *   - value block copied from shipment (commercial_value_usd, exchange_rate,
 *     declared_customs_value_thb, hs_code, duty_rate_pct, duty_thb,
 *     vat_base_thb, vat_thb, vat_plan_label, form_e_applied)
 *
 * V-A6 WHT gate: future hook — when withholding_tax_entries grows a
 * freight_f_no column, this action will block issuance on cert_status=
 * 'pending'. V1 has no WHT linkage on freight side (V-A6 was cargo-only).
 *
 * V-E10 QA gate: WIRED — adminCreateFreightInvoice blocks draft creation
 * when isFreightShipmentQaPassed() returns false (no acceptable outcome in
 * {pass, fail_minor, waived} for the parent shipment). Error: 'qa_not_passed'.
 *
 * Idempotency: line_total = qty × unit_price_usd recomputed server-side.
 * Issuance is one-way (draft → issued); cancel writes a new audit row + UI
 * shows watermarked PDF.  PDF generators SHIPPED via
 *   /api/freight-invoice/[id]                — Commercial Invoice
 *   /api/freight-invoice/[id]/packing-list   — Packing List
 *   /api/freight-invoice/[id]/form-e         — Form E (ASEAN-China FTA)
 *   /api/freight-invoice/[id]/do-letter      — D/O letter (sea)
 * Downloads are surfaced as buttons on the admin shipment detail page.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { isFreightShipmentQaPassed } from "./qa-inspections";
import { adminAccrueFreightCommission } from "./freight-commission";
import {
  createFreightInvoiceSchema, type CreateFreightInvoiceInput,
  addInvoiceLineSchema,       type AddInvoiceLineInput,
  updateInvoiceLineSchema,    type UpdateInvoiceLineInput,
  invoiceIdOnlySchema,        type InvoiceIdOnlyInput,
  cancelInvoiceSchema,        type CancelInvoiceInput,
} from "@/lib/validators/freight-shipment";

const ROLES = ["super", "ops", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// 1) Create draft
// ────────────────────────────────────────────────────────────

export async function adminCreateFreightInvoice(
  input: CreateFreightInvoiceInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createFreightInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: shipment, error: shipmentErr } = await admin
      .from("freight_shipments")
      .select("id, profile_id, status, job_no")
      .eq("id", d.freight_shipment_id)
      .maybeSingle<{ id: string; profile_id: string; status: string; job_no: string }>();
    if (shipmentErr) {
      console.error(`[freight_shipments mutation lookup] failed`, { code: shipmentErr.code, message: shipmentErr.message });
      return { ok: false, error: `db_error:${shipmentErr.code ?? "unknown"}` };
    }
    if (!shipment) return { ok: false, error: "shipment_not_found" };
    if (shipment.status === "cancelled") return { ok: false, error: "shipment_cancelled" };

    // Refuse if there's already a non-cancelled invoice (draft or issued)
    // for this shipment. Drafts can be edited; cancelled rows can be
    // replaced. Issued blocks until cancelled.
    const { data: existing, error: existingErr } = await admin
      .from("freight_invoices")
      .select("id, status")
      .eq("freight_shipment_id", d.freight_shipment_id)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (existingErr) {
      console.error(`[freight_invoices list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (existing) {
      return { ok: false, error: `existing_invoice:${existing.status}:${existing.id}` };
    }

    // V-E10 QA gate — block invoice creation when no acceptable QA outcome
    // is recorded for the shipment. Accepted: {pass, fail_minor, waived}.
    // fail_major or no inspection at all → 'qa_not_passed'.
    const qaPassed = await isFreightShipmentQaPassed(d.freight_shipment_id);
    if (!qaPassed) {
      return { ok: false, error: "qa_not_passed" };
    }

    const { data: inserted, error: insErr } = await admin
      .from("freight_invoices")
      .insert({
        freight_shipment_id: d.freight_shipment_id,
        profile_id:          shipment.profile_id,
        status:              "draft",
        notes:               d.notes ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_invoice.create_draft", "freight_invoice", inserted.id, {
      freight_shipment_id: d.freight_shipment_id,
      job_no:              shipment.job_no,
    });

    revalidatePath(`/admin/freight/shipments/${d.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Line CRUD
// ────────────────────────────────────────────────────────────

export async function adminAddFreightInvoiceLine(
  input: AddInvoiceLineInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = addInvoiceLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: parent, error: parentErr } = await admin
      .from("freight_invoices")
      .select("id, status, freight_shipment_id")
      .eq("id", d.freight_invoice_id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error(`[freight_invoices mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    let position = d.position ?? 1;
    if (!d.position) {
      const { data: maxRow, error: maxRowErr } = await admin
        .from("freight_invoice_lines")
        .select("position")
        .eq("freight_invoice_id", d.freight_invoice_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      if (maxRowErr) {
        console.error(`[freight_invoice_lines list] failed`, { code: maxRowErr.code, message: maxRowErr.message });
      }
      position = (maxRow?.position ?? 0) + 1;
    }

    const amount_usd = Math.round(d.qty * d.unit_price_usd * 100) / 100;

    const { data: inserted, error: insErr } = await admin
      .from("freight_invoice_lines")
      .insert({
        freight_invoice_id: d.freight_invoice_id,
        position,
        marks:              d.marks ?? null,
        description:        d.description,
        qty:                d.qty,
        unit:               d.unit,
        unit_price_usd:     d.unit_price_usd,
        amount_usd,
        cartons:            d.cartons ?? null,
        gross_weight_kg:    d.gross_weight_kg ?? null,
        hs_code:            d.hs_code ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_invoice.line_add", "freight_invoice", d.freight_invoice_id, {
      item_id:     inserted.id,
      description: d.description,
      amount_usd,
    });

    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

export async function adminUpdateFreightInvoiceLine(
  input: UpdateInvoiceLineInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateInvoiceLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("freight_invoice_lines")
      .select("id, freight_invoice_id, qty, unit_price_usd")
      .eq("id", d.id)
      .maybeSingle<{ id: string; freight_invoice_id: string; qty: number; unit_price_usd: number }>();
    if (rowErr) {
      console.error(`[freight_invoice_lines mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("freight_invoices")
      .select("status, freight_shipment_id")
      .eq("id", row.freight_invoice_id)
      .maybeSingle<{ status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error(`[freight_invoices mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const newQty   = d.qty            ?? Number(row.qty);
    const newPrice = d.unit_price_usd ?? Number(row.unit_price_usd);
    const amount_usd = Math.round(newQty * newPrice * 100) / 100;

    const patch: Record<string, unknown> = { amount_usd };
    if (d.marks           !== undefined) patch.marks           = d.marks;
    if (d.description     !== undefined) patch.description     = d.description;
    if (d.qty             !== undefined) patch.qty             = d.qty;
    if (d.unit            !== undefined) patch.unit            = d.unit;
    if (d.unit_price_usd  !== undefined) patch.unit_price_usd  = d.unit_price_usd;
    if (d.cartons         !== undefined) patch.cartons         = d.cartons;
    if (d.gross_weight_kg !== undefined) patch.gross_weight_kg = d.gross_weight_kg;
    if (d.hs_code         !== undefined) patch.hs_code         = d.hs_code;

    const { error: updErr } = await admin
      .from("freight_invoice_lines")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "freight_invoice.line_update", "freight_invoice", row.freight_invoice_id, {
      item_id: d.id,
      patch,
    });

    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true };
  });
}

export async function adminDeleteFreightInvoiceLine(
  input: InvoiceIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = invoiceIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("freight_invoice_lines")
      .select("id, freight_invoice_id")
      .eq("id", input.id)
      .maybeSingle<{ id: string; freight_invoice_id: string }>();
    if (rowErr) {
      console.error(`[freight_invoice_lines mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("freight_invoices")
      .select("status, freight_shipment_id")
      .eq("id", row.freight_invoice_id)
      .maybeSingle<{ status: string; freight_shipment_id: string }>();
    if (parentErr) {
      console.error(`[freight_invoices mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const { error: delErr } = await admin
      .from("freight_invoice_lines")
      .delete()
      .eq("id", input.id);
    if (delErr) return { ok: false, error: `delete_failed: ${delErr.message}` };

    await logAdminAction(adminId, "freight_invoice.line_delete", "freight_invoice", row.freight_invoice_id, {
      item_id: input.id,
    });

    revalidatePath(`/admin/freight/shipments/${parent.freight_shipment_id}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Issue (draft → issued)
// ────────────────────────────────────────────────────────────

export async function adminIssueFreightInvoice(
  input: InvoiceIdOnlyInput,
): Promise<AdminActionResult<{ invoice_no: string }>> {
  const parsed = invoiceIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load draft + ensure has lines.
    const { data: invoice, error: invoiceErr } = await admin
      .from("freight_invoices")
      .select("id, status, freight_shipment_id, profile_id")
      .eq("id", input.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string; profile_id: string }>();
    if (invoiceErr) {
      console.error(`[freight_invoices mutation lookup] failed`, { code: invoiceErr.code, message: invoiceErr.message });
      return { ok: false, error: `db_error:${invoiceErr.code ?? "unknown"}` };
    }
    if (!invoice) return { ok: false, error: "not_found" };
    if (invoice.status !== "draft") return { ok: false, error: "not_draft" };

    const { count: linesCount } = await admin
      .from("freight_invoice_lines")
      .select("*", { count: "exact", head: true })
      .eq("freight_invoice_id", input.id);
    if (!linesCount || linesCount === 0) {
      return { ok: false, error: "no_lines" };
    }

    // U2-3 / ADR-0015 — WHT cert gate (freight side).
    // If a juristic customer has a withholding_tax_entries row keyed to
    // THIS freight invoice with cert_status='pending', refuse issuance —
    // staff explicit ask: "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ".
    // Personal customers / no-WHT invoices → no row → no gate.
    const { data: whtRow, error: whtErr } = await admin
      .from("withholding_tax_entries")
      .select("id, cert_status")
      .eq("freight_invoice_id", input.id)
      .limit(1)
      .maybeSingle<{ id: string; cert_status: "pending" | "received" | "waived" }>();
    if (whtErr) {
      return { ok: false, error: `wht_lookup_failed: ${whtErr.message}` };
    }
    if (whtRow && whtRow.cert_status === "pending") {
      return { ok: false, error: "wht_cert_pending" };
    }

    // Load parent shipment + parties for snapshot.
    const { data: shipment, error: shipmentErr } = await admin
      .from("freight_shipments")
      .select(`
        id, job_no, transport_mode, container_code, bl_no, vessel_voyage,
        port_loading, port_discharge, incoterm, payment_term, origin_country,
        commercial_value_usd, exchange_rate, rate_source, rate_date,
        commercial_value_thb, declared_customs_value_thb, declared_value_basis,
        hs_code, duty_rate_pct, duty_thb, vat_base_thb, vat_thb,
        vat_plan_label, form_e_applied
      `)
      .eq("id", invoice.freight_shipment_id)
      .maybeSingle<{
        id: string; job_no: string; transport_mode: string;
        container_code: string | null; bl_no: string | null; vessel_voyage: string | null;
        port_loading: string | null; port_discharge: string | null;
        incoterm: string | null; payment_term: string | null; origin_country: string;
        commercial_value_usd: number | null; exchange_rate: number | null;
        rate_source: string | null; rate_date: string | null;
        commercial_value_thb: number | null; declared_customs_value_thb: number | null;
        declared_value_basis: string | null;
        hs_code: string | null; duty_rate_pct: number | null; duty_thb: number | null;
        vat_base_thb: number | null; vat_thb: number | null;
        vat_plan_label: string | null; form_e_applied: boolean;
      }>();
    if (shipmentErr) {
      console.error(`[freight_shipments mutation lookup] failed`, { code: shipmentErr.code, message: shipmentErr.message });
      return { ok: false, error: `db_error:${shipmentErr.code ?? "unknown"}` };
    }
    if (!shipment) return { ok: false, error: "shipment_missing" };
    if (shipment.commercial_value_usd == null || shipment.exchange_rate == null) {
      return { ok: false, error: "value_block_incomplete" };
    }

    const { data: parties, error: partiesErr } = await admin
      .from("freight_parties")
      .select("role, name, address, tax_id, branch")
      .eq("freight_shipment_id", invoice.freight_shipment_id);
    if (partiesErr) {
      console.error(`[freight_parties list] failed`, { code: partiesErr.code, message: partiesErr.message });
    }
    type Party = { role: string; name: string; address: string; tax_id: string | null; branch: string | null };
    const partyList = (parties ?? []) as Party[];
    const shipper   = partyList.find((p) => p.role === "shipper");
    const consignee = partyList.find((p) => p.role === "consignee");
    if (!shipper || !consignee) {
      return { ok: false, error: "parties_incomplete" };
    }

    // Reserve invoice_no.
    const { data: invoiceNo, error: serialErr } = await admin.rpc("next_freight_invoice_serial");
    if (serialErr || typeof invoiceNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    const now = new Date().toISOString();

    // Snapshot + flip status → issued.
    const { error: updErr } = await admin
      .from("freight_invoices")
      .update({
        status:                     "issued",
        invoice_no:                 invoiceNo,
        issued_at:                  now,
        issued_by_admin_id:         adminId,

        shipper_name_snapshot:      shipper.name,
        shipper_address_snapshot:   shipper.address,
        consignee_name_snapshot:    consignee.name,
        consignee_address_snapshot: consignee.address,
        consignee_tax_id_snapshot:  consignee.tax_id,
        consignee_branch_snapshot:  consignee.branch,

        transport_mode_snapshot:    shipment.transport_mode,
        container_code_snapshot:    shipment.container_code,
        bl_no_snapshot:             shipment.bl_no,
        vessel_voyage_snapshot:     shipment.vessel_voyage,
        port_loading_snapshot:      shipment.port_loading,
        port_discharge_snapshot:    shipment.port_discharge,
        incoterm_snapshot:          shipment.incoterm,
        payment_term_snapshot:      shipment.payment_term,
        origin_country_snapshot:    shipment.origin_country,

        commercial_value_usd:       shipment.commercial_value_usd,
        exchange_rate:              shipment.exchange_rate,
        rate_source:                shipment.rate_source ?? "staff_entered",
        rate_date:                  shipment.rate_date,
        commercial_value_thb:       shipment.commercial_value_thb,
        declared_customs_value_thb: shipment.declared_customs_value_thb,
        declared_value_basis:       shipment.declared_value_basis,
        hs_code:                    shipment.hs_code,
        duty_rate_pct:              shipment.duty_rate_pct,
        duty_thb:                   shipment.duty_thb,
        vat_base_thb:               shipment.vat_base_thb,
        vat_thb:                    shipment.vat_thb,
        vat_plan_label:             shipment.vat_plan_label,
        form_e_applied:             shipment.form_e_applied,
      })
      .eq("id", invoice.id)
      .eq("status", "draft");                                            // optimistic race-guard
    if (updErr) {
      return { ok: false, error: `update_failed: ${updErr.message} (serial ${invoiceNo} reserved — gap will be logged)` };
    }

    await logAdminAction(adminId, "freight_invoice.issue", "freight_invoice", invoice.id, {
      invoice_no:          invoiceNo,
      job_no:              shipment.job_no,
      commercial_value_usd: Number(shipment.commercial_value_usd),
      commercial_value_thb: Number(shipment.commercial_value_thb),
    });

    // WAVE 6 — best-effort FREIGHT commission accrual (mig 0167). DORMANT-SAFE:
    // adminAccrueFreightCommission NO-OPs when business_config
    // commission.freight_enabled is OFF, so this records NOTHING until the owner
    // confirms the rates + flips the flag. NEVER fails issuance (the invoice flip
    // already committed) — wrapped + voided. The accrual is a LEDGER row, not a
    // money move. Earner = the shipment's creator; per-scope bases come from the
    // source quote's line items (commission_scope persisted by the W5 compose).
    void accrueFreightInvoiceCommission(invoice.freight_shipment_id, invoiceNo, shipment.job_no);

    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${invoice.freight_shipment_id}`);
    return { ok: true, data: { invoice_no: invoiceNo } };
  });
}

/**
 * Best-effort: accrue freight commission for an issued invoice. Self-contained
 * (own admin client + try/catch) so it can be `void`-fired without ever
 * affecting the issuance result. NO-OPs entirely when the dormant flag is OFF
 * (the accrual action checks the flag). Derives the per-scope revenue bases from
 * the source quote's line items (grouped by commission_scope) + the earner from
 * the shipment's created_by_admin_id.
 */
async function accrueFreightInvoiceCommission(
  shipmentId: string,
  invoiceNo: string,
  jobNo: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ship, error: shipErr } = await admin
      .from("freight_shipments")
      .select("source_quote_id, created_by_admin_id")
      .eq("id", shipmentId)
      .maybeSingle<{ source_quote_id: string | null; created_by_admin_id: string | null }>();
    if (shipErr || !ship?.created_by_admin_id || !ship.source_quote_id) return; // no earner / no quote → nothing to accrue

    // Group the source quote's line items by commission_scope → per-scope revenue.
    const { data: items, error: itemsErr } = await admin
      .from("freight_quote_items")
      .select("commission_scope, line_total_thb")
      .eq("freight_quote_id", ship.source_quote_id);
    if (itemsErr) return;
    const bases: { freightThb: number; customsThb: number; docThb: number; shipmentCount: number } = {
      freightThb: 0, customsThb: 0, docThb: 0, shipmentCount: 1,
    };
    for (const it of (items ?? []) as Array<{ commission_scope: string | null; line_total_thb: number | string | null }>) {
      const amt = Number(it.line_total_thb ?? 0);
      switch (it.commission_scope) {
        case "freight":        bases.freightThb += amt; break;
        case "thai_customs":   bases.customsThb += amt; break;
        case "origin":         bases.docThb     += amt; break; // origin/doc revenue → doc commission bucket
        default: break;                                        // thai_transport / import_tax → no commission
      }
    }
    if (bases.freightThb <= 0 && bases.customsThb <= 0 && bases.docThb <= 0) return;

    await adminAccrueFreightCommission({
      sourceKind: "freight_invoice",
      sourceRef: invoiceNo,
      earnerAdminId: ship.created_by_admin_id,
      bases,
      notes: `auto-accrue on freight invoice ${invoiceNo} (job ${jobNo})`,
    });
  } catch (e) {
    console.error(`[freight-invoice accrue commission] failed (non-fatal)`, {
      invoice_no: invoiceNo,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

// ────────────────────────────────────────────────────────────
// 4) Cancel (issued → cancelled)
// ────────────────────────────────────────────────────────────

export async function adminCancelFreightInvoice(
  input: CancelInvoiceInput,
): Promise<AdminActionResult<void>> {
  const parsed = cancelInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: invoice, error: invoiceErr } = await admin
      .from("freight_invoices")
      .select("id, status, freight_shipment_id, invoice_no")
      .eq("id", d.id)
      .maybeSingle<{ id: string; status: string; freight_shipment_id: string; invoice_no: string | null }>();
    if (invoiceErr) {
      console.error(`[freight_invoices mutation lookup] failed`, { code: invoiceErr.code, message: invoiceErr.message });
      return { ok: false, error: `db_error:${invoiceErr.code ?? "unknown"}` };
    }
    if (!invoice) return { ok: false, error: "not_found" };
    if (invoice.status === "cancelled") return { ok: false, error: "already_cancelled" };

    const { error: updErr } = await admin
      .from("freight_invoices")
      .update({
        status:                "cancelled",
        cancelled_at:          new Date().toISOString(),
        cancelled_by_admin_id: adminId,
        cancellation_reason:   d.cancellation_reason,
      })
      .eq("id", d.id)
      .neq("status", "cancelled");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "freight_invoice.cancel", "freight_invoice", d.id, {
      invoice_no: invoice.invoice_no,
      reason:     d.cancellation_reason,
    });

    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${invoice.freight_shipment_id}`);
    return { ok: true };
  });
}

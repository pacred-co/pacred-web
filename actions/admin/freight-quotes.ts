"use server";

/**
 * V-E6 — Freight quotation admin actions.
 *
 * Per port-spec [docs/port-specs/freight-quotation.md] +
 * Phase I2 RBAC ack 2026-05-17 (super-only for approve; no `manager` role).
 *
 * Status lifecycle:
 *   draft → pending_approval → approved → sent → accepted (terminal)
 *                                              ↘ rejected / expired (terminal)
 *
 * Role gates (app-layer enforced; RLS is broader for read+general write):
 *   create/edit (draft only)     : super, ops, sales_admin, accounting
 *   submit for approval          : super, ops, sales_admin, accounting
 *   approve / reject             : SUPER ONLY (Phase I2 RBAC ack 2026-05-17)
 *   send / mark_accepted / expire: super, sales_admin, accounting
 *   convert to shipment          : SUPER ONLY (writes new freight_shipments row — V-E1 dep)
 *
 * Every status flip recomputes header totals (subtotal/vat/total) from
 * the line items currently stored, then freezes them at approval time.
 *
 * Each mutation writes an admin_audit_log row per ADR-0014.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createFreightQuoteSchema, type CreateFreightQuoteInput,
  updateFreightQuoteSchema, type UpdateFreightQuoteInput,
  createQuoteItemSchema,    type CreateQuoteItemInput,
  updateQuoteItemSchema,    type UpdateQuoteItemInput,
  deleteQuoteItemSchema,    type DeleteQuoteItemInput,
  quoteIdOnlySchema,        type QuoteIdOnlyInput,
  rejectQuoteSchema,        type RejectQuoteInput,
  computeQuoteTotals,
} from "@/lib/validators/freight-quote";

const ROLES_CREATE  = ["super", "ops", "sales_admin", "accounting"] as const;
const ROLES_APPROVE = ["super"] as const;
const ROLES_SEND    = ["super", "sales_admin", "accounting"] as const;

// ────────────────────────────────────────────────────────────
// 1) Create draft
// ────────────────────────────────────────────────────────────

type CreateResult = { id: string; quote_no: string };

export async function adminCreateFreightQuote(
  input: CreateFreightQuoteInput,
): Promise<AdminActionResult<CreateResult>> {
  const parsed = createFreightQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    // Reserve serial.
    const { data: quoteNo, error: serialErr } = await admin.rpc("next_freight_quote_no");
    if (serialErr || typeof quoteNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    const { data: inserted, error: insErr } = await admin
      .from("freight_quotes")
      .insert({
        quote_no:               quoteNo,
        status:                 "draft",
        profile_id:             d.profile_id ?? null,
        buyer_name_snapshot:    d.buyer_name_snapshot,
        buyer_tax_id_snapshot:  d.buyer_tax_id_snapshot ?? null,
        buyer_contact_snapshot: d.buyer_contact_snapshot ?? null,
        transport_mode:         d.transport_mode,
        port_loading:           d.port_loading ?? null,
        port_discharge:         d.port_discharge ?? null,
        place_delivery:         d.place_delivery ?? null,
        incoterm:               d.incoterm ?? null,
        currency:               d.currency,
        vat_pct:                d.vat_pct,
        subtotal:               0,
        vat_amount:             0,
        total:                  0,
        valid_until:            d.valid_until ?? null,
        notes:                  d.notes ?? null,
        created_by_admin_id:    adminId,
      })
      .select("id, quote_no")
      .single<{ id: string; quote_no: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await logAdminAction(adminId, "freight_quote.create", "freight_quote", inserted.id, {
      quote_no:      quoteNo,
      buyer_name:    d.buyer_name_snapshot,
      transport_mode: d.transport_mode,
    });

    revalidatePath("/admin/freight/quotes");
    return { ok: true, data: { id: inserted.id, quote_no: inserted.quote_no } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Update header (draft only)
// ────────────────────────────────────────────────────────────

export async function adminUpdateFreightQuote(
  input: UpdateFreightQuoteInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateFreightQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("freight_quotes")
      .select("status, quote_no")
      .eq("id", d.id)
      .maybeSingle<{ status: string; quote_no: string }>();
    if (!before) return { ok: false, error: "not_found" };
    if (before.status !== "draft") return { ok: false, error: "not_draft" };

    const patch: Record<string, unknown> = {};
    const setIf = <K extends keyof typeof d>(k: K) => {
      if (d[k] !== undefined) patch[k as string] = d[k];
    };
    setIf("buyer_name_snapshot"); setIf("buyer_tax_id_snapshot"); setIf("buyer_contact_snapshot");
    setIf("transport_mode"); setIf("port_loading"); setIf("port_discharge"); setIf("place_delivery");
    setIf("incoterm"); setIf("vat_pct"); setIf("valid_until"); setIf("notes");
    if (Object.keys(patch).length === 0) return { ok: false, error: "no_changes" };

    const { error: updErr } = await admin
      .from("freight_quotes")
      .update(patch)
      .eq("id", d.id)
      .eq("status", "draft");
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    // Recompute totals if vat_pct changed.
    if (d.vat_pct !== undefined) {
      await recomputeQuoteTotals(d.id);
    }

    await logAdminAction(adminId, "freight_quote.update", "freight_quote", d.id, {
      quote_no: before.quote_no,
      patch,
    });

    revalidateOne(d.id);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Line item CRUD
// ────────────────────────────────────────────────────────────

export async function adminAddQuoteItem(
  input: CreateQuoteItemInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = createQuoteItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: parent } = await admin
      .from("freight_quotes")
      .select("status, quote_no")
      .eq("id", d.freight_quote_id)
      .maybeSingle<{ status: string; quote_no: string }>();
    if (!parent) return { ok: false, error: "not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    // Auto-assign position if not given.
    let position = d.position ?? 1;
    if (!d.position) {
      const { data: maxRow } = await admin
        .from("freight_quote_items")
        .select("position")
        .eq("freight_quote_id", d.freight_quote_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      position = (maxRow?.position ?? 0) + 1;
    }

    const line_total_thb = Math.round(d.quantity * d.unit_price_thb * 100) / 100;

    const { data: inserted, error: insErr } = await admin
      .from("freight_quote_items")
      .insert({
        freight_quote_id: d.freight_quote_id,
        position,
        description:      d.description,
        quantity:         d.quantity,
        unit:             d.unit,
        unit_price_thb:   d.unit_price_thb,
        line_total_thb,
        note:             d.note ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    await recomputeQuoteTotals(d.freight_quote_id);

    await logAdminAction(adminId, "freight_quote.item_add", "freight_quote", d.freight_quote_id, {
      quote_no:    parent.quote_no,
      item_id:     inserted.id,
      description: d.description,
      quantity:    d.quantity,
      unit:        d.unit,
      unit_price:  d.unit_price_thb,
      line_total:  line_total_thb,
    });

    revalidateOne(d.freight_quote_id);
    return { ok: true, data: { id: inserted.id } };
  });
}

export async function adminUpdateQuoteItem(
  input: UpdateQuoteItemInput,
): Promise<AdminActionResult<void>> {
  const parsed = updateQuoteItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row } = await admin
      .from("freight_quote_items")
      .select("id, freight_quote_id, quantity, unit_price_thb")
      .eq("id", d.id)
      .maybeSingle<{ id: string; freight_quote_id: string; quantity: number; unit_price_thb: number }>();
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent } = await admin
      .from("freight_quotes")
      .select("status")
      .eq("id", row.freight_quote_id)
      .maybeSingle<{ status: string }>();
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const newQty   = d.quantity       ?? Number(row.quantity);
    const newPrice = d.unit_price_thb ?? Number(row.unit_price_thb);
    const line_total_thb = Math.round(newQty * newPrice * 100) / 100;

    const patch: Record<string, unknown> = { line_total_thb };
    if (d.description    !== undefined) patch.description    = d.description;
    if (d.quantity       !== undefined) patch.quantity       = d.quantity;
    if (d.unit           !== undefined) patch.unit           = d.unit;
    if (d.unit_price_thb !== undefined) patch.unit_price_thb = d.unit_price_thb;
    if (d.note           !== undefined) patch.note           = d.note;

    const { error: updErr } = await admin
      .from("freight_quote_items")
      .update(patch)
      .eq("id", d.id);
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await recomputeQuoteTotals(row.freight_quote_id);

    await logAdminAction(adminId, "freight_quote.item_update", "freight_quote", row.freight_quote_id, {
      item_id:    d.id,
      patch,
    });

    revalidateOne(row.freight_quote_id);
    return { ok: true };
  });
}

export async function adminDeleteQuoteItem(
  input: DeleteQuoteItemInput,
): Promise<AdminActionResult<void>> {
  const parsed = deleteQuoteItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row } = await admin
      .from("freight_quote_items")
      .select("id, freight_quote_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; freight_quote_id: string }>();
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent } = await admin
      .from("freight_quotes")
      .select("status")
      .eq("id", row.freight_quote_id)
      .maybeSingle<{ status: string }>();
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    const { error: delErr } = await admin
      .from("freight_quote_items")
      .delete()
      .eq("id", d.id);
    if (delErr) return { ok: false, error: `delete_failed: ${delErr.message}` };

    await recomputeQuoteTotals(row.freight_quote_id);

    await logAdminAction(adminId, "freight_quote.item_delete", "freight_quote", row.freight_quote_id, {
      item_id: d.id,
    });

    revalidateOne(row.freight_quote_id);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Status flips
// ────────────────────────────────────────────────────────────

export async function adminSubmitQuoteForApproval(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    // Refuse if no items.
    const { count: itemsCount } = await admin
      .from("freight_quote_items")
      .select("*", { count: "exact", head: true })
      .eq("freight_quote_id", input.id);
    if (!itemsCount || itemsCount === 0) {
      return { ok: false, error: "no_items" };
    }

    await recomputeQuoteTotals(input.id);

    const res = await flipStatus(admin, input.id, "draft", "pending_approval", {});
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.submit_for_approval", "freight_quote", input.id, {});
    revalidateOne(input.id);
    return { ok: true };
  });
}

export async function adminApproveQuote(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_APPROVE], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipStatus(admin, input.id, "pending_approval", "approved", {
      approved_by_admin_id: adminId,
      approved_at:          now,
    });
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.approve", "freight_quote", input.id, {});
    revalidateOne(input.id);
    return { ok: true };
  });
}

export async function adminRejectQuote(
  input: RejectQuoteInput,
): Promise<AdminActionResult<void>> {
  const parsed = rejectQuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_APPROVE], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipStatus(admin, d.id, "pending_approval", "rejected", {
      rejected_reason:      d.rejected_reason,
      rejected_by_admin_id: adminId,
      rejected_at:          now,
    });
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.reject", "freight_quote", d.id, {
      rejected_reason: d.rejected_reason,
    });
    revalidateOne(d.id);
    return { ok: true };
  });
}

export async function adminSendQuote(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_SEND], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipStatus(admin, input.id, "approved", "sent", {
      sent_at: now,
    });
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.send", "freight_quote", input.id, {});
    revalidateOne(input.id);
    return { ok: true };
  });
}

export async function adminMarkQuoteAccepted(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_SEND], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipStatus(admin, input.id, "sent", "accepted", {
      accepted_at: now,
    });
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.mark_accepted", "freight_quote", input.id, {});
    revalidateOne(input.id);
    return { ok: true };
  });
}

export async function adminMarkQuoteExpired(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<void>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_SEND], async ({ adminId }) => {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const res = await flipStatus(admin, input.id, "sent", "expired", {
      expired_at: now,
    });
    if (!res.ok) return res;

    await logAdminAction(adminId, "freight_quote.mark_expired", "freight_quote", input.id, {});
    revalidateOne(input.id);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 5) Convert to freight_shipments — V-E1 dependency
// ────────────────────────────────────────────────────────────
// V1: returns `freight_shipments_table_not_ready` until V-E1 ships
// migration 0049 with `freight_shipments`. After 0049 lands, replace
// this body to actually insert + link converted_to_shipment_id.

export async function adminConvertQuoteToShipment(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<{ freight_shipment_id: string }>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_APPROVE], async () => {
    return { ok: false, error: "freight_shipments_table_not_ready" };
  });
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function flipStatus(
  admin:        AdminClient,
  id:           string,
  expectedFrom: string,
  to:           string,
  extra:        Record<string, unknown>,
): Promise<AdminActionResult<void>> {
  const { data: row } = await admin
    .from("freight_quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== expectedFrom) return { ok: false, error: `bad_status:${row.status}` };

  const { error: updErr } = await admin
    .from("freight_quotes")
    .update({ status: to, ...extra })
    .eq("id", id)
    .eq("status", expectedFrom);                                      // optimistic
  if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };
  return { ok: true };
}

async function recomputeQuoteTotals(quoteId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: itemsRaw } = await admin
    .from("freight_quote_items")
    .select("quantity, unit_price_thb")
    .eq("freight_quote_id", quoteId);
  const items = (itemsRaw ?? []) as Array<{ quantity: number; unit_price_thb: number }>;
  const { data: header } = await admin
    .from("freight_quotes")
    .select("vat_pct")
    .eq("id", quoteId)
    .maybeSingle<{ vat_pct: number }>();
  const vat_pct = Number(header?.vat_pct ?? 7);

  const totals = computeQuoteTotals({
    items: items.map((i) => ({ quantity: Number(i.quantity), unit_price_thb: Number(i.unit_price_thb) })),
    vat_pct,
  });

  await admin
    .from("freight_quotes")
    .update({
      subtotal:   totals.subtotal,
      vat_amount: totals.vat_amount,
      total:      totals.total,
    })
    .eq("id", quoteId);
}

function revalidateOne(quoteId: string): void {
  revalidatePath("/admin/freight/quotes");
  revalidatePath(`/admin/freight/quotes/${quoteId}`);
}

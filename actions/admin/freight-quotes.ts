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
  composeFromRateCardSchema, type ComposeFromRateCardInput,
  quoteIdOnlySchema,        type QuoteIdOnlyInput,
  rejectQuoteSchema,        type RejectQuoteInput,
  computeQuoteTotals,
  type QuoteUnit,
} from "@/lib/validators/freight-quote";
import { composeFreightQuote } from "@/lib/freight/rate-engine";
import { lookupChinaFreightCostThb } from "@/lib/freight/rate-lookup";
import { incursChinaFreightCost } from "@/lib/freight/rate-model";
import { getBusinessConfig } from "@/lib/business-config";

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

    const { data: before, error: beforeErr } = await admin
      .from("freight_quotes")
      .select("status, quote_no")
      .eq("id", d.id)
      .maybeSingle<{ status: string; quote_no: string }>();
    if (beforeErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: beforeErr.code, message: beforeErr.message });
      return { ok: false, error: `db_error:${beforeErr.code ?? "unknown"}` };
    }
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

    const { data: parent, error: parentErr } = await admin
      .from("freight_quotes")
      .select("status, quote_no")
      .eq("id", d.freight_quote_id)
      .maybeSingle<{ status: string; quote_no: string }>();
    if (parentErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    // Auto-assign position if not given.
    let position = d.position ?? 1;
    if (!d.position) {
      const { data: maxRow, error: maxRowErr } = await admin
        .from("freight_quote_items")
        .select("position")
        .eq("freight_quote_id", d.freight_quote_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      if (maxRowErr) {
        console.error(`[freight_quote_items list] failed`, { code: maxRowErr.code, message: maxRowErr.message });
      }
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

// ────────────────────────────────────────────────────────────
// 3b) Auto-fill from the AXELRA rate card (Phase D rate engine)
// ────────────────────────────────────────────────────────────
// Replaces hand-typing each line: composeFreightQuote() prices the in-scope
// Thai-customs + China-freight lines from lib/freight/rate-model (the real
// AXELRA IMPORT cards), then bulk-inserts them into the draft quote and aligns
// the header (mode/incoterm/vat). Internal only — adds draft line items, NO
// customer comms. The owner reviews + can edit/submit afterwards.

const RATE_UNIT_MAP: Record<string, QuoteUnit> = {
  SET: "JOB", CBM: "CBM", KGM: "KGM", CONT: "TEU",
};

type ComposeResult = {
  count: number;
  subtotalSell: number;
  profit: number;
  marginCapThb: number;
  marginExceedsCap: boolean;
  /** true → `profit` is GROSS (China freight/origin cost not modelled yet). */
  freightCostPending: boolean;
  /** W5 — true → no tb_freight_rate matched → cost lookup failed (gross-only · yellow banner). */
  chinaCostLookupError: boolean;
};

export async function adminComposeQuoteFromRateCard(
  input: ComposeFromRateCardInput,
): Promise<AdminActionResult<ComposeResult>> {
  const parsed = composeFromRateCardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_CREATE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: parent, error: parentErr } = await admin
      .from("freight_quotes")
      .select("status, quote_no")
      .eq("id", d.freight_quote_id)
      .maybeSingle<{ status: string; quote_no: string }>();
    if (parentErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
    if (!parent) return { ok: false, error: "not_found" };
    if (parent.status !== "draft") return { ok: false, error: "not_draft" };

    // 0145 — look up the admin-maintained China freight cost (FX-converted) so the
    // quote's profit is a TRUE NET margin. null (no rate seeded) → gross fallback.
    // SF-1: ONLY fold the China freight cost when this incoterm's scope actually
    // includes freight/origin (CFR/CPT/CIP/EXW/…). For CIF/FOB the seller already
    // paid the China freight — we neither sell nor incur it, so folding the looked-up
    // cost would understate the NET margin. Skip the lookup → cost stays null.
    const incursChinaFreight = incursChinaFreightCost(d.incoterm);
    const chinaFreightCostThb = incursChinaFreight
      ? await lookupChinaFreightCostThb(d.mode, { cbm: d.cbm, kgm: d.kgm, containers: d.containers })
      : null;
    // W5 — when the China-side scope IS billed but no cost rate matched, profit is
    // GROSS only → flag it so the UI shows a "ก่อนหักต้นทุนเฟรทจีน" yellow banner.
    const chinaCostLookupError = incursChinaFreight && chinaFreightCostThb == null;

    // Price from the real rate cards (pure, no IO) + the looked-up China cost.
    const quote = composeFreightQuote({
      mode:          d.mode,
      incoterm:      d.incoterm,
      deliveryTruck: d.deliveryTruck,
      tier:          d.tier,
      cbm:           d.cbm,
      kgm:           d.kgm,
      containers:    d.containers,
      chinaFreightCostThb: chinaFreightCostThb ?? undefined,
    });
    if (quote.lines.length === 0) {
      return { ok: false, error: "rate_card_produced_no_lines" };
    }

    // Optionally clear existing draft items first (replace vs append).
    if (d.replaceExisting) {
      const { error: delErr } = await admin
        .from("freight_quote_items")
        .delete()
        .eq("freight_quote_id", d.freight_quote_id);
      if (delErr) return { ok: false, error: `clear_failed: ${delErr.message}` };
    }

    // Starting position = max existing + 1 (0 after a replace).
    let basePos = 0;
    if (!d.replaceExisting) {
      const { data: maxRow, error: maxRowErr } = await admin
        .from("freight_quote_items")
        .select("position")
        .eq("freight_quote_id", d.freight_quote_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle<{ position: number }>();
      if (maxRowErr) {
        console.error(`[freight_quote_items list] failed`, { code: maxRowErr.code, message: maxRowErr.message });
      }
      basePos = maxRow?.position ?? 0;
    }

    const rows = quote.lines.map((l, i) => ({
      freight_quote_id:      d.freight_quote_id,
      position:              basePos + i + 1,
      description:           l.labelTh,
      quantity:              l.qty,
      unit:                  RATE_UNIT_MAP[l.unit] ?? "JOB",
      unit_price_thb:        Math.round(l.unitSell * 100) / 100,
      line_total_thb:        Math.round(l.sell * 100) / 100,
      note:                  null as string | null,
      // W5 (0165) — per-line commission snapshot (display/analytics only).
      commission_scope:      l.scope,
      commission_pct:        l.commissionPct,
      commission_amount_thb: l.commissionThb,
    }));

    const { error: insErr } = await admin
      .from("freight_quote_items")
      .insert(rows);
    if (insErr) return { ok: false, error: `insert_failed: ${insErr.message}` };

    // Align the header to the spec + persist the W5 P&L/margin flags (draft-only —
    // guarded above). These are DISPLAY/ANALYTICS snapshots — they never touch the
    // money path. `marginExceedsCap` is ADVISORY (the save is never blocked).
    await admin
      .from("freight_quotes")
      .update({
        transport_mode:          d.mode,
        incoterm:                d.incoterm,
        vat_pct:                 quote.vatPct,
        profit_margin_thb:       quote.profit,
        margin_exceeds_cap:      quote.marginExceedsCap,
        china_cost_lookup_error: chinaCostLookupError,
        commission_calc_status:  quote.chinaCostPending ? "gross_only" : "computed",
        cost_china_freight_thb:  quote.chinaFreightCostThb,
        cost_local_thb:          Math.round((quote.subtotalCost - quote.chinaFreightCostThb) * 100) / 100,
        cost_total_thb:          quote.subtotalCost,
      })
      .eq("id", d.freight_quote_id)
      .eq("status", "draft");

    await recomputeQuoteTotals(d.freight_quote_id);

    await logAdminAction(adminId, "freight_quote.compose_from_rate_card", "freight_quote", d.freight_quote_id, {
      quote_no:           parent.quote_no,
      mode:               d.mode,
      incoterm:           d.incoterm,
      tier:               d.tier,
      delivery_truck:     d.deliveryTruck,
      cbm:                d.cbm ?? null,
      kgm:                d.kgm ?? null,
      containers:         d.containers ?? null,
      replaced:           d.replaceExisting,
      lines_added:        rows.length,
      subtotal_sell:        quote.subtotalSell,
      profit:               quote.profit,
      margin_cap_thb:       quote.marginCapThb,
      margin_exceeds_cap:   quote.marginExceedsCap,
      china_cost_pending:   quote.chinaCostPending,
      china_cost_lookup_error: chinaCostLookupError,
      commission_gross:     quote.commission.gross,
      commission_net:       quote.commission.net,
    });

    revalidateOne(d.freight_quote_id);
    return {
      ok: true,
      data: {
        count:                rows.length,
        subtotalSell:         quote.subtotalSell,
        profit:               quote.profit,
        marginCapThb:         quote.marginCapThb,
        marginExceedsCap:     quote.marginExceedsCap,
        freightCostPending:   quote.chinaCostPending,
        chinaCostLookupError,
      },
    };
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

    const { data: row, error: rowErr } = await admin
      .from("freight_quote_items")
      .select("id, freight_quote_id, quantity, unit_price_thb")
      .eq("id", d.id)
      .maybeSingle<{ id: string; freight_quote_id: string; quantity: number; unit_price_thb: number }>();
    if (rowErr) {
      console.error(`[freight_quote_items mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("freight_quotes")
      .select("status")
      .eq("id", row.freight_quote_id)
      .maybeSingle<{ status: string }>();
    if (parentErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
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

    const { data: row, error: rowErr } = await admin
      .from("freight_quote_items")
      .select("id, freight_quote_id")
      .eq("id", d.id)
      .maybeSingle<{ id: string; freight_quote_id: string }>();
    if (rowErr) {
      console.error(`[freight_quote_items mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };

    const { data: parent, error: parentErr } = await admin
      .from("freight_quotes")
      .select("status")
      .eq("id", row.freight_quote_id)
      .maybeSingle<{ status: string }>();
    if (parentErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: parentErr.code, message: parentErr.message });
      return { ok: false, error: `db_error:${parentErr.code ?? "unknown"}` };
    }
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

    // U1-4 auto-chain: auto-convert into a freight_shipments row if the quote
    // has a profile_id and hasn't been converted yet. Best-effort — parent
    // flip already committed; failure here (e.g. cold quote without profile_id,
    // or transient DB error) must not block accept. Race-safe: re-reads
    // converted_to_shipment_id, and the UNIQUE index on source_quote_id
    // (migration 0050) means concurrent converts collapse to one shipment.
    try {
      const { data: quoteRow, error: quoteRowErr } = await admin
        .from("freight_quotes")
        .select("profile_id, converted_to_shipment_id")
        .eq("id", input.id)
        .maybeSingle<{ profile_id: string | null; converted_to_shipment_id: string | null }>();
      if (quoteRowErr) {
        console.error(`[freight_quotes list] failed`, { code: quoteRowErr.code, message: quoteRowErr.message });
      }

      if (quoteRow && !quoteRow.converted_to_shipment_id && quoteRow.profile_id) {
        const convertRes = await adminConvertQuoteToShipment({ id: input.id });
        if (convertRes.ok) {
          await logAdminAction(
            adminId,
            "freight_quote.auto_convert_on_accept",
            "freight_quote",
            input.id,
            { result: "converted", freight_shipment_id: convertRes.data?.freight_shipment_id ?? null },
          );
        } else {
          await logAdminAction(
            adminId,
            "freight_quote.auto_convert_on_accept",
            "freight_quote",
            input.id,
            { result: "failed", error: convertRes.error },
          );
        }
      } else {
        // Cold quote (no profile_id) or already converted — admin can still
        // convert manually later (after attaching a profile) via the convert button.
        await logAdminAction(
          adminId,
          "freight_quote.auto_convert_on_accept",
          "freight_quote",
          input.id,
          {
            result: quoteRow?.converted_to_shipment_id ? "skipped_already_converted" : "skipped_no_profile",
            freight_shipment_id: quoteRow?.converted_to_shipment_id ?? null,
          },
        );
      }
    } catch (e) {
      await logAdminAction(
        adminId,
        "freight_quote.auto_convert_on_accept",
        "freight_quote",
        input.id,
        { result: "exception", error: e instanceof Error ? e.message : String(e) },
      );
    }

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
// 5) Convert to freight_shipments — V-E1 wired (migration 0050)
// ────────────────────────────────────────────────────────────
// Creates a freight_shipments row from an accepted quote. Maps the quote's
// transport_mode + ports + incoterm + customer pointer into the shipment;
// the shipment's commercial value block + parties are filled later via the
// freight-shipments admin UI (separate concerns: quote = sales agreement,
// shipment = the actual goods + customs).
//
// Idempotency: UNIQUE on freight_shipments.source_quote_id prevents
// double-conversion at the DB level (per migration 0050). If a peer beats
// us, we re-SELECT the existing shipment and return it.

export async function adminConvertQuoteToShipment(
  input: QuoteIdOnlyInput,
): Promise<AdminActionResult<{ freight_shipment_id: string }>> {
  const parsed = quoteIdOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  return withAdmin([...ROLES_APPROVE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: quote, error: quoteErr } = await admin
      .from("freight_quotes")
      .select("id, quote_no, status, profile_id, buyer_name_snapshot, buyer_contact_snapshot, transport_mode, port_loading, port_discharge, place_delivery, incoterm, converted_to_shipment_id, notes, cost_china_freight_thb, cost_local_thb, cost_total_thb, profit_margin_thb, margin_exceeds_cap")
      .eq("id", input.id)
      .maybeSingle<{
        id: string; quote_no: string; status: string;
        profile_id: string | null;
        buyer_name_snapshot: string; buyer_contact_snapshot: string | null;
        transport_mode: string;
        port_loading: string | null; port_discharge: string | null; place_delivery: string | null;
        incoterm: string | null;
        converted_to_shipment_id: string | null;
        notes: string | null;
        // W5 (0165) — cost/margin snapshot the compose action persisted onto the quote.
        cost_china_freight_thb: number | null;
        cost_local_thb: number | null;
        cost_total_thb: number | null;
        profit_margin_thb: number | null;
        margin_exceeds_cap: boolean | null;
      }>();
    if (quoteErr) {
      console.error(`[freight_quotes mutation lookup] failed`, { code: quoteErr.code, message: quoteErr.message });
      return { ok: false, error: `db_error:${quoteErr.code ?? "unknown"}` };
    }
    if (!quote) return { ok: false, error: "not_found" };
    if (quote.status !== "accepted") return { ok: false, error: "not_accepted" };
    if (!quote.profile_id)           return { ok: false, error: "quote_has_no_profile" };
    if (quote.converted_to_shipment_id) {
      return { ok: true, data: { freight_shipment_id: quote.converted_to_shipment_id } };
    }

    // Reserve job_no.
    const { data: jobNo, error: serialErr } = await admin.rpc("next_freight_job_no");
    if (serialErr || typeof jobNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    // W5 (0165) — the policy margin cap snapshot (business_config · default 15k).
    // ADVISORY ONLY — convert is NEVER blocked by the cap (owner decides hard-gate).
    const marginCapThb = await getBusinessConfig<number>("freight.margin_cap_thb", 15_000);

    // Combine buyer + contact into a notes blob for the shipment so the
    // info isn't lost. Parties (shipper/consignee) need to be filled
    // separately via the freight-shipments admin UI.
    const initialNotes = [
      `แปลงจากใบเสนอราคา ${quote.quote_no}`,
      `Buyer: ${quote.buyer_name_snapshot}`,
      quote.buyer_contact_snapshot ? `Contact: ${quote.buyer_contact_snapshot}` : null,
      quote.notes ? `Quote notes: ${quote.notes}` : null,
    ].filter(Boolean).join("\n");

    const { data: inserted, error: insErr } = await admin
      .from("freight_shipments")
      .insert({
        profile_id:          quote.profile_id,
        status:              "draft",
        transport_mode:      quote.transport_mode,
        port_loading:        quote.port_loading,
        port_discharge:      quote.port_discharge,
        place_delivery:      quote.place_delivery,
        incoterm:            quote.incoterm,
        origin_country:      "CHINA",
        source_quote_id:     quote.id,
        notes:               initialNotes,
        job_no:              jobNo,
        created_by_admin_id: adminId,
        // W5 (0165) — freeze the quote's cost/margin block onto the shipment.
        // DISPLAY/ANALYTICS snapshot — never a money-path value. Null-safe (a
        // cold/manually-built quote that was never composed leaves these NULL).
        cost_china_freight_thb:           quote.cost_china_freight_thb,
        cost_local_thb:                   quote.cost_local_thb,
        cost_total_thb:                   quote.cost_total_thb,
        profit_margin_thb:                quote.profit_margin_thb,
        margin_exceeds_cap_at_conversion: quote.margin_exceeds_cap,
        margin_cap_thb:                   marginCapThb,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    // UNIQUE on source_quote_id may fire if a concurrent convert won.
    if (insErr && (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message))) {
      const { data: peer, error: peerErr } = await admin
        .from("freight_shipments")
        .select("id")
        .eq("source_quote_id", quote.id)
        .maybeSingle<{ id: string }>();
      if (peerErr) {
        console.error(`[freight_shipments mutation lookup] failed`, { code: peerErr.code, message: peerErr.message });
        return { ok: false, error: `db_error:${peerErr.code ?? "unknown"}` };
      }
      if (!peer) return { ok: false, error: "convert_race: 23505 but no peer shipment" };
      // Backfill the quote link on our side too (best-effort).
      await admin
        .from("freight_quotes")
        .update({ converted_to_shipment_id: peer.id })
        .eq("id", quote.id)
        .is("converted_to_shipment_id", null);
      revalidatePath(`/admin/freight/quotes/${quote.id}`);
      revalidatePath(`/admin/freight/shipments/${peer.id}`);
      return { ok: true, data: { freight_shipment_id: peer.id } };
    }
    if (insErr || !inserted) {
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    // Backlink the quote → shipment.
    const { error: linkErr } = await admin
      .from("freight_quotes")
      .update({ converted_to_shipment_id: inserted.id })
      .eq("id", quote.id)
      .is("converted_to_shipment_id", null);
    if (linkErr) {
      // Soft-fail — shipment exists, link can be repaired manually.
      await logAdminAction(adminId, "freight_quote.convert_link_failed", "freight_quote", quote.id, {
        shipment_id: inserted.id,
        error:       linkErr.message,
      });
    }

    await logAdminAction(adminId, "freight_quote.convert", "freight_quote", quote.id, {
      quote_no:               quote.quote_no,
      job_no:                 jobNo,
      shipment_id:            inserted.id,
      // W5 — record the snapshot copied onto the shipment.
      cost_total_thb:         quote.cost_total_thb,
      profit_margin_thb:      quote.profit_margin_thb,
      margin_exceeds_cap:     quote.margin_exceeds_cap,
      margin_cap_thb:         marginCapThb,
    });

    revalidatePath(`/admin/freight/quotes/${quote.id}`);
    revalidatePath(`/admin/freight/shipments/${inserted.id}`);
    return { ok: true, data: { freight_shipment_id: inserted.id } };
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
  const { data: row, error: rowErr } = await admin
    .from("freight_quotes")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();
  if (rowErr) {
    console.error(`[freight_quotes mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
    return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
  }
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
  const { data: itemsRaw, error: itemsRawErr } = await admin
    .from("freight_quote_items")
    .select("quantity, unit_price_thb")
    .eq("freight_quote_id", quoteId);
  if (itemsRawErr) {
    console.error(`[freight_quote_items list] failed`, { code: itemsRawErr.code, message: itemsRawErr.message });
  }
  const items = (itemsRaw ?? []) as Array<{ quantity: number; unit_price_thb: number }>;
  const { data: header, error: headerErr } = await admin
    .from("freight_quotes")
    .select("vat_pct")
    .eq("id", quoteId)
    .maybeSingle<{ vat_pct: number }>();
  if (headerErr) {
    console.error(`[freight_quotes list] failed`, { code: headerErr.code, message: headerErr.message });
  }
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

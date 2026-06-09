"use server";

/**
 * Freight RFQ leads-inbox admin actions — the single highest-value freight
 * delta. Opens the freight revenue line by giving staff a way to VIEW / TRIAGE
 * / CONVERT the inbound `freight_quote` (singular) leads that the public
 * /freight-quote wizard captures.
 *
 * ⚠️ NAMING (two distinct tables — see migration 0134 header):
 *   • `freight_quote`  (singular) = the PUBLIC inbound RFQ / lead. THIS file's
 *                       subject. Anon-insertable; staff triages it here.
 *   • `freight_quotes` (plural)   = the admin-issued B2B QUOTATION (0048) with
 *                       line items + approval. `convertLeadToQuote` SEEDS a
 *                       DRAFT row in this table from a lead — a salesperson
 *                       then reviews/prices/sends it via the existing
 *                       /admin/freight/quotes/[id] editor.
 *
 * CONVERT SAFETY: convert creates a DRAFT quotation only — NO customer money,
 * NO customer comms, NO sending. It marks the lead `quoted` and stamps the lead
 * with the new quote id so it isn't converted twice.
 *
 * RBAC: super / ops / sales_admin (mirrors the freight-quotes lane's create set,
 * minus accounting — leads triage is a sales-funnel task). super is auto-included
 * by requireAdmin.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { composeFreightQuote } from "@/lib/freight/rate-engine";
import {
  computeQuoteTotals,
  type TransportMode,
  type Incoterm,
  type QuoteUnit,
} from "@/lib/validators/freight-quote";

// Triage roles — sales funnel ownership.
const ROLES_TRIAGE = ["super", "ops", "sales_admin"] as const;

// Allowed lead statuses (mirror migration 0134's freight_quote_status CHECK).
// Kept as a module const (a "use server" file may only EXPORT async functions).
const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

const PAGE_SIZE = 50;

// ────────────────────────────────────────────────────────────
// Row shape returned to the inbox list.
// ────────────────────────────────────────────────────────────

export type FreightLeadRow = {
  id: string;
  ref: string;
  status: string;
  customer_type: string;
  service: string;
  transport: string | null;
  incoterm: string | null;
  load_type: string | null;
  origin: string | null;
  destination: string | null;
  contact_name: string;
  contact_phone: string;
  contact_pref: string;
  est_total_thb: number | null;
  assigned_admin_id: string | null;
  created_at: string;
};

export type FreightLeadsFilter = {
  /** Status chip, or null = "ทั้งหมด". */
  status?: string | null;
  /** Free-text search over ref / contact_name / contact_phone. */
  q?: string;
  /** 1-based page. */
  page?: number;
};

export type FreightLeadsPage = {
  rows: FreightLeadRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Per-status counts for the filter chips. */
  counts: Record<string, number>;
};

const SELECT_COLS =
  "id, ref, status, customer_type, service, transport, incoterm, load_type, origin, destination, contact_name, contact_phone, contact_pref, est_total_thb, assigned_admin_id, created_at";

/**
 * List freight RFQ leads (paginated) with an optional status filter + free-text
 * search. Read-only — used by the inbox list page. Returns empty page on error
 * (logged) so the UI degrades gracefully instead of throwing.
 */
export async function getFreightLeads(filter: FreightLeadsFilter): Promise<FreightLeadsPage> {
  // Read-only, but still admin-gated.
  await withAdmin([...ROLES_TRIAGE], async () => ({ ok: true as const }));

  const admin = createAdminClient();

  const status =
    filter.status && (LEAD_STATUSES as readonly string[]).includes(filter.status)
      ? (filter.status as LeadStatus)
      : null;
  const q = filter.q?.trim() ?? "";
  const page = filter.page && filter.page >= 1 ? Math.floor(filter.page) : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin
    .from("freight_quote")
    .select(SELECT_COLS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `ref.ilike.%${q}%,contact_name.ilike.%${q}%,contact_phone.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) {
    console.error(`[getFreightLeads freight_quote] failed`, { code: error.code, message: error.message });
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE, counts: {} };
  }

  // Per-status counts for the chips (one light query — status only).
  const counts: Record<string, number> = {};
  for (const s of LEAD_STATUSES) counts[s] = 0;
  const { data: countRows, error: countErr } = await admin.from("freight_quote").select("status");
  if (countErr) {
    console.error(`[getFreightLeads counts] failed`, { code: countErr.code, message: countErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return {
    rows: (data ?? []) as unknown as FreightLeadRow[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    counts,
  };
}

/** Resolve a lead by its public ref OR its uuid id. */
async function findLeadId(
  admin: ReturnType<typeof createAdminClient>,
  refOrId: string,
): Promise<{ id: string; ref: string } | null> {
  const trimmed = refOrId.trim();
  if (!trimmed) return null;
  // refs are AX-YYYY-NNNNN; ids are uuids. Try ref first, then id.
  const { data: byRef, error: byRefErr } = await admin
    .from("freight_quote")
    .select("id, ref")
    .eq("ref", trimmed)
    .maybeSingle<{ id: string; ref: string }>();
  if (byRefErr) {
    console.error(`[findLeadId ref] failed`, { code: byRefErr.code, message: byRefErr.message });
  }
  if (byRef) return byRef;

  const { data: byId, error: byIdErr } = await admin
    .from("freight_quote")
    .select("id, ref")
    .eq("id", trimmed)
    .maybeSingle<{ id: string; ref: string }>();
  if (byIdErr) {
    console.error(`[findLeadId id] failed`, { code: byIdErr.code, message: byIdErr.message });
  }
  return byId ?? null;
}

// ────────────────────────────────────────────────────────────
// Triage: set status (+ optional note appended to the lead's note).
// ────────────────────────────────────────────────────────────

export async function setFreightLeadStatus(
  refOrId: string,
  status: string,
  note?: string,
): Promise<AdminActionResult<void>> {
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "invalid_status" };
  }
  return withAdmin([...ROLES_TRIAGE], async ({ adminId }) => {
    const admin = createAdminClient();
    const lead = await findLeadId(admin, refOrId);
    if (!lead) return { ok: false, error: "not_found" };

    const patch: Record<string, unknown> = { status };
    // Append an optional triage note (keep history — prepend timestamped line).
    if (note && note.trim()) {
      const { data: current, error: curErr } = await admin
        .from("freight_quote")
        .select("note")
        .eq("id", lead.id)
        .maybeSingle<{ note: string | null }>();
      if (curErr) {
        console.error(`[setFreightLeadStatus read] failed`, { code: curErr.code, message: curErr.message });
      }
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const line = `[${stamp} · ${status}] ${note.trim()}`;
      patch.note = current?.note ? `${line}\n${current.note}` : line;
    }

    const { error: updErr } = await admin.from("freight_quote").update(patch).eq("id", lead.id);
    if (updErr) {
      console.error(`[setFreightLeadStatus update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_lead.set_status", "freight_quote", lead.id, {
      ref: lead.ref,
      status,
      note: note?.trim() || undefined,
    });

    revalidatePath("/admin/freight/leads");
    revalidatePath(`/admin/freight/leads/${lead.ref}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Triage: assign a lead to an admin (ownership).
// ────────────────────────────────────────────────────────────

export async function assignFreightLead(
  refOrId: string,
  adminToAssign: string,
): Promise<AdminActionResult<void>> {
  return withAdmin([...ROLES_TRIAGE], async ({ adminId }) => {
    const admin = createAdminClient();
    const lead = await findLeadId(admin, refOrId);
    if (!lead) return { ok: false, error: "not_found" };

    const assignedTo = adminToAssign.trim() || null;

    const { error: updErr } = await admin
      .from("freight_quote")
      .update({ assigned_admin_id: assignedTo })
      .eq("id", lead.id);
    if (updErr) {
      console.error(`[assignFreightLead update] failed`, { code: updErr.code, message: updErr.message });
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_lead.assign", "freight_quote", lead.id, {
      ref: lead.ref,
      assigned_admin_id: assignedTo,
    });

    revalidatePath("/admin/freight/leads");
    revalidatePath(`/admin/freight/leads/${lead.ref}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Convert a lead → a DRAFT freight_quotes (plural) quotation.
// ────────────────────────────────────────────────────────────
// Seeds the formal B2B quotation header from the lead's fields, optionally runs
// the rate-engine auto-fill (when the lead carries enough pricing drivers), and
// marks the lead `quoted`. Returns the new quote id so the UI can route the
// salesperson straight to /admin/freight/quotes/[id] to review/price/send.
//
// SAFETY: this only creates a DRAFT — no money moves, no customer comms.

/** Map the lead's transport (sea|air|truck) + load_type (FCL|LCL) → quote's
 *  transport_mode (sea_fcl|sea_lcl|truck|air). Defaults to sea_lcl when the
 *  lead didn't specify (a sane sea-LCL default — salesperson can change it). */
function leadToTransportMode(transport: string | null, loadType: string | null): TransportMode {
  if (transport === "air") return "air";
  if (transport === "truck") return "truck";
  // sea (or unspecified) → split by load_type.
  if (loadType === "FCL") return "sea_fcl";
  return "sea_lcl";
}

/** The lead's incoterm subset (EXW|FOB|CIF|DDP|CFR) is all valid INCOTERMS. */
function leadIncoterm(incoterm: string | null): Incoterm | null {
  const ok: Incoterm[] = ["EXW", "FOB", "CIF", "DDP", "CFR"];
  return incoterm && (ok as string[]).includes(incoterm) ? (incoterm as Incoterm) : null;
}

const RATE_UNIT_MAP: Record<string, QuoteUnit> = {
  SET: "JOB", CBM: "CBM", KGM: "KGM", CONT: "TEU",
};

type ConvertResult = { freight_quote_id: string; quote_no: string; lines_added: number };

export async function convertLeadToQuote(
  refOrId: string,
): Promise<AdminActionResult<ConvertResult>> {
  return withAdmin([...ROLES_TRIAGE], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load the full lead.
    const { data: lead, error: leadErr } = await admin
      .from("freight_quote")
      .select(
        "id, ref, status, customer_type, transport, incoterm, load_type, origin, destination, product, cbm, weight_kg, goods_value_usd, contact_name, contact_phone, contact_line, contact_email, note, profile_id",
      )
      .eq(/^[0-9a-f-]{36}$/i.test(refOrId.trim()) ? "id" : "ref", refOrId.trim())
      .maybeSingle<{
        id: string; ref: string; status: string;
        customer_type: string;
        transport: string | null; incoterm: string | null; load_type: string | null;
        origin: string | null; destination: string | null; product: string | null;
        cbm: number | null; weight_kg: number | null; goods_value_usd: number | null;
        contact_name: string; contact_phone: string;
        contact_line: string | null; contact_email: string | null;
        note: string | null; profile_id: string | null;
      }>();
    if (leadErr) {
      console.error(`[convertLeadToQuote lead lookup] failed`, { code: leadErr.code, message: leadErr.message });
      return { ok: false, error: `db_error:${leadErr.code ?? "unknown"}` };
    }
    if (!lead) return { ok: false, error: "not_found" };

    const transportMode = leadToTransportMode(lead.transport, lead.load_type);
    const incoterm = leadIncoterm(lead.incoterm);

    // Reserve the formal quote serial (FQYYMMDD-NNNN).
    const { data: quoteNo, error: serialErr } = await admin.rpc("next_freight_quote_no");
    if (serialErr || typeof quoteNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    // Contact snapshot blob (so nothing is lost on the quotation side).
    const contactSnapshot = [
      lead.contact_name,
      `โทร ${lead.contact_phone}`,
      lead.contact_line ? `LINE ${lead.contact_line}` : null,
      lead.contact_email ? lead.contact_email : null,
    ].filter(Boolean).join("\n");

    const notesBlob = [
      `แปลงจาก RFQ lead ${lead.ref}`,
      lead.product ? `สินค้า: ${lead.product}` : null,
      lead.goods_value_usd ? `มูลค่าสินค้า ~$${lead.goods_value_usd}` : null,
      lead.cbm ? `CBM: ${lead.cbm}` : null,
      lead.weight_kg ? `น้ำหนัก: ${lead.weight_kg} kg` : null,
      lead.note ? `หมายเหตุลูกค้า: ${lead.note}` : null,
    ].filter(Boolean).join("\n");

    // 1) Seed the DRAFT quotation header.
    const { data: inserted, error: insErr } = await admin
      .from("freight_quotes")
      .insert({
        quote_no:               quoteNo,
        status:                 "draft",
        profile_id:             lead.profile_id ?? null,
        buyer_name_snapshot:    lead.contact_name || "ลูกค้า RFQ",
        buyer_tax_id_snapshot:  null,
        buyer_contact_snapshot: contactSnapshot,
        transport_mode:         transportMode,
        port_loading:           lead.origin ?? null,
        port_discharge:         lead.destination ?? null,
        place_delivery:         lead.destination ?? null,
        incoterm:               incoterm,
        currency:               "THB",
        vat_pct:                7.0,
        subtotal:               0,
        vat_amount:             0,
        total:                  0,
        notes:                  notesBlob,
        created_by_admin_id:    adminId,
      })
      .select("id, quote_no")
      .single<{ id: string; quote_no: string }>();
    if (insErr || !inserted) {
      console.error(`[convertLeadToQuote insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed: ${insErr?.message ?? "no_row"}` };
    }

    const newQuoteId = inserted.id;

    // 2) Best-effort rate-engine auto-fill. Only attempt when we have an
    //    incoterm + at least one volumetric driver — otherwise leave the draft
    //    empty for the salesperson to price by hand. Failure here NEVER blocks
    //    the convert (the draft already exists + is editable).
    let linesAdded = 0;
    if (incoterm && (lead.cbm || lead.weight_kg)) {
      try {
        const quote = composeFreightQuote({
          mode:     transportMode,
          incoterm,
          tier:     "regular",
          cbm:      lead.cbm ?? undefined,
          kgm:      lead.weight_kg ?? undefined,
        });
        if (quote.lines.length > 0) {
          const rows = quote.lines.map((l, i) => ({
            freight_quote_id:      newQuoteId,
            position:              i + 1,
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
          const { error: itemsErr } = await admin.from("freight_quote_items").insert(rows);
          if (itemsErr) {
            console.error(`[convertLeadToQuote items] failed`, { code: itemsErr.code, message: itemsErr.message });
          } else {
            linesAdded = rows.length;
            // Recompute header totals from the seeded items.
            const totals = computeQuoteTotals({
              items: rows.map((r) => ({ quantity: r.quantity, unit_price_thb: r.unit_price_thb })),
              vat_pct: quote.vatPct,
            });
            await admin
              .from("freight_quotes")
              .update({
                vat_pct:    quote.vatPct,
                subtotal:   totals.subtotal,
                vat_amount: totals.vat_amount,
                total:      totals.total,
                // W5 (0165) — persist the P&L/margin snapshot for the P&L dashboard.
                profit_margin_thb:       quote.profit,
                margin_exceeds_cap:      quote.marginExceedsCap,
                china_cost_lookup_error: quote.chinaCostPending,
                commission_calc_status:  quote.chinaCostPending ? "gross_only" : "computed",
                cost_china_freight_thb:  quote.chinaFreightCostThb,
                cost_local_thb:          Math.round((quote.subtotalCost - quote.chinaFreightCostThb) * 100) / 100,
                cost_total_thb:          quote.subtotalCost,
              })
              .eq("id", newQuoteId)
              .eq("status", "draft");
          }
        }
      } catch (e) {
        console.error(`[convertLeadToQuote rate-engine] threw`, e instanceof Error ? e.message : String(e));
      }
    }

    // 3) Mark the lead `quoted` + stamp the new quote ref into the lead note
    //    so it isn't converted again by accident.
    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const convertLine = `[${stamp} · quoted] แปลงเป็นใบเสนอราคา ${inserted.quote_no}`;
    const newNote = lead.note ? `${convertLine}\n${lead.note}` : convertLine;
    const { error: leadUpdErr } = await admin
      .from("freight_quote")
      .update({ status: "quoted", note: newNote })
      .eq("id", lead.id);
    if (leadUpdErr) {
      // Soft-fail — the quotation exists; the lead status can be fixed by hand.
      console.error(`[convertLeadToQuote lead status] failed`, { code: leadUpdErr.code, message: leadUpdErr.message });
    }

    await logAdminAction(adminId, "freight_lead.convert_to_quote", "freight_quote", lead.id, {
      ref:              lead.ref,
      freight_quote_id: newQuoteId,
      quote_no:         inserted.quote_no,
      lines_added:      linesAdded,
    });

    revalidatePath("/admin/freight/leads");
    revalidatePath(`/admin/freight/leads/${lead.ref}`);
    revalidatePath("/admin/freight/quotes");
    revalidatePath(`/admin/freight/quotes/${newQuoteId}`);

    return {
      ok: true,
      data: { freight_quote_id: newQuoteId, quote_no: inserted.quote_no, lines_added: linesAdded },
    };
  });
}

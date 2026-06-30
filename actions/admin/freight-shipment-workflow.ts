"use server";

/**
 * Freight shipment WORKFLOW actions — the per-flavour JOURNEY status axis.
 *
 * This is the THIRD status axis (G2 · brief §1c) layered ON TOP of the existing
 * freight spine, orthogonal to:
 *   - `freight_shipments.status`        (the flat 6-state lifecycle · freight-shipments.ts)
 *   - `freight_job_operations.*_status` (the 4-stage AX-JOB ownership · freight-ops-cockpit.ts)
 *
 * Exports (async only — "use server" build-trap):
 *   advanceFreightStatus({ shipmentId, toStatus, note?, milestoneDate? })
 *       gated per the 8-role matrix (canRoleSetStatus) · writes journey_status
 *       + a freight_shipment_status_log row + the code's milestone date.
 *   setFreightRedFlag({ shipmentId, flag, reason? })
 *       sets/clears the RED overlay (issue_flag + issue_note) — NOT a status.
 *   createFreightShipmentFromQuote({ quoteId })
 *       booking → shipment seam (reserves a job_no, copies the quote header +
 *       value figures as-is, seeds journey_status = PENDING).
 *
 * 💰 MONEY-UNTOUCHED (HARD INVARIANT): none of these actions read or write ANY
 *    money column — not commercial_value_*, declared_*, duty_*, vat_*, invoices,
 *    payments, commission, P&L. They mutate ONLY:
 *      freight_shipments.journey_status / issue_flag / issue_note / <milestone date>
 *      freight_shipment_status_log (insert)
 *    The booking→shipment seam COPIES the quote's existing value figures verbatim
 *    (no re-pricing, no new arithmetic) so it never originates a money number.
 *
 * 🔌 SCHEMA SEAM: the journey columns + the status-log table are a Foundation-lane
 *    migration that has NOT landed yet. Every write here is DEFENSIVE: a Postgres
 *    "undefined column / undefined table" error (42703 / 42P01) is caught and
 *    returned as `schema_not_migrated` so the action NO-OPS safely on a prod that
 *    hasn't applied the migration — it never crashes the page. Once the migration
 *    lands, the same code writes for real with zero changes.
 *
 * Audit: every mutation writes admin_audit_log (logAdminAction · ADR-0014).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles, isGodRole } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  ALL_JOURNEY_CODES,
  ISSUE_FLAGS,
  INITIAL_JOURNEY_CODE,
  JOURNEY_CODE_META,
  JOURNEY_MODE_LABEL,
  canRoleSetStatus,
  mainStatusOf,
  resolveJourneyMode,
  isCodeInPipeline,
  type JourneyCode,
  type JourneyPhase,
  type IssueFlag,
} from "@/lib/freight/journey-catalog";

/**
 * Roles that may even REACH a workflow action (the action then gates the
 * SPECIFIC code via canRoleSetStatus). Mirrors the operations-cockpit page gate.
 */
const ROLES_WORKFLOW = [
  "super", "ultra", "normies", "manager",
  "ops", "accounting", "sales_admin", "sales", "pricing",
  "freight_sales_manager", "freight_sales",
  "freight_export_manager", "freight_export_cs", "freight_export_doc", "freight_export_clearance",
  "freight_clearance_both",
  "freight_import_manager", "freight_import_cs", "freight_import_doc", "freight_import_clearance",
  "freight_export_messenger", "freight_import_messenger",
  "warehouse", "driver",
] as const;

/** A Postgres error that means "the journey schema isn't migrated yet". */
function isSchemaMissing(err: { code?: string | null; message?: string | null } | null): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  if (code === "42703" || code === "42P01") return true; // undefined_column / undefined_table
  const m = (err.message ?? "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

// ────────────────────────────────────────────────────────────
// 1) advanceFreightStatus
// ────────────────────────────────────────────────────────────

const advanceSchema = z.object({
  shipmentId:    z.string().uuid(),
  toStatus:      z.enum(ALL_JOURNEY_CODES as [JourneyCode, ...JourneyCode[]]),
  note:          z.string().trim().max(1000).optional(),
  /** Optional explicit milestone date (yyyy-mm-dd). Defaults to now(). */
  milestoneDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type AdvanceFreightStatusInput = z.infer<typeof advanceSchema>;

export async function advanceFreightStatus(
  input: AdvanceFreightStatusInput,
): Promise<AdminActionResult<{ journey_status: JourneyCode }>> {
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_WORKFLOW], async ({ adminId, roles }) => {
    const admin = createAdminClient();

    // Load the shipment header (mode + current journey state + lifecycle status).
    const { data: row, error: rowErr } = await admin
      .from("freight_shipments")
      .select("id, job_no, status, transport_mode, journey_status")
      .eq("id", d.shipmentId)
      .maybeSingle<{
        id: string; job_no: string | null; status: string;
        transport_mode: string | null; journey_status: string | null;
      }>();
    if (rowErr) {
      if (isSchemaMissing(rowErr)) return { ok: false, error: "schema_not_migrated" };
      console.error(`[freight_shipments workflow lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === "cancelled") return { ok: false, error: "shipment_cancelled" };

    // Resolve the journey flavour + validate the target code belongs to it.
    const mode = resolveJourneyMode(row.transport_mode);
    if (d.toStatus !== "CANCELLED" && !isCodeInPipeline(mode, d.toStatus)) {
      return { ok: false, error: `code_not_in_flavour:${mode}` };
    }

    // ── ROLE GATE (brief §4 · the 8-role matrix) ──
    const isGod = isGodRole(roles);
    if (!canRoleSetStatus(d.toStatus, roles, isGod)) {
      return { ok: false, error: "role_not_permitted_for_status" };
    }

    const fromStatus = (row.journey_status as JourneyCode | null) ?? null;
    if (fromStatus === d.toStatus) return { ok: false, error: "already_at_status" };

    const meta = JOURNEY_CODE_META[d.toStatus];
    const nowIso = new Date().toISOString();
    const milestoneIso = d.milestoneDate ? `${d.milestoneDate}T00:00:00.000Z` : nowIso;

    // Build the patch — ONLY journey + milestone columns. NO money columns ever.
    const patch: Record<string, unknown> = { journey_status: d.toStatus };
    if (meta.milestoneField) patch[meta.milestoneField] = milestoneIso;

    const { error: updErr } = await admin
      .from("freight_shipments")
      .update(patch)
      .eq("id", d.shipmentId)
      .neq("status", "cancelled");
    if (updErr) {
      if (isSchemaMissing(updErr)) return { ok: false, error: "schema_not_migrated" };
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    // Append a status-log row (best-effort: if the table isn't migrated yet, the
    // journey column update already committed — don't fail the advance).
    const { error: logErr } = await admin
      .from("freight_shipment_status_log")
      .insert({
        freight_shipment_id: d.shipmentId,
        from_status:         fromStatus,
        to_status:           d.toStatus,
        main_status:         mainStatusOf(d.toStatus),
        note:                d.note ?? null,
        changed_by_admin_id: adminId,
        changed_at:          nowIso,
      });
    if (logErr && !isSchemaMissing(logErr)) {
      console.error(`[freight_shipment_status_log insert] failed`, { code: logErr.code, message: logErr.message });
    }

    await logAdminAction(adminId, "freight_shipment.journey_advance", "freight_shipment", d.shipmentId, {
      job_no:      row.job_no,
      from:        fromStatus,
      to:          d.toStatus,
      main_status: mainStatusOf(d.toStatus),
      milestone:   meta.milestoneField ? { field: meta.milestoneField, value: milestoneIso } : null,
      note:        d.note ?? null,
    });

    revalidatePath("/admin/freight/operations");
    revalidatePath("/admin/freight/shipments");
    revalidatePath(`/admin/freight/shipments/${d.shipmentId}`);
    return { ok: true, data: { journey_status: d.toStatus } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) setFreightRedFlag (the RED overlay · §1e)
// ────────────────────────────────────────────────────────────

const redFlagSchema = z
  .object({
    shipmentId: z.string().uuid(),
    flag:       z.enum(ISSUE_FLAGS as unknown as [IssueFlag, ...IssueFlag[]]),
    reason:     z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.flag === "none" || (v.reason ?? "").length >= 3, {
    message: "ระบุเหตุผลของปัญหา (อย่างน้อย 3 ตัวอักษร)",
    path: ["reason"],
  });
export type SetFreightRedFlagInput = z.infer<typeof redFlagSchema>;

export async function setFreightRedFlag(
  input: SetFreightRedFlagInput,
): Promise<AdminActionResult<{ flag: IssueFlag }>> {
  const parsed = redFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // The RED flag is a supervisory overlay — any freight role that can reach the
  // workflow may raise/clear it (the brief lets Operation/Doc flag a delay/hold;
  // Manager/God obviously can). Gate at the action-reach level.
  return withAdmin([...ROLES_WORKFLOW], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("freight_shipments")
      .select("id, job_no, status")
      .eq("id", d.shipmentId)
      .maybeSingle<{ id: string; job_no: string | null; status: string }>();
    if (rowErr) {
      if (isSchemaMissing(rowErr)) return { ok: false, error: "schema_not_migrated" };
      console.error(`[freight_shipments redflag lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "not_found" };
    if (row.status === "cancelled") return { ok: false, error: "shipment_cancelled" };

    const { error: updErr } = await admin
      .from("freight_shipments")
      .update({
        issue_flag: d.flag,
        issue_note: d.flag === "none" ? null : (d.reason ?? null),
      })
      .eq("id", d.shipmentId);
    if (updErr) {
      if (isSchemaMissing(updErr)) return { ok: false, error: "schema_not_migrated" };
      return { ok: false, error: `update_failed: ${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_shipment.red_flag", "freight_shipment", d.shipmentId, {
      job_no: row.job_no,
      flag:   d.flag,
      reason: d.flag === "none" ? null : (d.reason ?? null),
    });

    revalidatePath("/admin/freight/operations");
    revalidatePath(`/admin/freight/shipments/${d.shipmentId}`);
    return { ok: true, data: { flag: d.flag } };
  });
}

// ────────────────────────────────────────────────────────────
// 3) createFreightShipmentFromQuote (booking → shipment seam)
// ────────────────────────────────────────────────────────────

/**
 * Create a freight_shipments row from an ACCEPTED B2B quote (freight_quotes).
 * Reserves a job_no via the existing RPC, copies the quote's header + value
 * figures VERBATIM (no re-pricing — money figures originate in the quote flow),
 * and seeds journey_status = PENDING. Idempotent: if a non-cancelled shipment
 * already references this quote (source_quote_id), returns it instead of a dup.
 *
 * Only creates a clean seam when the quote table exposes the fields it needs; if
 * it doesn't (older schema) the action returns `quote_shape_unsupported` and the
 * existing freight-quotes.ts convert path stays the way to create a shipment.
 */
const fromQuoteSchema = z.object({ quoteId: z.string().uuid() });
export type CreateFromQuoteInput = z.infer<typeof fromQuoteSchema>;

const ROLES_CREATE_FROM_QUOTE = ["super", "ultra", "normies", "manager", "ops", "sales_admin", "accounting", "freight_sales_manager", "freight_sales"] as const;

export async function createFreightShipmentFromQuote(
  input: CreateFromQuoteInput,
): Promise<AdminActionResult<{ id: string; job_no: string; reused: boolean }>> {
  const parsed = fromQuoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string; job_no: string; reused: boolean }>([...ROLES_CREATE_FROM_QUOTE], async ({ adminId }) => {
    const admin = createAdminClient();

    // Load the quote header. Select a conservative field set; if the column set
    // doesn't match this schema, bail to the existing convert path.
    const { data: quote, error: quoteErr } = await admin
      .from("freight_quotes")
      .select(`
        id, status, profile_id, transport_mode, incoterm,
        port_loading, port_discharge, place_delivery,
        commercial_value_usd, exchange_rate, commercial_value_thb,
        declared_customs_value_thb, declared_value_basis, hs_code,
        duty_rate_pct, duty_thb, vat_base_thb, vat_thb, form_e_applied, notes
      `)
      .eq("id", d.quoteId)
      .maybeSingle<{
        id: string; status: string; profile_id: string | null;
        transport_mode: string | null; incoterm: string | null;
        port_loading: string | null; port_discharge: string | null; place_delivery: string | null;
        commercial_value_usd: number | null; exchange_rate: number | null; commercial_value_thb: number | null;
        declared_customs_value_thb: number | null; declared_value_basis: string | null; hs_code: string | null;
        duty_rate_pct: number | null; duty_thb: number | null; vat_base_thb: number | null; vat_thb: number | null;
        form_e_applied: boolean | null; notes: string | null;
      }>();
    if (quoteErr) {
      if (isSchemaMissing(quoteErr)) return { ok: false, error: "quote_shape_unsupported" };
      console.error(`[freight_quotes lookup] failed`, { code: quoteErr.code, message: quoteErr.message });
      return { ok: false, error: `db_error:${quoteErr.code ?? "unknown"}` };
    }
    if (!quote) return { ok: false, error: "quote_not_found" };
    if (!quote.profile_id) return { ok: false, error: "quote_has_no_customer" };
    if (quote.status !== "accepted") return { ok: false, error: `quote_not_accepted:${quote.status}` };

    // Idempotency — reuse an existing non-cancelled shipment for this quote.
    const { data: existing, error: existingErr } = await admin
      .from("freight_shipments")
      .select("id, job_no")
      .eq("source_quote_id", d.quoteId)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle<{ id: string; job_no: string | null }>();
    if (existingErr && !isSchemaMissing(existingErr)) {
      console.error(`[freight_shipments dup-check] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (existing?.id) {
      return { ok: true, data: { id: existing.id, job_no: existing.job_no ?? "", reused: true } };
    }

    // Reserve a job_no.
    const { data: jobNo, error: serialErr } = await admin.rpc("next_freight_job_no");
    if (serialErr || typeof jobNo !== "string") {
      return { ok: false, error: `serial_reserve_failed: ${serialErr?.message ?? "rpc"}` };
    }

    // Copy header + value figures VERBATIM (NO new money math). Seed journey.
    const insertRow: Record<string, unknown> = {
      job_no:                     jobNo,
      profile_id:                 quote.profile_id,
      status:                     "draft",
      transport_mode:             quote.transport_mode ?? "sea_lcl",
      incoterm:                   quote.incoterm ?? null,
      port_loading:               quote.port_loading ?? null,
      port_discharge:             quote.port_discharge ?? null,
      place_delivery:             quote.place_delivery ?? null,
      origin_country:             "CHINA",
      commercial_value_usd:       quote.commercial_value_usd ?? null,
      exchange_rate:              quote.exchange_rate ?? null,
      commercial_value_thb:       quote.commercial_value_thb ?? null,
      declared_customs_value_thb: quote.declared_customs_value_thb ?? null,
      declared_value_basis:       quote.declared_value_basis ?? null,
      hs_code:                    quote.hs_code ?? null,
      duty_rate_pct:              quote.duty_rate_pct ?? null,
      duty_thb:                   quote.duty_thb ?? null,
      vat_base_thb:               quote.vat_base_thb ?? null,
      vat_thb:                    quote.vat_thb ?? null,
      form_e_applied:             quote.form_e_applied ?? false,
      source_quote_id:            quote.id,
      notes:                      quote.notes ?? null,
      journey_status:             INITIAL_JOURNEY_CODE,
      created_by_admin_id:        adminId,
    };

    let inserted: { id: string; job_no: string } | null = null;
    const firstTry = await admin
      .from("freight_shipments")
      .insert(insertRow)
      .select("id, job_no")
      .single<{ id: string; job_no: string }>();
    if (firstTry.error) {
      // If journey_status column isn't migrated yet, retry WITHOUT it so the
      // booking→shipment seam still works on un-migrated prod (the journey
      // column gets seeded later by the first advance).
      if (isSchemaMissing(firstTry.error)) {
        delete insertRow.journey_status;
        const retry = await admin
          .from("freight_shipments")
          .insert(insertRow)
          .select("id, job_no")
          .single<{ id: string; job_no: string }>();
        if (retry.error || !retry.data) {
          return { ok: false, error: `insert_failed: ${retry.error?.message ?? "no_row"}` };
        }
        inserted = retry.data;
      } else {
        return { ok: false, error: `insert_failed: ${firstTry.error.message}` };
      }
    } else {
      inserted = firstTry.data;
    }
    if (!inserted) return { ok: false, error: "insert_failed: no_row" };

    await logAdminAction(adminId, "freight_shipment.create_from_quote", "freight_shipment", inserted.id, {
      job_no:   jobNo,
      quote_id: quote.id,
    });

    revalidatePath("/admin/freight/operations");
    revalidatePath("/admin/freight/shipments");
    return { ok: true, data: { id: inserted.id, job_no: inserted.job_no, reused: false } };
  });
}

// ────────────────────────────────────────────────────────────
// Read helper — what codes may THIS caller set (for UI gating)
// ────────────────────────────────────────────────────────────

/**
 * Returns, for the calling admin, the subset of `candidateCodes` they're allowed
 * to set (server-authoritative — the UI uses this to hide buttons it'll reject).
 * Pure-ish read: no mutation. Returns [] if the caller isn't a freight admin.
 */
export async function listSettableJourneyCodes(
  candidateCodes: JourneyCode[],
): Promise<JourneyCode[]> {
  const roles = (await getAdminRoles()) ?? [];
  if (roles.length === 0) return [];
  const isGod = isGodRole(roles);
  return candidateCodes.filter((c) => canRoleSetStatus(c, roles, isGod));
}

// ────────────────────────────────────────────────────────────
// Read — the JOURNEY board (AX-JOB pivot by journey phase)
// ────────────────────────────────────────────────────────────

export type JourneyBoardCard = {
  shipmentId:    string;
  jobNo:         string | null;
  customerName:  string;
  memberCode:    string | null;
  modeLabel:     string;
  containerCode: string | null;
  journeyCode:   JourneyCode | null;
  journeyLabel:  string;
  phase:         JourneyPhase;
  issueFlag:     IssueFlag;
  issueNote:     string | null;
  lifecycle:     string; // freight_shipments.status (the legacy 6-state)
};

export type JourneyBoard = {
  /** True when the journey schema is live; false → board is empty + caller shows a banner. */
  schemaReady: boolean;
  cards:       JourneyBoardCard[];
  byPhase:     Record<JourneyPhase, number>;
  redCount:    number;
};

const EMPTY_BY_PHASE: Record<JourneyPhase, number> = {
  origin: 0, transit: 0, destination: 0, internal: 0, terminal: 0,
};

/**
 * List freight shipments arranged for the journey-phase board. Read-only. Returns
 * `schemaReady=false` (empty board) when the journey columns aren't migrated yet.
 */
export async function listJourneyBoard(
  opts: { q?: string | null; redOnly?: boolean } = {},
): Promise<AdminActionResult<JourneyBoard>> {
  return withAdmin<JourneyBoard>([...ROLES_WORKFLOW], async () => {
    const admin = createAdminClient();

    let query = admin
      .from("freight_shipments")
      .select("id, job_no, status, transport_mode, container_code, journey_status, issue_flag, issue_note, profile_id, created_at")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(400);
    const q = (opts.q ?? "").trim();
    if (q) query = query.or(`job_no.ilike.%${q}%,container_code.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) {
      if (isSchemaMissing(error)) {
        return { ok: true, data: { schemaReady: false, cards: [], byPhase: { ...EMPTY_BY_PHASE }, redCount: 0 } };
      }
      console.error(`[freight journey board list] failed`, { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }

    type Row = {
      id: string; job_no: string | null; status: string;
      transport_mode: string | null; container_code: string | null;
      journey_status: string | null; issue_flag: string | null; issue_note: string | null;
      profile_id: string | null;
    };
    const rows = (data ?? []) as Row[];

    // Resolve customer names in one batch.
    const profileIds = Array.from(new Set(rows.map((r) => r.profile_id).filter(Boolean))) as string[];
    const nameByProfile = new Map<string, { name: string; code: string | null }>();
    if (profileIds.length > 0) {
      const { data: profs, error: profsErr } = await admin
        .from("profiles")
        .select("id, member_code, first_name, last_name, company_name")
        .in("id", profileIds);
      if (profsErr) {
        console.error(`[freight journey board profiles] failed`, { code: profsErr.code, message: profsErr.message });
      }
      for (const p of (profs ?? []) as Array<{ id: string; member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null }>) {
        const name = (p.company_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()) || "—";
        nameByProfile.set(p.id, { name, code: p.member_code });
      }
    }

    const byPhase = { ...EMPTY_BY_PHASE };
    let redCount = 0;
    const cards: JourneyBoardCard[] = [];
    for (const r of rows) {
      const code = (r.journey_status as JourneyCode | null) ?? null;
      const meta = code ? JOURNEY_CODE_META[code] : null;
      const phase: JourneyPhase = meta?.phase ?? "origin";
      const flag = (ISSUE_FLAGS as readonly string[]).includes(r.issue_flag ?? "")
        ? (r.issue_flag as IssueFlag)
        : "none";
      if (opts.redOnly && flag === "none") continue;
      byPhase[phase] += 1;
      if (flag !== "none") redCount += 1;
      const prof = r.profile_id ? nameByProfile.get(r.profile_id) : undefined;
      cards.push({
        shipmentId:    r.id,
        jobNo:         r.job_no,
        customerName:  prof?.name ?? "—",
        memberCode:    prof?.code ?? null,
        modeLabel:     JOURNEY_MODE_LABEL[resolveJourneyMode(r.transport_mode)],
        containerCode: r.container_code,
        journeyCode:   code,
        journeyLabel:  meta?.labelTh ?? "ยังไม่เริ่ม",
        phase,
        issueFlag:     flag,
        issueNote:     r.issue_note ?? null,
        lifecycle:     r.status,
      });
    }

    return { ok: true, data: { schemaReady: true, cards, byPhase, redCount } };
  });
}

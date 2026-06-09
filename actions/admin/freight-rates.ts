"use server";

// ════════════════════════════════════════════════════════════════════
// China-side freight COST-rate admin CRUD — `tb_freight_rate` (migration 0145).
// ════════════════════════════════════════════════════════════════════
// The keystone of the freight cost-side. The rate engine
// (lib/freight/rate-engine.ts · composeFreightQuote) priced freight quotes but
// the COST side (`chinaFreightCostThb`) was ALWAYS null → every EXW/CFR quote
// fell back to showing only "กำไรขั้นต้น" (gross), never a true NET margin.
// The reason: `tb_freight_rate` was empty on prod because there was NO admin
// write-path to populate it. THIS file is that write-path.
//
// THE READER we must match — lib/freight/rate-lookup.ts · lookupChinaFreightCostThb:
//   SELECT cost_usd, unit, fx_thb_per_usd
//   FROM tb_freight_rate
//   WHERE transport_mode = :mode AND active = true
//   ORDER BY pol ASC, effective_from DESC LIMIT 1
//   → cost = cost_usd × fx_thb_per_usd × units(per unit: container/cbm/kg)
// So a row's value semantics are: cost_usd is PER UNIT (per container / per CBM /
// per KG), fx_thb_per_usd is the snapshot FX, and the MOST-DEFAULT route
// (pol='' sorts first) + the most-recent effective_from wins. We write EXACTLY
// these columns.
//
// SCHEMA (migration 0145):
//   id uuid pk · transport_mode in ('sea_fcl','sea_lcl','air') · pol/pod text ''=any
//   carrier text ''=any · container_type text · cost_usd numeric · unit in
//   ('container','cbm','kg') · fx_thb_per_usd numeric default 35 · effective_from
//   date · active bool · note text · updated_by uuid → profiles(id) · timestamps.
//
// RBAC (mirror the table RLS): write = super/ops · read = super/ops/accounting.
// confirm-before-mutate is enforced in the UI (§0f); every write is audit-logged.
// ════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Roles allowed to MUTATE (mirror tb_freight_rate_admin_write RLS).
const ROLES_WRITE = ["super", "ops"] as const;
// Roles allowed to READ (mirror tb_freight_rate_admin_read RLS).
const ROLES_READ = ["super", "ops", "accounting"] as const;

const TRANSPORT_MODES = ["sea_fcl", "sea_lcl", "air"] as const;
const UNITS = ["container", "cbm", "kg"] as const;

// ────────────────────────────────────────────────────────────
// Row shape returned to the list page.
// ────────────────────────────────────────────────────────────
export type FreightRateRow = {
  id: string;
  transport_mode: string;
  pol: string;
  pod: string;
  carrier: string;
  container_type: string;
  cost_usd: number;
  unit: string;
  fx_thb_per_usd: number;
  effective_from: string;
  active: boolean;
  note: string;
  updated_at: string;
};

/**
 * List all freight cost rates (newest first). Read-gated super/ops/accounting.
 * Returns `{ rows, loadFailed }` — on a DB error `loadFailed` is true (and rows
 * empty) so the page can show a "load failed" banner instead of a false "no
 * rates yet" empty state (audit A3: a silent empty invites a duplicate active
 * cost row on a transient timeout, since tb_freight_rate has no unique key).
 */
export async function getFreightRates(): Promise<{ rows: FreightRateRow[]; loadFailed: boolean }> {
  return withAdmin([...ROLES_READ], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_freight_rate")
      .select(
        "id, transport_mode, pol, pod, carrier, container_type, cost_usd, unit, fx_thb_per_usd, effective_from, active, note, updated_at",
      )
      .order("transport_mode", { ascending: true })
      .order("pol", { ascending: true })
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error(`[freight-rates list] failed`, { code: error.code, message: error.message });
      return { ok: true as const, data: { rows: [] as FreightRateRow[], loadFailed: true } };
    }
    const rows: FreightRateRow[] = (data ?? []).map((r) => ({
      id: String(r.id),
      transport_mode: String(r.transport_mode ?? ""),
      pol: String(r.pol ?? ""),
      pod: String(r.pod ?? ""),
      carrier: String(r.carrier ?? ""),
      container_type: String(r.container_type ?? ""),
      cost_usd: Number(r.cost_usd ?? 0),
      unit: String(r.unit ?? "container"),
      fx_thb_per_usd: Number(r.fx_thb_per_usd ?? 35),
      effective_from: String(r.effective_from ?? "").slice(0, 10),
      active: Boolean(r.active),
      note: String(r.note ?? ""),
      updated_at: String(r.updated_at ?? ""),
    }));
    return { ok: true as const, data: { rows, loadFailed: false } };
  }).then((res) =>
    res.ok && res.data ? res.data : { rows: [] as FreightRateRow[], loadFailed: true },
  );
}

// ────────────────────────────────────────────────────────────
// Shared field validators (match migration 0145 columns + CHECKs).
// ────────────────────────────────────────────────────────────
const rateFields = {
  transport_mode: z.enum(TRANSPORT_MODES),
  // '' = any (default route). Trim + cap (text cols, no fixed length but keep sane).
  pol: z.string().trim().max(60).default(""),
  pod: z.string().trim().max(60).default(""),
  carrier: z.string().trim().max(60).default(""),
  container_type: z.string().trim().max(20).default(""),
  // cost_usd = numeric(12,4); the reader treats <=0 as "no rate" → require > 0.
  cost_usd: z.coerce.number().positive("ต้นทุน (USD) ต้องมากกว่า 0").max(9999999),
  unit: z.enum(UNITS),
  // fx_thb_per_usd = numeric(7,2) default 35.
  fx_thb_per_usd: z.coerce.number().positive("เรท FX ต้องมากกว่า 0").max(99999),
  // effective_from = date; accept YYYY-MM-DD.
  effective_from: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "วันที่มีผลต้องเป็นรูปแบบ YYYY-MM-DD"),
  active: z.boolean().default(true),
  note: z.string().trim().max(500).default(""),
};

// ── CREATE ────────────────────────────────────────────────────────────
const createSchema = z.object(rateFields);
export type AdminCreateFreightRateInput = z.input<typeof createSchema>;

/** Create a new China freight cost rate. Write-gated super/ops. */
export async function adminCreateFreightRate(
  input: AdminCreateFreightRateInput,
): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_freight_rate")
      .insert({
        transport_mode: v.transport_mode,
        pol: v.pol,
        pod: v.pod,
        carrier: v.carrier,
        container_type: v.container_type,
        cost_usd: v.cost_usd,
        unit: v.unit,
        fx_thb_per_usd: v.fx_thb_per_usd,
        effective_from: v.effective_from,
        active: v.active,
        note: v.note,
        updated_by: adminId,
      })
      .select("id")
      .single<{ id: string }>();
    if (error) {
      console.error(`[freight-rates create] failed`, { code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }

    await logAdminAction(adminId, "tb_freight_rate.create", "tb_freight_rate", String(data.id), {
      transport_mode: v.transport_mode,
      cost_usd: v.cost_usd,
      unit: v.unit,
      fx_thb_per_usd: v.fx_thb_per_usd,
    });
    revalidatePath("/admin/freight/rates");
    return { ok: true };
  });
}

// ── UPDATE ────────────────────────────────────────────────────────────
const updateSchema = z.object({ id: z.string().uuid(), ...rateFields });
export type AdminUpdateFreightRateInput = z.input<typeof updateSchema>;

/** Edit an existing rate. Write-gated super/ops. */
export async function adminUpdateFreightRate(
  input: AdminUpdateFreightRateInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const v = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: readErr } = await admin
      .from("tb_freight_rate")
      .select("id")
      .eq("id", v.id)
      .maybeSingle<{ id: string }>();
    if (readErr) {
      console.error(`[freight-rates update read] failed`, { id: v.id, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบรายการต้นทุนนี้" };

    const { error: updErr } = await admin
      .from("tb_freight_rate")
      .update({
        transport_mode: v.transport_mode,
        pol: v.pol,
        pod: v.pod,
        carrier: v.carrier,
        container_type: v.container_type,
        cost_usd: v.cost_usd,
        unit: v.unit,
        fx_thb_per_usd: v.fx_thb_per_usd,
        effective_from: v.effective_from,
        active: v.active,
        note: v.note,
        updated_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", v.id);
    if (updErr) {
      console.error(`[freight-rates update] failed`, { id: v.id, code: updErr.code, message: updErr.message });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_freight_rate.update", "tb_freight_rate", v.id, {
      transport_mode: v.transport_mode,
      cost_usd: v.cost_usd,
      unit: v.unit,
      fx_thb_per_usd: v.fx_thb_per_usd,
      active: v.active,
    });
    revalidatePath("/admin/freight/rates");
    return { ok: true };
  });
}

// ── TOGGLE ACTIVE ─────────────────────────────────────────────────────
const toggleSchema = z.object({ id: z.string().uuid(), active: z.boolean() });

/** Flip a rate's active flag (an inactive rate is ignored by the reader). */
export async function adminToggleFreightRate(
  input: z.input<typeof toggleSchema>,
): Promise<AdminActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id, active } = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_freight_rate")
      .update({ active, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error(`[freight-rates toggle] failed`, { id, code: error.code, message: error.message });
      return { ok: false, error: error.message };
    }
    await logAdminAction(adminId, "tb_freight_rate.toggle", "tb_freight_rate", id, { active });
    revalidatePath("/admin/freight/rates");
    return { ok: true };
  });
}

// ── DELETE ────────────────────────────────────────────────────────────
const deleteSchema = z.object({ id: z.string().uuid() });

/**
 * Hard-delete a rate. There is no FK from quotes back to a rate row (the reader
 * snapshots cost into each quote at compose-time), so deletion is referentially
 * safe — it only removes the rate from FUTURE lookups. To stop using a rate
 * without losing the record, prefer toggle-inactive (the UI offers both).
 */
export async function adminDeleteFreightRate(
  input: z.input<typeof deleteSchema>,
): Promise<AdminActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin([...ROLES_WRITE], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: before, error: readErr } = await admin
      .from("tb_freight_rate")
      .select("id, transport_mode, cost_usd, unit")
      .eq("id", id)
      .maybeSingle<{ id: string; transport_mode: string; cost_usd: number; unit: string }>();
    if (readErr) {
      console.error(`[freight-rates delete read] failed`, { id, code: readErr.code, message: readErr.message });
      return { ok: false, error: `db_error:${readErr.code ?? "unknown"}` };
    }
    if (!before) return { ok: false, error: "ไม่พบรายการต้นทุนนี้" };

    const { error: delErr } = await admin.from("tb_freight_rate").delete().eq("id", id);
    if (delErr) {
      console.error(`[freight-rates delete] failed`, { id, code: delErr.code, message: delErr.message });
      return { ok: false, error: delErr.message };
    }

    await logAdminAction(adminId, "tb_freight_rate.delete", "tb_freight_rate", id, {
      transport_mode: before.transport_mode,
      cost_usd: before.cost_usd,
      unit: before.unit,
    });
    revalidatePath("/admin/freight/rates");
    return { ok: true };
  });
}

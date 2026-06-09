"use server";

// ════════════════════════════════════════════════════════════════════
// W4 — Freight Ops Cockpit (AX JOB) server actions.
//
// A unified PRICING→SALES→DOC→ACC cockpit layered OVER the existing freight
// spine (freight_shipments / freight_quotes / freight_invoices). It is
// read-mostly: the only writes are per-stage STATUS + section ASSIGNMENTS +
// operator-entered P&L SNAPSHOTS + a per-stage checklist.
//
// ⚠️ MONEY/TAX SAFETY (project guardrail "ห้ามทำงานบัค งานหาย"):
//   - NO money mutation. cost/revenue/profit written here are SNAPSHOTS
//     surfaced in the board — they NEVER touch freight_shipments.commercial_value,
//     vat, duty, freight_invoices, the quote, or any wallet/payment path.
//   - The SELLING / COST / DECLARED 3-number model is respected: this layer
//     does not auto-equal them. revenue defaults from the spine commercial value
//     for display only; cost is operator-entered; profit = revenue − cost.
//   - No customer comms.
//
// RBAC: super + freight section roles + ops/accounting/sales_admin/pricing.
// Per-stage advance uses the section's role family (ADR-0014 state transitions).
// Every mutation writes admin_audit_log via logAdminAction.
// ════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/auth/require-admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  ensureOpsSchema,        type EnsureOpsInput,
  stageStatusSchema,      type StageStatusInput,
  recordDocCostSchema,    type RecordDocCostInput,
  assignStageOwnerSchema, type AssignStageOwnerInput,
  toggleUrgentSchema,     type ToggleUrgentInput,
  upsertChecklistSchema,  type UpsertChecklistInput,
  deriveBoardColumn,
  type FreightOpsStage, type FreightOpsStageStatus, type FreightOpsBoardColumn,
} from "@/lib/validators/freight-ops";
import {
  FREIGHT_SHIPMENT_STATUS_LABEL, FREIGHT_TRANSPORT_MODE_LABEL,
  type FreightShipmentStatus, type FreightTransportMode,
} from "@/lib/validators/freight-shipment";

// ── Role sets ─────────────────────────────────────────────────
// Anyone in the freight cockpit can read + manage assignments/urgency/checklist.
const ROLES_COCKPIT: AdminRole[] = [
  "super", "ops", "sales_admin", "accounting", "pricing",
  "freight_sales_manager", "freight_sales",
  "freight_export_manager", "freight_export_cs", "freight_export_doc", "freight_export_clearance",
  "freight_clearance_both",
  "freight_import_manager", "freight_import_cs", "freight_import_doc", "freight_import_clearance",
];

// Per-stage advance — the section's role family (+ super always passes).
const ROLES_PRICING: AdminRole[] = ["super", "pricing", "accounting", "ops"];
const ROLES_SALES: AdminRole[]   = ["super", "sales_admin", "freight_sales_manager", "freight_sales", "freight_import_cs", "freight_export_cs", "ops"];
const ROLES_DOC: AdminRole[]     = ["super", "freight_import_doc", "freight_export_doc", "freight_clearance_both", "freight_import_clearance", "freight_export_clearance", "ops"];
const ROLES_ACC: AdminRole[]     = ["super", "accounting"];

const STAGE_COL: Record<FreightOpsStage, "pricing_status" | "sales_status" | "docs_status" | "acc_status"> = {
  pricing: "pricing_status",
  sales:   "sales_status",
  docs:    "docs_status",
  acc:     "acc_status",
};
const STAGE_ASSIGN_COL: Record<FreightOpsStage, "assigned_pricing_admin_id" | "assigned_sales_admin_id" | "assigned_doc_admin_id" | "assigned_acc_admin_id"> = {
  pricing: "assigned_pricing_admin_id",
  sales:   "assigned_sales_admin_id",
  docs:    "assigned_doc_admin_id",
  acc:     "assigned_acc_admin_id",
};
const STAGE_ROLES: Record<FreightOpsStage, AdminRole[]> = {
  pricing: ROLES_PRICING,
  sales:   ROLES_SALES,
  docs:    ROLES_DOC,
  acc:     ROLES_ACC,
};

// ════════════════════════════════════════════════════════════════════
// Internal — ensure an ops row exists for a shipment (idempotent).
// Returns the ops row id. Does NOT log (callers log their own action).
// ════════════════════════════════════════════════════════════════════

type OpsRow = {
  id: string;
  freight_shipment_id: string;
  pricing_status: FreightOpsStageStatus;
  sales_status: FreightOpsStageStatus;
  docs_status: FreightOpsStageStatus;
  acc_status: FreightOpsStageStatus;
  cost_snapshot_thb: number | null;
  revenue_snapshot_thb: number | null;
  profit_snapshot_thb: number | null;
  is_urgent: boolean;
  assigned_pricing_admin_id: string | null;
  assigned_sales_admin_id: string | null;
  assigned_doc_admin_id: string | null;
  assigned_acc_admin_id: string | null;
  notes: string | null;
};

async function ensureOpsRow(
  admin: ReturnType<typeof createAdminClient>,
  shipmentId: string,
): Promise<{ ok: true; row: OpsRow } | { ok: false; error: string }> {
  // Verify the shipment exists first (FK guard + nicer error).
  const { data: ship, error: shipErr } = await admin
    .from("freight_shipments")
    .select("id")
    .eq("id", shipmentId)
    .maybeSingle<{ id: string }>();
  if (shipErr) {
    console.error(`[freight-ops ensureOpsRow shipment lookup] failed`, { code: shipErr.code, message: shipErr.message, shipmentId });
    return { ok: false, error: `db_error:${shipErr.code ?? "unknown"}` };
  }
  if (!ship) return { ok: false, error: "shipment_not_found" };

  const { data: existing, error: exErr } = await admin
    .from("freight_job_operations")
    .select("*")
    .eq("freight_shipment_id", shipmentId)
    .maybeSingle<OpsRow>();
  if (exErr) {
    console.error(`[freight-ops ensureOpsRow lookup] failed`, { code: exErr.code, message: exErr.message, shipmentId });
    return { ok: false, error: `db_error:${exErr.code ?? "unknown"}` };
  }
  if (existing) return { ok: true, row: existing };

  const { data: inserted, error: insErr } = await admin
    .from("freight_job_operations")
    .insert({ freight_shipment_id: shipmentId })
    .select("*")
    .single<OpsRow>();
  if (insErr || !inserted) {
    // Concurrent insert race — re-read (unique index protects us).
    const { data: reread, error: rErr } = await admin
      .from("freight_job_operations")
      .select("*")
      .eq("freight_shipment_id", shipmentId)
      .maybeSingle<OpsRow>();
    if (rErr || !reread) {
      console.error(`[freight-ops ensureOpsRow insert] failed`, { code: insErr?.code, message: insErr?.message, shipmentId });
      return { ok: false, error: `insert_failed:${insErr?.message ?? "no_row"}` };
    }
    return { ok: true, row: reread };
  }
  return { ok: true, row: inserted };
}

// ════════════════════════════════════════════════════════════════════
// 1) Ensure ops record (used by the detail page to materialise a card).
// ════════════════════════════════════════════════════════════════════

export async function adminEnsureFreightOps(
  input: EnsureOpsInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = ensureOpsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };

  return withAdmin([...ROLES_COCKPIT], async () => {
    const admin = createAdminClient();
    const res = await ensureOpsRow(admin, parsed.data.freight_shipment_id);
    if (!res.ok) return res;
    revalidatePath(`/admin/freight/operations/${parsed.data.freight_shipment_id}`);
    revalidatePath("/admin/freight/operations");
    // No log on bare ensure (idempotent · no state change if already exists).
    return { ok: true, data: { id: res.row.id } };
  });
}

// ════════════════════════════════════════════════════════════════════
// 2) Stage status set/advance (generic) + the named convenience actions.
// ════════════════════════════════════════════════════════════════════

async function setStageStatus(
  input: StageStatusInput,
  roles: AdminRole[],
): Promise<AdminActionResult<void>> {
  const parsed = stageStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(roles, async ({ adminId }) => {
    const admin = createAdminClient();
    const ensured = await ensureOpsRow(admin, d.freight_shipment_id);
    if (!ensured.ok) return ensured;

    // ACC stage gate: cannot mark ACC done unless cs(sales) + pricing are done.
    if (d.stage === "acc" && d.status === "done") {
      if (ensured.row.pricing_status !== "done" || ensured.row.sales_status !== "done") {
        return { ok: false, error: "acc_gated: ต้องปิด PRICING และ SALES ก่อน" };
      }
    }

    const col = STAGE_COL[d.stage];
    const { error: updErr } = await admin
      .from("freight_job_operations")
      .update({ [col]: d.status })
      .eq("id", ensured.row.id);
    if (updErr) {
      console.error(`[freight-ops setStageStatus] failed`, { code: updErr.code, message: updErr.message, id: ensured.row.id });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }

    await logAdminAction(adminId, `freight_ops.${d.stage}_status`, "freight_job_operations", ensured.row.id, {
      freight_shipment_id: d.freight_shipment_id,
      stage: d.stage,
      status: d.status,
    });

    revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
    revalidatePath("/admin/freight/operations");
    return { ok: true };
  });
}

/** PRICING stage → done (Pricing has costed the job). */
export async function adminCompletePricingStage(input: { freight_shipment_id: string }) {
  return setStageStatus({ ...input, stage: "pricing", status: "done" }, ROLES_PRICING);
}
/** SALES stage → done (CS confirmed the customer quote). */
export async function adminConfirmSalesQuote(input: { freight_shipment_id: string }) {
  return setStageStatus({ ...input, stage: "sales", status: "done" }, ROLES_SALES);
}
/** DOC stage → done (ใบขน / Form-E assembled). */
export async function adminCompleteDocStage(input: { freight_shipment_id: string }) {
  return setStageStatus({ ...input, stage: "docs", status: "done" }, ROLES_DOC);
}
/** ACC stage → done (P&L closed · gated on pricing+sales done). */
export async function adminCompleteAccStage(input: { freight_shipment_id: string }) {
  return setStageStatus({ ...input, stage: "acc", status: "done" }, ROLES_ACC);
}
/** Generic set — used by the detail panel pill cycler. */
export async function adminSetFreightStageStatus(input: StageStatusInput) {
  const roles = STAGE_ROLES[input.stage] ?? ROLES_COCKPIT;
  return setStageStatus(input, roles);
}

// ════════════════════════════════════════════════════════════════════
// 3) DOC-stage cost snapshot (operator-entered · display-only · NO money).
// ════════════════════════════════════════════════════════════════════

export async function adminRecordDocStageCost(
  input: RecordDocCostInput,
): Promise<AdminActionResult<void>> {
  const parsed = recordDocCostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_DOC, ...ROLES_PRICING], async ({ adminId }) => {
    const admin = createAdminClient();
    const ensured = await ensureOpsRow(admin, d.freight_shipment_id);
    if (!ensured.ok) return ensured;

    // profit = revenue − cost (only when both present). Display-only number.
    const cost = d.cost_snapshot_thb;
    const revenue = d.revenue_snapshot_thb;
    const profit =
      cost != null && revenue != null
        ? Math.round((revenue - cost) * 100) / 100
        : null;

    const { error: updErr } = await admin
      .from("freight_job_operations")
      .update({
        cost_snapshot_thb:    cost,
        revenue_snapshot_thb: revenue,
        profit_snapshot_thb:  profit,
      })
      .eq("id", ensured.row.id);
    if (updErr) {
      console.error(`[freight-ops recordDocStageCost] failed`, { code: updErr.code, message: updErr.message, id: ensured.row.id });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_ops.record_cost_snapshot", "freight_job_operations", ensured.row.id, {
      freight_shipment_id: d.freight_shipment_id,
      cost_snapshot_thb: cost, revenue_snapshot_thb: revenue, profit_snapshot_thb: profit,
    });

    revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
    revalidatePath("/admin/freight/operations");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// 4) Assign a stage owner.
// ════════════════════════════════════════════════════════════════════

export async function adminAssignFreightStageOwner(
  input: AssignStageOwnerInput,
): Promise<AdminActionResult<void>> {
  const parsed = assignStageOwnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_COCKPIT], async ({ adminId }) => {
    const admin = createAdminClient();
    const ensured = await ensureOpsRow(admin, d.freight_shipment_id);
    if (!ensured.ok) return ensured;

    // If assigning a specific admin, confirm they are an active admin (FK is to
    // profiles, not admins — validate role-membership for a meaningful error).
    if (d.admin_id) {
      const { data: adminRow, error: adminErr } = await admin
        .from("admins")
        .select("profile_id")
        .eq("profile_id", d.admin_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle<{ profile_id: string }>();
      if (adminErr) {
        console.error(`[freight-ops assignStageOwner admin lookup] failed`, { code: adminErr.code, message: adminErr.message });
        return { ok: false, error: `db_error:${adminErr.code ?? "unknown"}` };
      }
      if (!adminRow) return { ok: false, error: "assignee_not_active_admin" };
    }

    const col = STAGE_ASSIGN_COL[d.stage];
    const { error: updErr } = await admin
      .from("freight_job_operations")
      .update({ [col]: d.admin_id })
      .eq("id", ensured.row.id);
    if (updErr) {
      console.error(`[freight-ops assignStageOwner] failed`, { code: updErr.code, message: updErr.message, id: ensured.row.id });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_ops.assign_owner", "freight_job_operations", ensured.row.id, {
      freight_shipment_id: d.freight_shipment_id, stage: d.stage, admin_id: d.admin_id,
    });

    revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
    revalidatePath("/admin/freight/operations");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// 5) Toggle urgency.
// ════════════════════════════════════════════════════════════════════

export async function adminToggleFreightUrgent(
  input: ToggleUrgentInput,
): Promise<AdminActionResult<void>> {
  const parsed = toggleUrgentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_COCKPIT], async ({ adminId }) => {
    const admin = createAdminClient();
    const ensured = await ensureOpsRow(admin, d.freight_shipment_id);
    if (!ensured.ok) return ensured;

    const { error: updErr } = await admin
      .from("freight_job_operations")
      .update({ is_urgent: d.is_urgent })
      .eq("id", ensured.row.id);
    if (updErr) {
      console.error(`[freight-ops toggleUrgent] failed`, { code: updErr.code, message: updErr.message, id: ensured.row.id });
      return { ok: false, error: `update_failed:${updErr.message}` };
    }

    await logAdminAction(adminId, "freight_ops.toggle_urgent", "freight_job_operations", ensured.row.id, {
      freight_shipment_id: d.freight_shipment_id, is_urgent: d.is_urgent,
    });

    revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
    revalidatePath("/admin/freight/operations");
    return { ok: true };
  });
}

// ════════════════════════════════════════════════════════════════════
// 6) Checklist upsert (insert / toggle done / delete).
// ════════════════════════════════════════════════════════════════════

export async function adminUpsertFreightChecklist(
  input: UpsertChecklistInput,
): Promise<AdminActionResult<{ id?: string }>> {
  const parsed = upsertChecklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin([...ROLES_COCKPIT], async ({ adminId }) => {
    const admin = createAdminClient();

    // Delete branch.
    if (d.id && d.delete) {
      const { error: delErr } = await admin
        .from("freight_stage_checklists")
        .delete()
        .eq("id", d.id)
        .eq("freight_shipment_id", d.freight_shipment_id);
      if (delErr) {
        console.error(`[freight-ops checklist delete] failed`, { code: delErr.code, message: delErr.message, id: d.id });
        return { ok: false, error: `delete_failed:${delErr.message}` };
      }
      await logAdminAction(adminId, "freight_ops.checklist_delete", "freight_stage_checklists", d.id, {
        freight_shipment_id: d.freight_shipment_id, stage: d.stage,
      });
      revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
      return { ok: true };
    }

    // Update branch (toggle done / rename).
    if (d.id) {
      const patch: Record<string, unknown> = {};
      if (d.done !== undefined) patch.done = d.done;
      if (d.item !== undefined) patch.item = d.item;
      if (Object.keys(patch).length === 0) return { ok: false, error: "no_changes" };
      const { error: updErr } = await admin
        .from("freight_stage_checklists")
        .update(patch)
        .eq("id", d.id)
        .eq("freight_shipment_id", d.freight_shipment_id);
      if (updErr) {
        console.error(`[freight-ops checklist update] failed`, { code: updErr.code, message: updErr.message, id: d.id });
        return { ok: false, error: `update_failed:${updErr.message}` };
      }
      await logAdminAction(adminId, "freight_ops.checklist_update", "freight_stage_checklists", d.id, {
        freight_shipment_id: d.freight_shipment_id, stage: d.stage, patch,
      });
      revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
      return { ok: true, data: { id: d.id } };
    }

    // Insert branch — verify the shipment exists (FK guard).
    const ensured = await ensureOpsRow(admin, d.freight_shipment_id);
    if (!ensured.ok) return ensured;

    const { data: inserted, error: insErr } = await admin
      .from("freight_stage_checklists")
      .insert({
        freight_shipment_id: d.freight_shipment_id,
        stage: d.stage,
        item: d.item,
        owner_admin_id: adminId,
        done: d.done ?? false,
      })
      .select("id")
      .single<{ id: string }>();
    if (insErr || !inserted) {
      console.error(`[freight-ops checklist insert] failed`, { code: insErr?.code, message: insErr?.message });
      return { ok: false, error: `insert_failed:${insErr?.message ?? "no_row"}` };
    }
    await logAdminAction(adminId, "freight_ops.checklist_add", "freight_stage_checklists", inserted.id, {
      freight_shipment_id: d.freight_shipment_id, stage: d.stage, item: d.item,
    });
    revalidatePath(`/admin/freight/operations/${d.freight_shipment_id}`);
    return { ok: true, data: { id: inserted.id } };
  });
}

// ════════════════════════════════════════════════════════════════════
// 7) READ — board list (the Kanban data) + stat bar.
// ════════════════════════════════════════════════════════════════════

export type CockpitCard = {
  shipmentId:     string;
  jobNo:          string | null;
  shipmentStatus: FreightShipmentStatus;
  shipmentStatusLabel: string;
  transportMode:  FreightTransportMode;
  transportModeLabel: string;
  customerName:   string;
  memberCode:     string | null;
  containerCode:  string | null;
  /** authoritative spine value (for reference). */
  commercialValueThb: number | null;
  /** ops layer (may be absent → defaults). */
  pricingStatus:  FreightOpsStageStatus;
  salesStatus:    FreightOpsStageStatus;
  docsStatus:     FreightOpsStageStatus;
  accStatus:      FreightOpsStageStatus;
  costSnapshot:   number | null;
  revenueSnapshot: number | null;
  profitSnapshot: number | null;
  isUrgent:       boolean;
  column:         FreightOpsBoardColumn;
  createdAt:      string;
};

export type CockpitListResult = {
  cards: CockpitCard[];
  stats: {
    total:        number;
    byColumn:     Record<FreightOpsBoardColumn, number>;
    urgentCount:  number;
    totalRevenue: number;
    totalCost:    number;
    totalProfit:  number;
  };
};

type ShipmentJoinRow = {
  id: string;
  job_no: string | null;
  status: FreightShipmentStatus;
  transport_mode: FreightTransportMode;
  container_code: string | null;
  commercial_value_thb: number | null;
  created_at: string;
  profile: {
    member_code: string | null;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
};

/**
 * Lists the cockpit cards. `column` filters to a synthetic board column;
 * `assignee` filters to a stage owner (any stage); `q` searches job_no/container.
 * Read-only — no mutation, no money.
 */
export async function adminListFreightOpsCockpit(args?: {
  column?: FreightOpsBoardColumn | null;
  assignee?: string | null;
  urgentOnly?: boolean;
  q?: string | null;
}): Promise<AdminActionResult<CockpitListResult>> {
  return withAdmin([...ROLES_COCKPIT], async () => {
    const admin = createAdminClient();

    // 1) Pull shipments (the spine is the universe of cards — every active
    //    shipment is a potential job, even before an ops row materialises).
    let shipQuery = admin
      .from("freight_shipments")
      .select(`
        id, job_no, status, transport_mode, container_code, commercial_value_thb, created_at,
        profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    const q = args?.q?.trim() ?? "";
    if (q) {
      shipQuery = shipQuery.or(`job_no.ilike.%${q}%,container_code.ilike.%${q}%`);
    }
    const { data: shipRaw, error: shipErr } = await shipQuery;
    if (shipErr) {
      console.error(`[freight-ops cockpit list shipments] failed`, { code: shipErr.code, message: shipErr.message });
      return { ok: false, error: `db_error:${shipErr.code ?? "unknown"}` };
    }

    type ProfileShape = NonNullable<ShipmentJoinRow["profile"]>;
    const shipments: ShipmentJoinRow[] = ((shipRaw ?? []) as unknown as (Omit<ShipmentJoinRow, "profile"> & { profile: ProfileShape | ProfileShape[] | null })[]).map((r) => {
      const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
      return { ...r, profile };
    });

    // 2) Pull all ops rows (small — one per active shipment at most) keyed by shipment.
    const { data: opsRaw, error: opsErr } = await admin
      .from("freight_job_operations")
      .select("freight_shipment_id, pricing_status, sales_status, docs_status, acc_status, cost_snapshot_thb, revenue_snapshot_thb, profit_snapshot_thb, is_urgent, assigned_pricing_admin_id, assigned_sales_admin_id, assigned_doc_admin_id, assigned_acc_admin_id");
    if (opsErr) {
      console.error(`[freight-ops cockpit list ops] failed`, { code: opsErr.code, message: opsErr.message });
      return { ok: false, error: `db_error:${opsErr.code ?? "unknown"}` };
    }
    const opsByShip = new Map<string, OpsRow>();
    for (const o of (opsRaw ?? []) as unknown as OpsRow[]) opsByShip.set(o.freight_shipment_id, o);

    // 3) Build cards + derive column.
    let cards: CockpitCard[] = shipments
      // Exclude terminal cancelled shipments from the active board.
      .filter((s) => s.status !== "cancelled")
      .map((s) => {
        const ops = opsByShip.get(s.id);
        const pricingStatus = (ops?.pricing_status ?? "") as FreightOpsStageStatus;
        const salesStatus   = (ops?.sales_status   ?? "") as FreightOpsStageStatus;
        const docsStatus    = (ops?.docs_status    ?? "") as FreightOpsStageStatus;
        const accStatus     = (ops?.acc_status     ?? "") as FreightOpsStageStatus;
        const column = deriveBoardColumn({
          pricing_status: pricingStatus, sales_status: salesStatus,
          docs_status: docsStatus, acc_status: accStatus,
          shipment_status: s.status,
        });
        const customerName =
          s.profile?.company_name ??
          `${s.profile?.first_name ?? ""} ${s.profile?.last_name ?? ""}`.trim();
        return {
          shipmentId: s.id,
          jobNo: s.job_no,
          shipmentStatus: s.status,
          shipmentStatusLabel: FREIGHT_SHIPMENT_STATUS_LABEL[s.status] ?? s.status,
          transportMode: s.transport_mode,
          transportModeLabel: FREIGHT_TRANSPORT_MODE_LABEL[s.transport_mode] ?? s.transport_mode,
          customerName: customerName || "—",
          memberCode: s.profile?.member_code ?? null,
          containerCode: s.container_code,
          commercialValueThb: s.commercial_value_thb,
          pricingStatus, salesStatus, docsStatus, accStatus,
          costSnapshot: ops?.cost_snapshot_thb ?? null,
          revenueSnapshot: ops?.revenue_snapshot_thb ?? null,
          profitSnapshot: ops?.profit_snapshot_thb ?? null,
          isUrgent: ops?.is_urgent ?? false,
          column,
          createdAt: s.created_at,
        } satisfies CockpitCard;
      });

    // 4) Assignee filter (any stage owner == the requested admin).
    if (args?.assignee) {
      const a = args.assignee;
      const matchingShipIds = new Set<string>();
      for (const o of opsByShip.values()) {
        if (
          o.assigned_pricing_admin_id === a || o.assigned_sales_admin_id === a ||
          o.assigned_doc_admin_id === a || o.assigned_acc_admin_id === a
        ) matchingShipIds.add(o.freight_shipment_id);
      }
      cards = cards.filter((c) => matchingShipIds.has(c.shipmentId));
    }
    if (args?.urgentOnly) cards = cards.filter((c) => c.isUrgent);

    // 5) Stats (BEFORE column filter so the pills always show full counts).
    const byColumn = {
      pricing: 0, sales: 0, docs: 0, acc: 0, in_progress: 0, done: 0,
    } as Record<FreightOpsBoardColumn, number>;
    let urgentCount = 0, totalRevenue = 0, totalCost = 0, totalProfit = 0;
    for (const c of cards) {
      byColumn[c.column] = (byColumn[c.column] ?? 0) + 1;
      if (c.isUrgent) urgentCount += 1;
      if (c.revenueSnapshot != null) totalRevenue += c.revenueSnapshot;
      if (c.costSnapshot != null) totalCost += c.costSnapshot;
      if (c.profitSnapshot != null) totalProfit += c.profitSnapshot;
    }

    // 6) Column filter applied last.
    if (args?.column) cards = cards.filter((c) => c.column === args.column);

    return {
      ok: true,
      data: {
        cards,
        stats: {
          total: cards.length,
          byColumn,
          urgentCount,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
        },
      },
    };
  });
}

// ════════════════════════════════════════════════════════════════════
// 8) READ — single job detail.
// ════════════════════════════════════════════════════════════════════

export type CockpitChecklistItem = {
  id: string;
  stage: FreightOpsStage;
  item: string;
  done: boolean;
  ownerAdminId: string | null;
};

export type CockpitDetail = {
  shipmentId: string;
  jobNo: string | null;
  shipmentStatus: FreightShipmentStatus;
  shipmentStatusLabel: string;
  transportMode: FreightTransportMode;
  transportModeLabel: string;
  containerCode: string | null;
  blNo: string | null;
  incoterm: string | null;
  customerName: string;
  memberCode: string | null;
  /** authoritative spine value (reference for the revenue default). */
  commercialValueThb: number | null;
  /** authoritative spine duty/vat (reference only). */
  vatThb: number | null;
  dutyThb: number | null;
  // ops layer
  pricingStatus: FreightOpsStageStatus;
  salesStatus: FreightOpsStageStatus;
  docsStatus: FreightOpsStageStatus;
  accStatus: FreightOpsStageStatus;
  costSnapshot: number | null;
  revenueSnapshot: number | null;
  profitSnapshot: number | null;
  isUrgent: boolean;
  assignedPricingAdminId: string | null;
  assignedSalesAdminId: string | null;
  assignedDocAdminId: string | null;
  assignedAccAdminId: string | null;
  notes: string | null;
  checklist: CockpitChecklistItem[];
  // commission panel STUB — read existing invoice total; the commission ledger
  // is a later wave. Present so the panel degrades gracefully.
  invoiceTotalUsd: number | null;
  invoiceNo: string | null;
};

export async function adminGetFreightCockpitDetail(args: {
  shipmentId: string;
}): Promise<AdminActionResult<CockpitDetail>> {
  return withAdmin([...ROLES_COCKPIT], async () => {
    const admin = createAdminClient();
    const shipmentId = args.shipmentId;

    const { data: shipRaw, error: shipErr } = await admin
      .from("freight_shipments")
      .select(`
        id, job_no, status, transport_mode, container_code, bl_no, incoterm,
        commercial_value_thb, vat_thb, duty_thb,
        profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
      `)
      .eq("id", shipmentId)
      .maybeSingle();
    if (shipErr) {
      console.error(`[freight-ops cockpit detail shipment] failed`, { code: shipErr.code, message: shipErr.message, shipmentId });
      return { ok: false, error: `db_error:${shipErr.code ?? "unknown"}` };
    }
    if (!shipRaw) return { ok: false, error: "not_found" };

    type ShipDetail = {
      id: string; job_no: string | null; status: FreightShipmentStatus;
      transport_mode: FreightTransportMode; container_code: string | null;
      bl_no: string | null; incoterm: string | null;
      commercial_value_thb: number | null; vat_thb: number | null; duty_thb: number | null;
      profile: { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null }[] | null;
    };
    const ship = shipRaw as unknown as ShipDetail;
    const profile = Array.isArray(ship.profile) ? ship.profile[0] ?? null : ship.profile;

    // ops row (materialise if absent — read action ensures the card exists).
    const ensured = await ensureOpsRow(admin, shipmentId);
    if (!ensured.ok) return ensured;
    const ops = ensured.row;

    // checklist
    const { data: clRaw, error: clErr } = await admin
      .from("freight_stage_checklists")
      .select("id, stage, item, done, owner_admin_id")
      .eq("freight_shipment_id", shipmentId)
      .order("created_at", { ascending: true });
    if (clErr) {
      console.error(`[freight-ops cockpit detail checklist] failed`, { code: clErr.code, message: clErr.message, shipmentId });
      return { ok: false, error: `db_error:${clErr.code ?? "unknown"}` };
    }
    const checklist: CockpitChecklistItem[] = ((clRaw ?? []) as Array<{ id: string; stage: FreightOpsStage; item: string; done: boolean; owner_admin_id: string | null }>).map((c) => ({
      id: c.id, stage: c.stage, item: c.item, done: c.done, ownerAdminId: c.owner_admin_id,
    }));

    // commission/invoice STUB — read the active (non-cancelled) invoice total.
    let invoiceTotalUsd: number | null = null;
    let invoiceNo: string | null = null;
    const { data: inv, error: invErr } = await admin
      .from("freight_invoices")
      .select("id, invoice_no")
      .eq("freight_shipment_id", shipmentId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; invoice_no: string | null }>();
    if (invErr) {
      console.error(`[freight-ops cockpit detail invoice] failed`, { code: invErr.code, message: invErr.message, shipmentId });
    }
    if (inv) {
      invoiceNo = inv.invoice_no;
      const { data: lines, error: linesErr } = await admin
        .from("freight_invoice_lines")
        .select("amount_usd")
        .eq("freight_invoice_id", inv.id);
      if (linesErr) {
        console.error(`[freight-ops cockpit detail invoice lines] failed`, { code: linesErr.code, message: linesErr.message });
      } else {
        invoiceTotalUsd = (lines ?? []).reduce((s, l) => s + Number((l as { amount_usd: number | null }).amount_usd ?? 0), 0);
        invoiceTotalUsd = Math.round(invoiceTotalUsd * 100) / 100;
      }
    }

    const customerName =
      profile?.company_name ?? `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

    return {
      ok: true,
      data: {
        shipmentId: ship.id,
        jobNo: ship.job_no,
        shipmentStatus: ship.status,
        shipmentStatusLabel: FREIGHT_SHIPMENT_STATUS_LABEL[ship.status] ?? ship.status,
        transportMode: ship.transport_mode,
        transportModeLabel: FREIGHT_TRANSPORT_MODE_LABEL[ship.transport_mode] ?? ship.transport_mode,
        containerCode: ship.container_code,
        blNo: ship.bl_no,
        incoterm: ship.incoterm,
        customerName: customerName || "—",
        memberCode: profile?.member_code ?? null,
        commercialValueThb: ship.commercial_value_thb,
        vatThb: ship.vat_thb,
        dutyThb: ship.duty_thb,
        pricingStatus: ops.pricing_status,
        salesStatus: ops.sales_status,
        docsStatus: ops.docs_status,
        accStatus: ops.acc_status,
        costSnapshot: ops.cost_snapshot_thb,
        revenueSnapshot: ops.revenue_snapshot_thb,
        profitSnapshot: ops.profit_snapshot_thb,
        isUrgent: ops.is_urgent,
        assignedPricingAdminId: ops.assigned_pricing_admin_id,
        assignedSalesAdminId: ops.assigned_sales_admin_id,
        assignedDocAdminId: ops.assigned_doc_admin_id,
        assignedAccAdminId: ops.assigned_acc_admin_id,
        notes: ops.notes,
        checklist,
        invoiceTotalUsd,
        invoiceNo,
      },
    };
  });
}

/**
 * Zod schemas + enums for W4 — the Freight Ops Cockpit (AX JOB).
 *
 * The cockpit is a state/assignment layer over the existing freight spine
 * (freight_shipments / freight_quotes / freight_invoices). It owns NO money —
 * cost/revenue/profit here are operator-entered snapshots surfaced in the board.
 *
 * Tables: freight_job_operations (0163) + freight_stage_checklists (0164).
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Stages + statuses (mirror DB CHECK)
// ────────────────────────────────────────────────────────────

/** The 4 AX JOB stages, in pipeline order. */
export const FREIGHT_OPS_STAGES = ["pricing", "sales", "docs", "acc"] as const;
export type FreightOpsStage = (typeof FREIGHT_OPS_STAGES)[number];

export const FREIGHT_OPS_STAGE_LABEL: Record<FreightOpsStage, string> = {
  pricing: "PRICING (ต้นทุน)",
  sales:   "SALES (ขาย/CS)",
  docs:    "DOC (เอกสาร/ใบขน)",
  acc:     "ACC (บัญชี)",
};

/** Per-stage status. '' = not started. */
export const FREIGHT_OPS_STAGE_STATUSES = ["", "in_progress", "done"] as const;
export type FreightOpsStageStatus = (typeof FREIGHT_OPS_STAGE_STATUSES)[number];

export const FREIGHT_OPS_STAGE_STATUS_LABEL: Record<Exclude<FreightOpsStageStatus, "">, string> & { "": string } = {
  "":          "ยังไม่เริ่ม",
  in_progress: "กำลังทำ",
  done:        "เสร็จ",
};

/**
 * The Kanban columns. PRICING|SALES|DOC|ACC are the 4 active stages; we also
 * surface a synthetic IN-PROGRESS (any stage in_progress) and DONE (all stages
 * done / shipment delivered) lane — these are DERIVED in the read action, not
 * stored. The board renders all six as filter pills + columns.
 */
export const FREIGHT_OPS_BOARD_COLUMNS = [
  "pricing", "sales", "docs", "acc", "in_progress", "done",
] as const;
export type FreightOpsBoardColumn = (typeof FREIGHT_OPS_BOARD_COLUMNS)[number];

export const FREIGHT_OPS_BOARD_COLUMN_LABEL: Record<FreightOpsBoardColumn, string> = {
  pricing:     "PRICING",
  sales:       "SALES",
  docs:        "DOC",
  acc:         "ACC",
  in_progress: "กำลังดำเนินการ",
  done:        "เสร็จสิ้น",
};

// ────────────────────────────────────────────────────────────
// Input schemas
// ────────────────────────────────────────────────────────────

const shipmentId = z.string().uuid();

/** Ensure-or-fetch the ops record for a shipment (idempotent create). */
export const ensureOpsSchema = z.object({ freight_shipment_id: shipmentId });
export type EnsureOpsInput = z.infer<typeof ensureOpsSchema>;

/** Advance / set a single stage status. */
export const stageStatusSchema = z.object({
  freight_shipment_id: shipmentId,
  stage:               z.enum(FREIGHT_OPS_STAGES),
  status:              z.enum(["", "in_progress", "done"]),
});
export type StageStatusInput = z.infer<typeof stageStatusSchema>;

/** Record the DOC-stage cost snapshot (operator-entered · display-only). */
const optMoney = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.coerce.number().min(0).max(999_999_999.99).nullable(),
);

export const recordDocCostSchema = z.object({
  freight_shipment_id: shipmentId,
  cost_snapshot_thb:   optMoney,
  revenue_snapshot_thb: optMoney,
});
// input type — the client passes strings (the schema coerces).
export type RecordDocCostInput = z.input<typeof recordDocCostSchema>;

/** Assign a stage owner. ''/null clears the assignment. */
export const assignStageOwnerSchema = z.object({
  freight_shipment_id: shipmentId,
  stage:               z.enum(FREIGHT_OPS_STAGES),
  admin_id:            z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.string().uuid().nullable(),
  ),
});
export type AssignStageOwnerInput = z.input<typeof assignStageOwnerSchema>;

/** Toggle urgency. */
export const toggleUrgentSchema = z.object({
  freight_shipment_id: shipmentId,
  is_urgent:           z.coerce.boolean(),
});
export type ToggleUrgentInput = z.input<typeof toggleUrgentSchema>;

/** Upsert a checklist item. id present → update done/item; absent → insert. */
export const upsertChecklistSchema = z
  .object({
    id:                  z.string().uuid().optional(),
    freight_shipment_id: shipmentId,
    stage:               z.enum(FREIGHT_OPS_STAGES),
    item:                z.string().trim().min(1).max(300).optional(),
    done:                z.coerce.boolean().optional(),
    delete:              z.coerce.boolean().optional(),
  })
  .refine((d) => d.id !== undefined || (d.item ?? "").length > 0, {
    message: "ระบุชื่อรายการ (item) เมื่อสร้างใหม่",
    path: ["item"],
  });
export type UpsertChecklistInput = z.input<typeof upsertChecklistSchema>;

// ────────────────────────────────────────────────────────────
// Column → status pred (the synthetic board grouping)
// ────────────────────────────────────────────────────────────

/** Maps the per-stage statuses + shipment status into a single board column. */
export function deriveBoardColumn(args: {
  pricing_status: FreightOpsStageStatus;
  sales_status:   FreightOpsStageStatus;
  docs_status:    FreightOpsStageStatus;
  acc_status:     FreightOpsStageStatus;
  shipment_status: string;
}): FreightOpsBoardColumn {
  const { pricing_status, sales_status, docs_status, acc_status, shipment_status } = args;

  // DONE — every stage done OR shipment delivered.
  const allDone =
    pricing_status === "done" && sales_status === "done" &&
    docs_status === "done" && acc_status === "done";
  if (allDone || shipment_status === "delivered") return "done";

  // The current ACTIVE stage = the first not-done stage in pipeline order.
  // The card sits in that stage's column.
  if (pricing_status !== "done") return "pricing";
  if (sales_status !== "done")   return "sales";
  if (docs_status !== "done")    return "docs";
  if (acc_status !== "done")     return "acc";
  return "done";
}

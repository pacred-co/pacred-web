// ════════════════════════════════════════════════════════════════════
// CARGO tax-doc workspace — shared vocabulary + types (W9 · tax-invoice P4).
//
// Lives OUTSIDE the "use server" action file because a "use server" module
// may only export async functions (Next 16 rejects const/array/type value
// exports at module-eval — the AGING_BUCKETS trap). The 4-role state machine
// constants + types are imported by both the action (actions/admin/
// cargo-taxdoc-workspace.ts) and the workspace pages/components.
// ════════════════════════════════════════════════════════════════════

/** The 4 sections of a CARGO tax-doc job, each carrying ONE of the 3 numbers. */
export const TAXDOC_STAGES = ["cs", "pricing", "docs", "account"] as const;
export type TaxdocStage = (typeof TAXDOC_STAGES)[number];

/** '' = not started · 'in_progress' = working · 'done' = section closed. */
export const TAXDOC_STAGE_STATUSES = ["", "in_progress", "done"] as const;
export type TaxdocStageStatus = (typeof TAXDOC_STAGE_STATUSES)[number];

/** Section → its DB status column on tb_cargo_taxdoc_job. */
export const TAXDOC_STAGE_COL: Record<
  TaxdocStage,
  "cs_status" | "pricing_status" | "docs_status" | "account_status"
> = {
  cs:      "cs_status",
  pricing: "pricing_status",
  docs:    "docs_status",
  account: "account_status",
};

/** Human label for a stage (TH). */
export const TAXDOC_STAGE_LABEL: Record<TaxdocStage, string> = {
  cs:      "CS · ขาย (SELLING)",
  pricing: "Pricing · ต้นทุน (COST)",
  docs:    "Docs · สำแดง (DECLARED)",
  account: "Account · ปิดงาน (PEAK)",
};

/** Human label for a status (TH). */
export function taxdocStatusLabel(s: TaxdocStageStatus): string {
  if (s === "done") return "เสร็จแล้ว";
  if (s === "in_progress") return "กำลังทำ";
  return "ยังไม่เริ่ม";
}

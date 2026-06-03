"use server";

import { z } from "zod";
import type { AdminActionResult } from "./common";

/**
 * 🪦 DEAD CODE — TOMBSTONED 2026-06-04 (reachability/dead-flow audit · §0e).
 *
 * This module wrote the REBUILT rate tables (`rate_general` / `rate_vip` /
 * `rate_custom_user` / `rate_custom_hs`) — all 0-row on prod. The LIVE
 * forwarder pricing engine reads the legacy `tb_rate_*` family
 * (`tb_rate_g_*`, `tb_rate_vip_*`, `tb_rate_custom_*`, `tb_hs_rate_custom_*`),
 * and the LIVE admin rate editors write them via `actions/admin/rate-edits.ts`
 * (consumed by `/admin/rates/{general,custom-user,custom-hs}`).
 *
 * Every export here was therefore a silent dead-write (green toast → 0 rows
 * changed). `adminUpsertVipRate`/`adminDeleteVipRate` were already tombstoned
 * in the 2026-06-02 §0e Wave-A sweep; this commit completes the set.
 *
 * `grep -rn` confirms ZERO importers of `@/actions/admin/rates` across
 * app/actions/lib/components (the live UI imports `rate-edits.ts`). The file
 * is NOT deleted (a deletion could mask a hidden dynamic import); instead every
 * exported async function now THROWS so any future accidental import fails
 * loudly instead of silently no-op'ing. Exported `*Input` type aliases + their
 * backing Zod schemas are preserved so `tsc` (and any type-only importer)
 * stays green.
 *
 * → Use `actions/admin/rate-edits.ts` (writes the live `tb_rate_*` engine).
 */

const DEAD = "actions/admin/rates is dead code — use actions/admin/rate-edits.ts (writes the live tb_rate_* engine; this module wrote the 0-row rebuilt rate_* tables)";

const SOURCE_WAREHOUSE = ["guangzhou", "yiwu"] as const;
const TRANSPORT_TYPE   = ["truck", "ship", "air"] as const;
const PRODUCT_TYPE     = ["general", "tisi", "fda", "special"] as const;
const BASIS            = ["kg", "cbm"] as const;

const upsertGeneralRateSchema = z.object({
  customer_group:   z.string().trim().min(1).max(20),
  source_warehouse: z.enum(SOURCE_WAREHOUSE),
  transport_type:   z.enum(TRANSPORT_TYPE),
  product_type:     z.enum(PRODUCT_TYPE),
  basis:            z.enum(BASIS),
  tier1:            z.number().nonnegative().max(100_000).nullable(),
  tier2:            z.number().nonnegative().max(100_000).nullable(),
  tier3:            z.number().nonnegative().max(100_000).nullable(),
});
export type UpsertGeneralRateInput = z.infer<typeof upsertGeneralRateSchema>;

export async function adminUpsertGeneralRate(
  _input: UpsertGeneralRateInput,
): Promise<AdminActionResult<{ id: string; created: boolean }>> {
  throw new Error(DEAD);
}

const deleteGeneralRateSchema = z.object({ id: z.string().uuid() });
export type DeleteGeneralRateInput = z.infer<typeof deleteGeneralRateSchema>;

export async function adminDeleteGeneralRate(
  _input: DeleteGeneralRateInput,
): Promise<AdminActionResult<{ id: string }>> {
  throw new Error(DEAD);
}

const upsertVipRateSchema = z.object({
  customer_group:   z.string().trim().min(1).max(20),
  source_warehouse: z.enum(SOURCE_WAREHOUSE),
  transport_type:   z.enum(TRANSPORT_TYPE),
  product_type:     z.enum(PRODUCT_TYPE),
  basis:            z.enum(BASIS),
  rate:             z.number().positive().max(100_000),
});
export type UpsertVipRateInput = z.infer<typeof upsertVipRateSchema>;

export async function adminUpsertVipRate(
  _input: UpsertVipRateInput,
): Promise<AdminActionResult<{ id: string; created: boolean }>> {
  throw new Error(DEAD);
}

const deleteVipRateSchema = z.object({ id: z.string().uuid() });
export type DeleteVipRateInput = z.infer<typeof deleteVipRateSchema>;

export async function adminDeleteVipRate(
  _input: DeleteVipRateInput,
): Promise<AdminActionResult<{ id: string }>> {
  throw new Error(DEAD);
}

const upsertCustomUserRateSchema = z.object({
  customer_ref:     z.string().trim().min(2).max(50),
  source_warehouse: z.enum(SOURCE_WAREHOUSE),
  transport_type:   z.enum(TRANSPORT_TYPE),
  product_type:     z.enum(PRODUCT_TYPE),
  basis:            z.enum(BASIS),
  rate:             z.number().positive().max(100_000),
});
export type UpsertCustomUserRateInput = z.infer<typeof upsertCustomUserRateSchema>;

export async function adminUpsertCustomUserRate(
  _input: UpsertCustomUserRateInput,
): Promise<AdminActionResult<{ id: string; created: boolean; profile_id: string; member_code: string | null }>> {
  throw new Error(DEAD);
}

const deleteCustomUserRateSchema = z.object({ id: z.string().uuid() });
export type DeleteCustomUserRateInput = z.infer<typeof deleteCustomUserRateSchema>;

export async function adminDeleteCustomUserRate(
  _input: DeleteCustomUserRateInput,
): Promise<AdminActionResult<{ id: string }>> {
  throw new Error(DEAD);
}

const upsertCustomHsRateSchema = z.object({
  customer_ref:     z.string().trim().min(2).max(50),
  hs_code:          z.string().trim().min(2).max(20),
  source_warehouse: z.enum(SOURCE_WAREHOUSE),
  transport_type:   z.enum(TRANSPORT_TYPE),
  product_type:     z.enum(PRODUCT_TYPE),
  basis:            z.enum(BASIS),
  rate_before:      z.number().nonnegative().max(100_000).nullable(),
  rate:             z.number().positive().max(100_000),
});
export type UpsertCustomHsRateInput = z.infer<typeof upsertCustomHsRateSchema>;

export async function adminUpsertCustomHsRate(
  _input: UpsertCustomHsRateInput,
): Promise<AdminActionResult<{ id: string; created: boolean; profile_id: string; member_code: string | null }>> {
  throw new Error(DEAD);
}

const deleteCustomHsRateSchema = z.object({ id: z.string().uuid() });
export type DeleteCustomHsRateInput = z.infer<typeof deleteCustomHsRateSchema>;

export async function adminDeleteCustomHsRate(
  _input: DeleteCustomHsRateInput,
): Promise<AdminActionResult<{ id: string }>> {
  throw new Error(DEAD);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * LP-1: admin CRUD over rate_general (V1).
 *
 * Schema (migration 0009):
 *   UNIQUE (customer_group, source_warehouse, transport_type, product_type, basis)
 *
 * adminUpsertGeneralRate keys on that unique tuple — same tuple replaces the
 * existing row, new tuple inserts. Tier rates can be NULL (means "fall through
 * to lower tier" per lib/forwarder/calc-price.ts waterfall).
 *
 * RBAC: super + accounting. Audit logged every change.
 *
 * Future (LP-1b/c): rate_vip + rate_custom_user + rate_custom_hs follow the
 * same pattern; out of scope for this batch.
 */

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
  // NULL allowed — caller passes null when tier should fall through
  tier1:            z.number().nonnegative().max(100_000).nullable(),
  tier2:            z.number().nonnegative().max(100_000).nullable(),
  tier3:            z.number().nonnegative().max(100_000).nullable(),
});
export type UpsertGeneralRateInput = z.infer<typeof upsertGeneralRateSchema>;

export async function adminUpsertGeneralRate(
  input: UpsertGeneralRateInput,
): Promise<AdminActionResult<{ id: string; created: boolean }>> {
  const parsed = upsertGeneralRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Cross-field sanity: at least one tier must be set (else the row is useless)
  if (d.tier1 == null && d.tier2 == null && d.tier3 == null) {
    return { ok: false, error: "ต้องมีอย่างน้อย 1 tier (tier1/tier2/tier3)" };
  }

  return withAdmin<{ id: string; created: boolean }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Read-before-write so we can audit before/after + report whether this is
    // an insert or update.
    const { data: existing } = await admin
      .from("rate_general")
      .select("id, tier1, tier2, tier3")
      .eq("customer_group",   d.customer_group)
      .eq("source_warehouse", d.source_warehouse)
      .eq("transport_type",   d.transport_type)
      .eq("product_type",     d.product_type)
      .eq("basis",            d.basis)
      .maybeSingle<{ id: string; tier1: number | null; tier2: number | null; tier3: number | null }>();

    const { data: written, error } = await admin
      .from("rate_general")
      .upsert(
        {
          ...(existing?.id ? { id: existing.id } : {}),
          customer_group:   d.customer_group,
          source_warehouse: d.source_warehouse,
          transport_type:   d.transport_type,
          product_type:     d.product_type,
          basis:            d.basis,
          tier1:            d.tier1,
          tier2:            d.tier2,
          tier3:            d.tier3,
          admin_id_update:  adminId,
        },
        { onConflict: "customer_group,source_warehouse,transport_type,product_type,basis" },
      )
      .select("id")
      .single<{ id: string }>();
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, existing ? "rate_general.update" : "rate_general.insert", "rate_general", written.id, {
      key: {
        customer_group:   d.customer_group,
        source_warehouse: d.source_warehouse,
        transport_type:   d.transport_type,
        product_type:     d.product_type,
        basis:            d.basis,
      },
      before: existing ? { tier1: existing.tier1, tier2: existing.tier2, tier3: existing.tier3 } : null,
      after:  { tier1: d.tier1, tier2: d.tier2, tier3: d.tier3 },
    });

    revalidatePath("/admin/rates");
    revalidatePath("/admin/rates/general");
    return { ok: true, data: { id: written.id, created: !existing } };
  });
}

const deleteGeneralRateSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteGeneralRateInput = z.infer<typeof deleteGeneralRateSchema>;

export async function adminDeleteGeneralRate(
  input: DeleteGeneralRateInput,
): Promise<AdminActionResult<{ id: string }>> {
  const parsed = deleteGeneralRateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ id: string }>(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Audit the full row before deletion so we can reconstruct if needed.
    const { data: before } = await admin
      .from("rate_general")
      .select("customer_group, source_warehouse, transport_type, product_type, basis, tier1, tier2, tier3")
      .eq("id", d.id)
      .maybeSingle();
    if (!before) return { ok: false, error: "not_found" };

    const { error } = await admin.from("rate_general").delete().eq("id", d.id);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminId, "rate_general.delete", "rate_general", d.id, { before });

    revalidatePath("/admin/rates");
    revalidatePath("/admin/rates/general");
    return { ok: true, data: { id: d.id } };
  });
}

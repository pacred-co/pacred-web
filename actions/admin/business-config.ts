"use server";

/**
 * G-10 · Admin server action — update a business_config row.
 *
 * Super only (super-only gate via withAdmin(["super"])). Validates the
 * value against the row's declared value_type before writing. Audit
 * logs before/after under action='business_config.update'.
 *
 * The "list all keys" read happens directly in the page via
 * listAllBusinessConfig() — that's a read, no action needed.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  setBusinessConfig,
  type BusinessConfigValueType,
} from "@/lib/business-config";
import { createAdminClient } from "@/lib/supabase/admin";

// ════════════════════════════════════════════════════════════
// Per-type value validation
// ════════════════════════════════════════════════════════════
// The row carries a declared value_type. We validate the incoming
// value against that type BEFORE writing so the editor can't slip a
// string into a number column, etc.

function validateForType(
  type: BusinessConfigValueType,
  value: unknown,
): { ok: true; coerced: unknown } | { ok: false; error: string } {
  switch (type) {
    case "number":
    case "currency_thb":
    case "duration_ms": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: `expected_number` };
      if ((type === "currency_thb" || type === "duration_ms") && n < 0) {
        return { ok: false, error: `${type}_must_be_non_negative` };
      }
      return { ok: true, coerced: n };
    }
    case "percent": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return { ok: false, error: "expected_number" };
      if (n < 0 || n > 100) return { ok: false, error: "percent_out_of_range_0_100" };
      return { ok: true, coerced: n };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, coerced: value };
      // Tolerate "true"/"false" strings from form-style inputs.
      if (value === "true")  return { ok: true, coerced: true };
      if (value === "false") return { ok: true, coerced: false };
      return { ok: false, error: "expected_boolean" };
    }
    case "string": {
      if (typeof value !== "string") return { ok: false, error: "expected_string" };
      if (value.length > 5000) return { ok: false, error: "string_too_long" };
      return { ok: true, coerced: value };
    }
    case "json": {
      // value already came across as JSON (jsonb roundtrip from the
      // admin client). Just sanity-check it serializes.
      try {
        JSON.stringify(value);
        return { ok: true, coerced: value };
      } catch {
        return { ok: false, error: "expected_serializable_json" };
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// adminUpdateBusinessConfig
// ════════════════════════════════════════════════════════════

const updateSchema = z.object({
  key:   z.string().trim().min(1).max(200),
  value: z.unknown(),
});
export type AdminUpdateBusinessConfigInput = z.infer<typeof updateSchema>;

type UpdateData = {
  key:      string;
  before:   unknown;
  after:    unknown;
};

export async function adminUpdateBusinessConfig(
  input: AdminUpdateBusinessConfigInput,
): Promise<AdminActionResult<UpdateData>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<UpdateData>(["super"], async ({ adminId }) => {
    // Look up the row's declared type so we can validate the value.
    const admin = createAdminClient();
    const { data: existing, error: readErr } = await admin
      .from("business_config")
      .select("key, value_type")
      .eq("key", d.key)
      .maybeSingle<{ key: string; value_type: BusinessConfigValueType }>();
    if (readErr) return { ok: false, error: readErr.message };
    if (!existing) return { ok: false, error: "unknown_key" };

    const validated = validateForType(existing.value_type, d.value);
    if (!validated.ok) {
      return { ok: false, error: `invalid_value:${validated.error}` };
    }

    let beforeValue: unknown;
    try {
      const result = await setBusinessConfig(d.key, validated.coerced, adminId);
      beforeValue = result.before;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "set_failed" };
    }

    await logAdminAction(adminId, "business_config.update", "business_config", d.key, {
      before: beforeValue,
      after:  validated.coerced,
      value_type: existing.value_type,
    });

    revalidatePath("/admin/settings/business-config");

    return {
      ok: true,
      data: { key: d.key, before: beforeValue, after: validated.coerced },
    };
  });
}

/**
 * G-10 · Business config — single source of truth for admin-editable
 * constants (OTP TTL, wallet min/max, cashback %, bank list, feature
 * flags, …).
 *
 * ── Config homes (ADR-0024 — the canonical rule · do NOT add a 4th) ──
 *   • tb_settings      → everything the LIVE pricing engine reads:
 *                        yuan rates (rpdefault/rsdefault/hratecostdefault),
 *                        free-shipping (freeshipping 1/2), the 144-col
 *                        partner-cost matrix. Editors: /admin/settings/
 *                        legacy-rates + /admin/settings/forwarder-costs.
 *   • business_config  → THIS file: Pacred-native + non-pricing config —
 *                        tax (WHT/VAT), OTP, wallet limits, cashback %,
 *                        banks, feature flags. Editor: /admin/settings/
 *                        business-config. Uncontested + canonical.
 *   • rebuilt `settings` → NOT a canonical home for any contested field
 *                        (ADR-0024 D-2). Its only live reader is the
 *                        low-data rebuilt forwarder lane (service-import/
 *                        add). /admin/settings is now a read-through hub.
 *   The pricing rate cards live on tb_rate_* (ADR-0017), out of scope here.
 *
 * Read path:    getBusinessConfig(key, defaultValue)  — 60s in-memory
 *               cache. Falls back to defaultValue on miss/error so the
 *               system never breaks on an unseeded row.
 *
 * Write path:   setBusinessConfig(key, value, adminId) — service-role
 *               write + cache invalidation. Called from
 *               actions/admin/business-config.ts adminUpdateBusinessConfig
 *               (super only, with audit + before/after).
 *
 * Adoption strategy: call sites that today read code constants can
 * progressively migrate to getBusinessConfig(key, CURRENT_CONSTANT) —
 * the seeded defaults match today's behaviour so adoption is a no-op
 * until an admin actually changes a value.
 *
 * Server-only — never import from a Client Component.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Allowed types for the value_type column / editor. */
export const BUSINESS_CONFIG_VALUE_TYPES = [
  "number",
  "string",
  "boolean",
  "json",
  "currency_thb",
  "percent",
  "duration_ms",
] as const;
export type BusinessConfigValueType = (typeof BUSINESS_CONFIG_VALUE_TYPES)[number];

export type BusinessConfigRow = {
  key:                 string;
  value:               unknown;                     // parsed jsonb
  value_type:          BusinessConfigValueType;
  category:            string | null;
  description:         string | null;
  updated_by_admin_id: string | null;
  updated_at:          string;
  created_at:          string;
};

// ════════════════════════════════════════════════════════════
// In-memory cache — 60 second TTL, per-key.
// ════════════════════════════════════════════════════════════
// Node module singleton holds the cache. Vercel serverless cold-starts
// reset it, which is fine — the cache is a perf hint, not correctness.
// Cache stores the raw jsonb-parsed value (or `undefined` for known-
// missing keys, so repeated misses don't re-query the DB every time).

type CacheEntry = { value: unknown; expiresAt: number };
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Drop a single key from the cache. Called after a successful write. */
export function invalidateBusinessConfig(key: string): void {
  cache.delete(key);
}

/** Drop the entire cache. Useful for tests + bulk admin imports. */
export function invalidateAllBusinessConfig(): void {
  cache.clear();
}

// ════════════════════════════════════════════════════════════
// READ — getBusinessConfig
// ════════════════════════════════════════════════════════════

/**
 * Read a business config value. Returns the typed value or
 * `defaultValue` on any failure (key missing, DB unreachable, value
 * cannot be coerced to the requested shape).
 *
 * The defaultValue is REQUIRED — it pins the type T at the call site
 * AND guarantees the call never returns undefined. The seed-then-
 * migrate pattern means most early callers will pass the existing
 * code constant; later, the table becomes authoritative + the
 * default becomes a safety net.
 *
 *   // number
 *   const ttlMs = await getBusinessConfig<number>("otp.ttl_ms", 5 * 60 * 1000);
 *
 *   // boolean feature flag
 *   const liff = await getBusinessConfig<boolean>("features.liff_enabled", false);
 *
 *   // json (typed by caller)
 *   const accts = await getBusinessConfig<Array<{bank:string;account_no:string}>>(
 *     "banks.deposit_accounts", []
 *   );
 */
export async function getBusinessConfig<T>(
  key: string,
  defaultValue: T,
): Promise<T> {
  // Cache hit (positive OR negative).
  const cached = cacheGet(key);
  if (cached) {
    return cached.value === undefined ? defaultValue : (cached.value as T);
  }

  let value: unknown;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("business_config")
      .select("value")
      .eq("key", key)
      .maybeSingle<{ value: unknown }>();
    if (error || !data) {
      // Cache the miss for the TTL window so we don't hit the DB every
      // request when the key isn't seeded yet.
      cacheSet(key, undefined);
      return defaultValue;
    }
    value = data.value;
  } catch {
    // DB unreachable — don't cache the failure (next call should retry),
    // just return the default.
    return defaultValue;
  }

  cacheSet(key, value);
  return value === null || value === undefined ? defaultValue : (value as T);
}

// ════════════════════════════════════════════════════════════
// WRITE — setBusinessConfig
// ════════════════════════════════════════════════════════════

/**
 * Upsert a business config value. Returns the previous (BEFORE) raw
 * value or `undefined` if the row didn't exist. The caller
 * (adminUpdateBusinessConfig) uses this for the audit before/after
 * payload.
 *
 * NOTE: this helper has NO auth check — it is intended to be called
 * from inside a withAdmin(["super"]) wrapper. Don't call it from
 * customer-facing code.
 */
export async function setBusinessConfig(
  key: string,
  value: unknown,
  adminId: string,
): Promise<{ before: unknown | undefined; row: BusinessConfigRow }> {
  const admin = createAdminClient();

  // 1. Read existing (for the audit before-image).
  const { data: existing, error: existingErr } = await admin
    .from("business_config")
    .select("value, value_type, category, description, created_at")
    .eq("key", key)
    .maybeSingle<{
      value: unknown;
      value_type: BusinessConfigValueType;
      category: string | null;
      description: string | null;
      created_at: string;
    }>();

  if (existingErr) {
    console.error(`[business_config lookup] failed`, { code: existingErr.code, message: existingErr.message, details: existingErr.details, hint: existingErr.hint });
    throw new Error(`Failed to load business_config (${existingErr.code ?? "unknown"}): ${existingErr.message}`);
  }
  if (!existing) {
    // Refuse to create new keys via this path — schema-by-migration.
    // The admin UI lets you edit known keys, not invent new ones.
    throw new Error(`unknown_business_config_key:${key}`);
  }

  // 2. Update — only value + updated_by + updated_at. value_type,
  //    category, description are migration-managed (immutable in UI).
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("business_config")
    .update({
      value,
      updated_by_admin_id: adminId,
      updated_at:          nowIso,
    })
    .eq("key", key)
    .select("key, value, value_type, category, description, updated_by_admin_id, updated_at, created_at")
    .single<BusinessConfigRow>();

  if (updErr) {
    throw new Error(`set_business_config_failed:${updErr.message}`);
  }

  // 3. Invalidate the cache so the next read sees the new value.
  invalidateBusinessConfig(key);

  return { before: existing.value, row: updated };
}

// ════════════════════════════════════════════════════════════
// LIST — listAllBusinessConfig (admin UI)
// ════════════════════════════════════════════════════════════

/**
 * Read every row (admin UI). NOT cached — the admin page wants a
 * fresh view after every edit. Sorted by category then key for
 * stable tab rendering.
 */
export async function listAllBusinessConfig(): Promise<BusinessConfigRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("business_config")
    .select("key, value, value_type, category, description, updated_by_admin_id, updated_at, created_at")
    .order("category", { ascending: true, nullsFirst: false })
    .order("key", { ascending: true });
  if (error) {
    console.error(`[business_config list] failed`, { code: error.code, message: error.message });
  }
  return (data ?? []) as BusinessConfigRow[];
}

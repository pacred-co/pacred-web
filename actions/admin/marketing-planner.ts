"use server";

/**
 * Server actions for the Content Marketing Planner (ปอน 2026-07-01).
 * Persists to Supabase mkt_* tables (migration 0236). One row per entity
 * (id + jsonb). saveMarketing is UPSERT-ONLY (multi-user safe — never deletes
 * another user's rows); deletes are explicit via deleteMarketingRow.
 *
 * All actions gate on requireAdmin and use the service-role client (RLS is
 * defense-in-depth for direct/anon access).
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlannerData, ProductionTargets } from "@/lib/marketing-planner/types";
import { buildSeed, DEFAULT_TARGETS } from "@/lib/marketing-planner/seed";

const ROLES = ["super", "ultra", "manager", "sales_admin", "sales", "ops"] as const;

export type MarketingTable = "mkt_settings" | "mkt_contents" | "mkt_jobs" | "mkt_keywords";

type Admin = ReturnType<typeof createAdminClient>;

async function upsertRows(admin: Admin, table: string, items: { id: string }[]): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();
  const rows = items.map((x) => ({ id: x.id, data: x, updated_at: now }));
  const { error } = await admin.from(table).upsert(rows, { onConflict: "id" });
  if (error) console.error(`[marketing] upsert ${table} failed`, { message: error.message });
}

async function writeAll(admin: Admin, data: PlannerData): Promise<void> {
  await Promise.all([
    upsertRows(admin, "mkt_settings", data.settings),
    upsertRows(admin, "mkt_contents", data.contents),
    upsertRows(admin, "mkt_keywords", data.keywords ?? []),
    upsertRows(admin, "mkt_jobs", data.jobs ?? []),
    admin.from("mkt_targets").upsert({ id: "default", data: data.targets ?? null, updated_at: new Date().toISOString() }, { onConflict: "id" }),
  ]);
}

/** Read the whole planner. Bootstraps with the seed on first run (empty DB). */
export async function loadMarketing(): Promise<PlannerData> {
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();
  const [s, c, t, j, k] = await Promise.all([
    admin.from("mkt_settings").select("data"),
    admin.from("mkt_contents").select("data"),
    admin.from("mkt_targets").select("data").eq("id", "default").maybeSingle(),
    admin.from("mkt_jobs").select("data"),
    admin.from("mkt_keywords").select("data"),
  ]);

  // Surface a real DB error instead of silently returning an empty planner (which
  // would render every dropdown/setting blank + look like data loss). A transient
  // error → the page shows an error boundary; reload recovers.
  if (s.error) throw new Error(`[marketing] load settings failed: ${s.error.message}`);
  const settings = (s.data ?? []).map((r) => r.data);
  if (settings.length === 0) {
    const seed = buildSeed();
    await writeAll(admin, seed);
    return seed;
  }

  const seed = buildSeed();
  const loaded: ProductionTargets = (t.data?.data as ProductionTargets | null) ?? DEFAULT_TARGETS;
  return {
    version: seed.version,
    settings,
    contents: (c.data ?? []).map((r) => r.data),
    // Normalize: บทความ/โพสต์ ยืนพื้น 3/วัน even if an older targets row predates them
    // (a stale client can save the row back without these fields — self-heal on load).
    targets: { ...loaded, articlePerDay: loaded.articlePerDay ?? 3, postPerDay: loaded.postPerDay ?? 3 },
    jobs: (j.data ?? []).map((r) => r.data),
    keywords: (k.data ?? []).map((r) => r.data),
  };
}

/** Persist the whole planner (upsert-only). Called fire-and-forget after every mutation. */
export async function saveMarketing(data: PlannerData): Promise<void> {
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();
  await writeAll(admin, data);
}

/** Explicit delete of one row (the only path that removes data). */
export async function deleteMarketingRow(table: MarketingTable, id: string): Promise<void> {
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();
  const { error } = await admin.from(table).delete().eq("id", id);
  if (error) console.error(`[marketing] delete ${table}/${id} failed`, { message: error.message });
}

/** Wipe everything + re-seed. Returns the fresh seed for the client to adopt. */
export async function resetMarketing(): Promise<PlannerData> {
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();
  await Promise.all([
    admin.from("mkt_settings").delete().neq("id", "__never__"),
    admin.from("mkt_contents").delete().neq("id", "__never__"),
    admin.from("mkt_keywords").delete().neq("id", "__never__"),
    admin.from("mkt_jobs").delete().neq("id", "__never__"),
    admin.from("mkt_targets").delete().neq("id", "__never__"),
  ]);
  const seed = buildSeed();
  await writeAll(admin, seed);
  return seed;
}

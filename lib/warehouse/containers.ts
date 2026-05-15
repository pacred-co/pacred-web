/**
 * Container DB client (T-P2 / CT-2).
 *
 * Server-only typed wrappers around `containers` + `container_status_history`.
 * Used by:
 *   - `actions/admin/warehouse.ts` (admin UI mutations)
 *   - future `app/api/cron/momo-jmf-sync/route.ts` (CT-5, blocked on ก๊อต)
 *   - future `app/api/webhooks/momo-jmf/route.ts` (CT-6, blocked on ก๊อต)
 *
 * Patterns:
 *   - Always log container_status_history when status changes (caller can
 *     pass `changedByAdmin` for the audit fingerprint).
 *   - `upsertContainerByCode` is idempotent — same code returns existing
 *     row if present, insert if not. Used by both UI ("create container")
 *     and MOMO sync ("partner sent us a container we haven't seen").
 *   - All status checks delegated to DB — the schema CHECK accepts both
 *     0016 phase-H and 0033 spine values per the union from migration
 *     fix `bf7acf8`.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildContainerCode } from "./code-gen";
import type {
  Container,
  ContainerInsert,
  ContainerSource,
  ContainerStatus,
  ContainerStatusSpine,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// READ
// ────────────────────────────────────────────────────────────

export async function getContainerById(
  admin: SupabaseClient,
  id: string,
): Promise<Result<Container | null>> {
  const { data, error } = await admin
    .from("cargo_containers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Container>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export async function getContainerByCode(
  admin: SupabaseClient,
  code: string,
): Promise<Result<Container | null>> {
  const { data, error } = await admin
    .from("cargo_containers")
    .select("*")
    .eq("code", code)
    .maybeSingle<Container>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export type ListContainersFilter = {
  status?:         ContainerStatus | ContainerStatus[];
  transportMode?:  string;
  source?:         ContainerSource;
  /** Optional substring match against `code` (case-insensitive). */
  codeContains?:   string;
  /** Default 50; max 200. */
  limit?:          number;
};

export async function listContainers(
  admin: SupabaseClient,
  filter: ListContainersFilter = {},
): Promise<Result<Container[]>> {
  let q = admin
    .from("cargo_containers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(filter.limit ?? 50, 200));

  if (filter.status) {
    q = Array.isArray(filter.status) ? q.in("status", filter.status) : q.eq("status", filter.status);
  }
  if (filter.transportMode) q = q.eq("transport_mode", filter.transportMode);
  if (filter.source)        q = q.eq("source", filter.source);
  if (filter.codeContains)  q = q.ilike("code", `%${filter.codeContains}%`);

  const { data, error } = await q.returns<Container[]>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

// ────────────────────────────────────────────────────────────
// WRITE — create / upsert
// ────────────────────────────────────────────────────────────

/**
 * Build a globally-unique container code by polling the next-sequence
 * for the (originPrefix, date) tuple.  Cheap because containers/day per
 * origin is small (single digits typical).
 *
 * Race-safe enough for the small Pacred volume — if two concurrent
 * inserts pick the same code, the unique index rejects one and the
 * caller can retry.
 */
async function nextCodeForOrigin(
  admin: SupabaseClient,
  origin: string,
  date: Date,
): Promise<string> {
  // Find existing codes for today's prefix, increment max seq.
  const trial = buildContainerCode({ origin, date, seq: 1 });
  const prefix = trial.split("-")[0]; // "GZ260516"
  const { data } = await admin
    .from("cargo_containers")
    .select("code")
    .like("code", `${prefix}-%`);

  const used = ((data ?? []) as Array<{ code: string | null }>)
    .map((r) => Number(r.code?.split("-")[1] ?? 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return buildContainerCode({ origin, date, seq: next });
}

export async function createContainer(
  admin: SupabaseClient,
  input: ContainerInsert,
): Promise<Result<Container>> {
  const code = input.code ?? (await nextCodeForOrigin(admin, input.origin ?? "XX", new Date()));
  const { data, error } = await admin
    .from("cargo_containers")
    .insert({
      code,
      transport_mode:  input.transport_mode,
      origin:          input.origin,
      destination:     input.destination,
      status:          input.status ?? "packing",
      eta:             input.eta ?? null,
      source:          input.source,
      total_boxes:     input.total_boxes     ?? 0,
      total_weight_kg: input.total_weight_kg ?? 0,
      total_cbm:       input.total_cbm       ?? 0,
    })
    .select("*")
    .single<Container>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Insert if code doesn't exist; return existing row if it does.
 * MOMO sync uses this so partner-sent containers get registered without
 * tripping the unique constraint.
 */
export async function upsertContainerByCode(
  admin: SupabaseClient,
  input: ContainerInsert & { code: string },
): Promise<Result<Container>> {
  const existing = await getContainerByCode(admin, input.code);
  if (!existing.ok) return existing;
  if (existing.data) return { ok: true, data: existing.data };
  return createContainer(admin, input);
}

// ────────────────────────────────────────────────────────────
// WRITE — status transition (logged to history)
// ────────────────────────────────────────────────────────────

export async function setContainerStatus(
  admin: SupabaseClient,
  containerId: string,
  toStatus: ContainerStatusSpine,
  opts: {
    changedByAdmin?: string;
    note?:           string;
    source?:         "pacred" | "momo" | "self";
  } = {},
): Promise<Result<Container>> {
  const before = await getContainerById(admin, containerId);
  if (!before.ok)      return before;
  if (!before.data)    return { ok: false, error: "container_not_found" };
  if (before.data.status === toStatus) return { ok: true, data: before.data };

  // Stamp the matching timestamp column when transitioning to a state
  // the schema has a column for (packed_at / sealed_at / actual_arrival).
  const update: Record<string, unknown> = { status: toStatus };
  const nowIso = new Date().toISOString();
  if (toStatus === "packing"   && !before.data.packed_at)      update.packed_at      = nowIso;
  if (toStatus === "sealed"    && !before.data.sealed_at)      update.sealed_at      = nowIso;
  if (toStatus === "arrived"   && !before.data.actual_arrival) update.actual_arrival = nowIso;

  const { data, error } = await admin
    .from("cargo_containers")
    .update(update)
    .eq("id", containerId)
    .select("*")
    .single<Container>();
  if (error) return { ok: false, error: error.message };

  // Audit log — fire-and-forget; if it fails the status update still
  // stuck. Caller can replay history reconstruction from updated_at if
  // needed.
  await admin.from("cargo_container_status_history").insert({
    cargo_container_id: containerId,
    from_status:        before.data.status,
    to_status:        toStatus,
    note:             opts.note ?? null,
    changed_by_admin: opts.changedByAdmin ?? null,
    source:           opts.source ?? "pacred",
  });

  return { ok: true, data };
}

/**
 * Refresh the denorm cache columns (total_boxes / total_weight_kg /
 * total_cbm) by re-summing this container's shipments.  Call after bulk
 * shipment edits so the list view stays accurate.
 */
export async function refreshContainerTotals(
  admin: SupabaseClient,
  containerId: string,
): Promise<Result<Container>> {
  const { data: ships, error: sErr } = await admin
    .from("cargo_shipments")
    .select("box_count, weight_kg, volume_cbm")
    .eq("cargo_container_id", containerId);
  if (sErr) return { ok: false, error: sErr.message };

  type SRow = { box_count: number | null; weight_kg: number | null; volume_cbm: number | null };
  const rows = (ships ?? []) as SRow[];
  const total_boxes     = rows.reduce((s, r) => s + Number(r.box_count  ?? 0), 0);
  const total_weight_kg = rows.reduce((s, r) => s + Number(r.weight_kg  ?? 0), 0);
  const total_cbm       = rows.reduce((s, r) => s + Number(r.volume_cbm ?? 0), 0);

  const { data, error } = await admin
    .from("cargo_containers")
    .update({ total_boxes, total_weight_kg, total_cbm })
    .eq("id", containerId)
    .select("*")
    .single<Container>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * PCS↔Pacred sync — per-row merger.
 *
 * Takes one row from `pacred-sync.php` and applies it to our `tb_forwarder`
 * using a 3-tier conflict policy. See spec at the top of the module.
 *
 * Conflict policy (CRITICAL):
 *   - PCS WINS for staff-driven fields:
 *       fcabinetnumber, fstatus, fdatestatus3..7, fdriverid,
 *       fnotedriver, ftrackingth, adminidupdate
 *   - MOMO WINS for warehouse fields (Pacred-non-null protected):
 *       fwarehousename, fdatecontainerclose
 *       (do NOT overwrite when Pacred has a non-null value — MOMO may
 *        have set it more authoritatively)
 *   - BOTH UPDATE for dimensions:
 *       fweight, fvolume, famount
 *       (we don't have last_modified — just take PCS's value)
 *
 * Matching: by `tb_forwarder.id` only. If the row doesn't exist locally,
 * we skip (DON'T create — Pacred uses a separate sequence).
 *
 * Per AGENTS.md §0c, every Supabase query destructures `error`.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PcsRow } from "./client";

// ────────────────────────────────────────────────────────────────
// Result
// ────────────────────────────────────────────────────────────────

export type MergeAction = "upsert" | "skip" | "error";

export type MergeResult = {
  action: MergeAction;
  /** Why it was skipped/errored — for the dashboard. */
  reason?: string;
  /** Echo of the row id for logging. */
  id:     number;
};

// ────────────────────────────────────────────────────────────────
// Field policy
// ────────────────────────────────────────────────────────────────

/** PCS overwrites Pacred unconditionally. */
const PCS_WINS = [
  "fcabinetnumber",
  "fstatus",
  "fdatestatus3",
  "fdatestatus4",
  "fdatestatus5",
  "fdatestatus6",
  "fdatestatus7",
  "fdriverid",
  "fnotedriver",
  "ftrackingth",
  "adminidupdate",
] as const;

/** PCS overwrites ONLY when Pacred's value is null/empty. */
const MOMO_PROTECTED = [
  "fwarehousename",
  "fdatecontainerclose",
] as const;

/** Both sides update — PCS wins on tie (we just take PCS's value). */
const BOTH_UPDATE = [
  "fweight",
  "fvolume",
  "famount",
] as const;

// All managed columns we read from Pacred for the MOMO-protected branch.
const PACRED_READ_COLS = [
  "id",
  ...MOMO_PROTECTED,
].join(", ");

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

/** Pick `key` from `row` only when PCS sent a defined (incl. null) value.
 *  This lets PCS clear a field by sending `null`, but a missing key is
 *  treated as "no change". */
function takeIfPresent<K extends keyof PcsRow>(
  out: Record<string, unknown>,
  row: PcsRow,
  key: K,
): void {
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    out[key as string] = row[key] ?? null;
  }
}

/** For dimension columns — coerce string-numbers to numbers, null otherwise. */
function takeNumericIfPresent<K extends keyof PcsRow>(
  out: Record<string, unknown>,
  row: PcsRow,
  key: K,
): void {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return;
  const v = row[key];
  if (v === null || v === undefined || v === "") {
    out[key as string] = null;
    return;
  }
  const n = Number(v);
  out[key as string] = Number.isFinite(n) ? n : null;
}

// ────────────────────────────────────────────────────────────────
// Main entry — apply one PCS row to tb_forwarder
// ────────────────────────────────────────────────────────────────

export async function applyPcsRowToTbForwarder(
  row: PcsRow,
  admin: SupabaseClient,
): Promise<MergeResult> {
  if (!row || typeof row.id !== "number" || !Number.isFinite(row.id)) {
    return { action: "error", reason: "invalid_id", id: row?.id ?? 0 };
  }
  const id = row.id;

  // ── 1. Look up the Pacred row — match by `id` only. ──
  //    (We need MOMO-protected fields to decide their branch.)
  const { data: existing, error: lookupErr } = await admin
    .from("tb_forwarder")
    .select(PACRED_READ_COLS)
    .eq("id", id)
    .maybeSingle();

  if (lookupErr) {
    console.error("[pcs-sync lookup] failed", {
      code:    lookupErr.code,
      message: lookupErr.message,
      id,
    });
    return { action: "error", reason: `lookup_failed:${lookupErr.code ?? "unknown"}`, id };
  }
  if (!existing) {
    // Per spec: Pacred has separate sequence — don't create from PCS.
    return { action: "skip", reason: "no_match", id };
  }

  // ── 2. Build the update patch per the conflict policy. ──
  const patch: Record<string, unknown> = {};

  // 2a. PCS wins unconditionally — every key present in the row gets
  //     written (even null clears).
  for (const key of PCS_WINS) {
    takeIfPresent(patch, row, key);
  }

  // 2b. Dimension columns — PCS wins (string-numbers coerced).
  for (const key of BOTH_UPDATE) {
    takeNumericIfPresent(patch, row, key);
  }

  // 2c. MOMO-protected: only overwrite when Pacred's value is null/empty.
  const existingRec = existing as unknown as Record<string, unknown>;
  for (const key of MOMO_PROTECTED) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const pacredVal = existingRec[key];
    if (isNonEmpty(pacredVal)) {
      // Pacred has a value — keep it. PCS doesn't get to clobber.
      continue;
    }
    patch[key] = row[key] ?? null;
  }

  // No-op? Pacred row exists but PCS sent only fields we already protected.
  if (Object.keys(patch).length === 0) {
    return { action: "skip", reason: "no_writable_fields", id };
  }

  // ── 3. Apply patch. ──
  const { error: updateErr } = await admin
    .from("tb_forwarder")
    .update(patch)
    .eq("id", id);

  if (updateErr) {
    console.error("[pcs-sync update] failed", {
      code:    updateErr.code,
      message: updateErr.message,
      id,
      fieldsWritten: Object.keys(patch),
    });
    return { action: "error", reason: `update_failed:${updateErr.code ?? "unknown"}`, id };
  }

  return { action: "upsert", id };
}

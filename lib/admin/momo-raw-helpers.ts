/**
 * Wave 30.5 — pure MOMO-raw field derivations (NO `server-only`).
 *
 * WHY A SEPARATE MODULE
 * ─────────────────────
 * These two helpers translate a MOMO Status-Sync `raw` JSON blob into the
 * shape tb_forwarder needs (transport-type code + package metrics). They are
 * pure `(raw) → value` functions — no DB, no session, no side effects.
 *
 * They USED to live in `lib/admin/commit-momo-row-core.ts`, but that module
 * has `import "server-only"` at the top, which THROWS the moment it's loaded
 * under plain `tsx`/Node (the `server-only` package resolves its `default`
 * export condition → `index.js` throws). That makes anything in it
 * impossible to cover with a `tsx`-run unit test.
 *
 * So the pure logic lives HERE (no `server-only`), the core imports it, and
 * `momo-raw-helpers.test.ts` exercises it directly. The core keeps the
 * DB-touching commit body (which legitimately needs `server-only`).
 *
 * @see lib/admin/commit-momo-row-core.ts — the consumer (the commit body)
 * @see lib/admin/momo-raw-helpers.test.ts — the unit test for this module
 */

/**
 * Derive tb_forwarder.ftransporttype ("1"|"2") from MOMO's raw `ship_by`.
 *
 * MOMO ships use "car"/"ship"/"air" — legacy tb_forwarder.ftransporttype
 * uses "1" (truck/EK) or "2" (sea). Air is rare in cargo → bucket to "1".
 * Anything unrecognised (missing key, non-object, unknown string) → "1".
 */
export function deriveTransportTypeFromMomoRaw(raw: unknown): "1" | "2" {
  if (!raw || typeof raw !== "object") return "1";
  const r = raw as Record<string, unknown>;
  const shipBy = typeof r.ship_by === "string" ? r.ship_by.toLowerCase() : "";
  if (shipBy === "ship") return "2";
  return "1";
}

/** Package metrics extracted from a MOMO raw blob. */
export type MomoMetrics = {
  weight: number;
  cbm:    number;
  width:  number;
  length: number;
  height: number;
  qty:    number;
};

/**
 * Extract package metrics (kg, cbm, w/l/h, qty) from a MOMO raw blob.
 *
 * - Numbers pass through (when finite); numeric strings are coerced.
 * - Anything non-numeric → 0.
 * - qty floors at 1 and rounds (a forwarder row is at least one package).
 * - A null / non-object raw yields the zero-metrics default (qty 1).
 */
export function extractMetricsFromMomoRaw(raw: unknown): MomoMetrics {
  const empty: MomoMetrics = { weight: 0, cbm: 0, width: 0, length: 0, height: 0, qty: 1 };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };
  return {
    weight: num(r.kg),
    cbm:    num(r.cbm),
    width:  num(r.width),
    length: num(r.length),
    height: num(r.height),
    qty:    Math.max(1, Math.round(num(r.quantity))),
  };
}

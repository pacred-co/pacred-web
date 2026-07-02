/**
 * MOMO Live → tb_forwarder.fcabinetnumber (เลขตู้) fill — PURE decisions
 * (no DB · no "server-only"). Unit-tested in live-cabinet-plan.test.ts.
 *
 * WHY THIS EXISTS (owner ภูม 2026-07-02)
 * ──────────────────────────────────────
 * MOMO's OWN web (momocargo.com) shows the REAL container (เลขตู้) in its
 * "ตู้สินค้า" column — e.g. tracking YT7627510354625 → `GZS260626-1`. But
 * Pacred's tb_forwarder rows still carry only a routing-BATCH placeholder
 * (`PR20260624-SEA01`) + a sack (`CBX260624-SEA05`) because the commit path
 * wrote `container_batch_no ?? momo_container_no ?? ""` at commit time, and
 * for a not-yet-closed container `container_batch_no` was still null (so it
 * fell back to the routing-batch ID). MOMO already HAS the real container in
 * the Live scrape (`MomoLiveParcel.containerName`); this fills it in.
 *
 * 💰 MONEY-SAFETY — fcabinetnumber is NOT a bill-amount field, but report-cnt
 *    GROUPS tb_forwarder rows by it, so a bad write mis-groups a container.
 *    Hence:
 *   - FILL ONLY when the row's current cabinet is EMPTY or a routing-BATCH
 *     PLACEHOLDER (`isMomoRoutingPlaceholder`). NEVER overwrite an existing
 *     REAL container (GZS/GZE/GZA…) — แต้ม/staff/commit already got it right.
 *   - WRITE ONLY a REAL container (GZS/GZE/GZA…) — never write a routing-batch
 *     ID or a sack as the cabinet (that would just swap one placeholder for
 *     another). The Live `containerName` is validated with `isRealContainerCode`.
 *   - The writer additionally SKIPS billed rows (fstatus 5/6/7) and is
 *     TOCTOU-safe (see the writer in live-cabinet.ts).
 *
 * @see lib/integrations/momo-web/live-cabinet.ts        — the fill-when-placeholder writer
 * @see lib/admin/momo-container-resolve.ts               — isMomoRoutingPlaceholder (shared)
 * @see lib/forwarder/cabinet-transport.ts                — the GZS/GZE/GZA transport decode
 */

import type { MomoLiveParcel } from "./types";
import { isMomoRoutingPlaceholder } from "@/lib/admin/momo-container-resolve";

/**
 * A REAL container code = one that carries a GZ* transport token (GZS sea /
 * GZE road / GZA air), the same forms `cabinet-transport.ts` decodes. This is
 * deliberately STRICTER than "has any mode token": a routing-batch placeholder
 * like `PR20260624-SEA01` also contains "SEA", so we require the GZ* prefix so a
 * placeholder can never masquerade as a real container.
 *
 * Examples that PASS: GZS260626-1 · GZE2604-01 · GZA260601-AIR.
 * Examples that FAIL: PR20260624-SEA01 (routing batch) · CBX260624-SEA05 (sack)
 *   · "" · "SEA01".
 */
export function isRealContainerCode(code: string | null | undefined): boolean {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return false;
  // A routing-batch placeholder must NEVER count as real (defence-in-depth:
  // the GZ check below already excludes it, but be explicit).
  if (isMomoRoutingPlaceholder(c)) return false;
  return c.startsWith("GZS") || c.startsWith("GZE") || c.startsWith("GZA");
}

/** The outcome of deciding whether to fill a row's fcabinetnumber from Live. */
export type CabinetFillDecision = {
  /** True → write `liveContainer` into fcabinetnumber. */
  fill: boolean;
  /** Why not (for logging/testing) when fill is false; "" when fill is true. */
  reason:
    | ""
    | "live_not_real"       // the Live container isn't a real GZS/GZE/GZA code
    | "current_is_real"     // the row already has a real container → never overwrite
    | "current_same";       // the row already equals the Live container → no-op
};

/**
 * Decide whether to fill one tb_forwarder row's cabinet from the Live container.
 *
 * FILL when ALL hold:
 *   1. The Live container IS a real GZS/GZE/GZA code (`isRealContainerCode`).
 *   2. The row's current cabinet is EMPTY or a routing-BATCH placeholder
 *      (empty OR `isMomoRoutingPlaceholder`) — i.e. NOT already a real container.
 *   3. It differs from what's already there (skip an exact no-op).
 *
 * NEVER overwrites an existing REAL container (แต้ม/staff/commit authoritative).
 *
 * @param currentCabinet  tb_forwarder.fcabinetnumber (may be null / "" / placeholder / real)
 * @param liveContainer   MomoLiveParcel.containerName from the Live scrape
 */
export function decideCabinetFill(
  currentCabinet: string | null | undefined,
  liveContainer: string | null | undefined,
): CabinetFillDecision {
  const live = (liveContainer ?? "").trim();
  const cur = (currentCabinet ?? "").trim();

  // (1) only ever write a REAL container.
  if (!isRealContainerCode(live)) return { fill: false, reason: "live_not_real" };

  // (2) never overwrite an existing real container.
  if (isRealContainerCode(cur)) return { fill: false, reason: "current_is_real" };

  // (3) skip an exact no-op (current already equals the Live value — e.g. a
  //     previous fill). Compared case-insensitively to match the write.
  if (cur.toUpperCase() === live.toUpperCase()) return { fill: false, reason: "current_same" };

  // current is empty OR a routing-batch placeholder → fill with the real container.
  return { fill: true, reason: "" };
}

// ────────────────────────────────────────────────────────────────────────────
// วันปิดตู้ (container CLOSE DATE) — pairs with the container (owner ภูม 2026-07-02)
// ────────────────────────────────────────────────────────────────────────────

/**
 * The MOMO status_date phase whose timestamp = the container CLOSE point (ปิดตู้).
 * MOMO's per-parcel status_date carries a timestamp per phase; the container is
 * "closed to leave" at `prepare_export` (เตรียมออก/ขึ้นรอบ = TRUCK_CLOSED). If a
 * parcel skipped straight to `exported` (already left China) we use that instead
 * (the close necessarily happened by then). This matches container-journey.ts,
 * which treats fdatecontainerclose as the "ปิดตู้ · ออกจากจีน" stage. Order =
 * earliest-close-first (prefer the true close moment over the departure).
 */
const CLOSE_DATE_PHASES = ["prepare_export", "exported"] as const;

/**
 * Normalize a MOMO status_date value → "YYYY-MM-DD" (or null). SAME acceptance
 * rules as commit-momo-row-core.ts `cleanDate` so a Live fill and a commit write
 * the fdatecontainerclose column IDENTICALLY (bare date string · timestamp column
 * coerces to midnight). Rejects the legacy "0000-00-00" sentinels, non-date
 * strings, and impossible dates (2026-02-30). Exported for the writer + tests.
 */
export function cleanCloseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed === "0000-00-00" || trimmed === "0000-00-00 00:00:00") return null;
  const datePart = trimmed.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const probe = new Date(`${datePart}T00:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  if (probe.toISOString().slice(0, 10) !== datePart) return null;
  return datePart;
}

/**
 * Resolve the container CLOSE DATE ("YYYY-MM-DD") for a Live parcel from its
 * status_date — `prepare_export` (ปิดตู้) first, else `exported`. Returns null
 * when neither phase has a valid timestamp yet (the container hasn't closed on
 * MOMO's side → we DON'T invent a date). Read-only / pure.
 */
export function closeDateFromParcel(p: MomoLiveParcel): string | null {
  const sd = p.statusDate;
  if (!sd || typeof sd !== "object") return null;
  for (const key of CLOSE_DATE_PHASES) {
    const cleaned = cleanCloseDate((sd as Record<string, unknown>)[key]);
    if (cleaned) return cleaned;
  }
  return null;
}
